use actix_codec::Framed;
use actix_web::{web, App, HttpServer, HttpResponse, HttpRequest};

use awc::{body::MessageBody, ws::Codec, Client, ClientResponse, BoxedSocket, error::WsProtocolError};
use futures::{FutureExt, SinkExt, StreamExt};
use std::collections::HashMap;
use log::{info, error, debug, warn};

// Add WebSocket related imports
use actix_web_actors::ws;
use actix::{Actor, ActorContext, ActorFutureExt, AsyncContext, StreamHandler, WrapFuture};
use std::time::{Duration, Instant};
use awc::ws::{Frame, Message};
use std::pin::Pin;
use futures::Stream;

use crate::server::cors::cors_middleware;

// Define the city-to-port mapping
pub struct CityConfig {
    pub cities: HashMap<String, u16>,
    pub default_city: Option<String>,
}

impl CityConfig {
    pub fn new(city_ports: HashMap<String, u16>) -> Self {
        CityConfig {
            cities: city_ports,
            default_city: Some("toronto".to_string()),
        }
    }
    
    pub fn get_port(&self, city: &str) -> Option<u16> {
        self.cities.get(city).copied()
    }
}

// WebSocket proxy actor
struct WebSocketProxy {
    // Fix the type to properly separate sink and stream
    sink: Option<futures::stream::SplitSink<Framed<BoxedSocket, Codec>, Message>>,
    heartbeat: Instant,
    city: String,
    port: u16,
    path: String,
    query_string: String,
}

impl WebSocketProxy {
    fn new(city: String, port: u16, path: String, query_string: String) -> Self {
        WebSocketProxy {
            sink: None,
            heartbeat: Instant::now(),
            city,
            port,
            path,
            query_string,
        }
    }
    
    fn heartbeat(&self, ctx: &mut ws::WebsocketContext<Self>) {
        ctx.run_interval(Duration::from_secs(30), |act, ctx| {
            // Check client websocket timeout
            if Instant::now().duration_since(act.heartbeat) > Duration::from_secs(60) {
                info!("WebSocket client timeout, disconnecting");
                ctx.stop();
                return;
            }
            
            // Send ping to keep connection alive
            ctx.ping(b"");
        });
    }
}

impl Actor for WebSocketProxy {
    type Context = ws::WebsocketContext<Self>;
    
    fn started(&mut self, ctx: &mut Self::Context) {
        info!("WebSocket proxy started for city '{}' at port {}", self.city, self.port);
        
        // Start heartbeat
        self.heartbeat(ctx);
        
        // Build WebSocket target URL
        let ws_url = format!(
            "ws://127.0.0.1:{}{}{}",
            self.port, 
            self.path,
            if !self.query_string.is_empty() { format!("?{}", self.query_string) } else { String::new() }
        );
        
        info!("Connecting to WebSocket at: {}", ws_url);
        
        // Connect to target WebSocket
        let client = awc::Client::default();
        let req = client.ws(ws_url);
        
        // Add the X-Forwarded-City header
        let city_clone = self.city.clone();
        let req = req.header("X-Forwarded-City", city_clone);
        
        // Connect to the server WebSocket
        let fut = req.connect().map(move |res| res.ok());
        
        // Handle the future completion
        ctx.spawn(fut.into_actor(self).then(|res, act, ctx| {
            if let Some(connect_res) = res {
                // Split the connection into sink and stream
                let (sink, stream) = connect_res.1.split();
                act.sink = Some(sink);
                
                // Process messages coming from the server - properly return Result type
                ctx.add_stream(stream.map(|msg| -> Result<ws::Message, ws::ProtocolError> {
                    match msg {
                        Ok(Frame::Continuation(_)) => {
                            debug!("Received continuation frame from server, ignoring");
                            Ok(ws::Message::Nop)
                        }
                        Ok(Frame::Text(text)) => {
                            debug!("Received text from server, forwarding to client");
                            Ok(ws::Message::Text(String::from_utf8_lossy(&text).into_owned().into()))
                        }
                        Ok(Frame::Binary(bin)) => {
                            debug!("Received binary from server, forwarding to client");
                            Ok(ws::Message::Binary(bin))
                        }
                        Ok(Frame::Ping(msg)) => {
                            debug!("Received ping from server, forwarding to client");
                            Ok(ws::Message::Ping(msg))
                        }
                        Ok(Frame::Pong(msg)) => {
                            debug!("Received pong from server, updating heartbeat");
                            Ok(ws::Message::Pong(msg))
                        }
                        Ok(Frame::Close(reason)) => {
                            info!("Server closed WebSocket connection: {:?}", reason);
                            Ok(ws::Message::Close(reason))
                        }
                        Err(e) => {
                            error!("Error in WebSocket stream from server: {}", e);
                            // When there's an error from server, propagate to client
                            Err(ws::ProtocolError::Io(std::io::Error::new(
                                std::io::ErrorKind::Other,
                                format!("Server error: {}", e),
                            )))
                        }
                    }
                }));
                
                info!("WebSocket connection established with server");
            } else {
                error!("Failed to connect to target WebSocket");
                ctx.close(None);
                ctx.stop();
            }
            
            futures::future::ready(())
        }));
    }
    
    fn stopping(&mut self, _: &mut Self::Context) -> actix::Running {
        info!("WebSocket proxy stopping");
        actix::Running::Stop
    }
}

impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for WebSocketProxy {
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        // Handle messages from client
        match msg {
            Ok(ws::Message::Ping(msg)) => {
                debug!("Received ping from client");
                self.heartbeat = Instant::now();
                ctx.pong(&msg);
                
                // Forward ping to server if connected
                if let Some(sink) = &mut self.sink {
                    if let Err(e) = futures::executor::block_on(sink.send(Message::Ping(msg))) {
                        error!("Error forwarding ping to server: {}", e);
                    }
                }
            }
            Ok(ws::Message::Pong(msg)) => {
                debug!("Received pong from client");
                self.heartbeat = Instant::now();
                
                // Forward pong to server if connected
                if let Some(sink) = &mut self.sink {
                    if let Err(e) = futures::executor::block_on(sink.send(Message::Pong(msg))) {
                        error!("Error forwarding pong to server: {}", e);
                    }
                }
            }
            Ok(ws::Message::Text(text)) => {
                debug!("Received text message from client");
                self.heartbeat = Instant::now();
                
                // Forward text to server if connected
                if let Some(sink) = &mut self.sink {
                    if let Err(e) = futures::executor::block_on(sink.send(Message::Text(text.into()))) {
                        error!("Error forwarding text to server: {}", e);
                    }
                }
            }
            Ok(ws::Message::Binary(bin)) => {
                debug!("Received binary message from client");
                self.heartbeat = Instant::now();
                
                // Forward binary to server if connected
                if let Some(sink) = &mut self.sink {
                    if let Err(e) = futures::executor::block_on(sink.send(Message::Binary(bin))) {
                        error!("Error forwarding binary to server: {}", e);
                    }
                }
            }
            Ok(ws::Message::Close(reason)) => {
                info!("Client closed WebSocket connection: {:?}", reason);
                
                // Forward close to server if connected
                if let Some(sink) = &mut self.sink {
                    if let Err(e) = futures::executor::block_on(sink.send(Message::Close(reason.clone()))) {
                        error!("Error forwarding close message to server: {}", e);
                    }
                }
                
                ctx.close(reason);
                ctx.stop();
            }
            Ok(ws::Message::Continuation(_)) => {
                debug!("Received continuation frame from client");
                // Handle continuation frame if needed
            }
            Ok(ws::Message::Nop) => {
                debug!("Received Nop frame from client");
                // Handle Nop frame if needed
            }
            Err(e) => {
                error!("WebSocket protocol error from client: {}", e);
                ctx.stop();
            }
        }
    }
}

// Helper function to check if a request is a WebSocket upgrade request
fn is_websocket_request(req: &HttpRequest) -> bool {
    if let Some(upgrade) = req.headers().get("upgrade") {
        if upgrade.as_bytes().eq_ignore_ascii_case(b"websocket") {
            if let Some(connection) = req.headers().get("connection") {
                if connection.as_bytes().windows(b"upgrade".len()).any(|window| window.eq_ignore_ascii_case(b"upgrade")) {
                    if req.headers().contains_key("sec-websocket-key") {
                        return true;
                    }
                }
            }
        }
    }
    false
}

// Handle WebSocket connections
async fn websocket_proxy(
    req: HttpRequest, 
    stream: web::Payload,
    city: String,
    port: u16,
    path: String,
    query_string: String,
) -> Result<HttpResponse, actix_web::Error> {
    info!("Handling WebSocket request to city '{}' at path '{}'", city, path);
    
    let ws_proxy = WebSocketProxy::new(city, port, path, query_string);
    ws::start(ws_proxy, &req, stream)
}

// Main proxy handler that forwards requests to the appropriate city server
async fn proxy_handler(
    req: HttpRequest,
    payload: web::Payload,
    city_config: web::Data<CityConfig>,
) -> HttpResponse {
    let query_string = req.query_string();
    
    // Parse query string to extract city parameter
    let mut query_params: HashMap<String, String> = 
        url::form_urlencoded::parse(query_string.as_bytes())
            .into_owned()
            .collect();
    
    // Extract city parameter
    let city = match query_params.remove("city") {
        Some(city) => city,
        None => {
            warn!("City parameter not found in query string");
            // Use default city if available
            match &city_config.default_city {
                Some(default_city) => default_city.clone(),
                None => {
                    return HttpResponse::BadRequest().body(
                        "Missing city parameter and no default city configured"
                    );
                }
            }
        }
    };
    
    // Get port for the requested city
    let port = match city_config.get_port(&city) {
        Some(port) => port,
        None => {
            return HttpResponse::NotFound().body(format!("City '{}' not supported", city));
        }
    };
    
    // Check if this is a WebSocket connection request
    if is_websocket_request(&req) {
        info!("Detected WebSocket upgrade request for city '{}' at path '{}'", city, req.uri().path());
        
        // Rebuild query string without the city parameter
        let new_query_string = if !query_params.is_empty() {
            url::form_urlencoded::Serializer::new(String::new())
                .extend_pairs(query_params.iter())
                .finish()
        } else {
            String::new()
        };
        
        return match websocket_proxy(
            req.clone(), 
            payload, 
            city, 
            port,
            req.uri().path().to_string(),
            new_query_string,
        )
        .await {
            Ok(res) => res,
            Err(e) => {
                error!("Failed to establish WebSocket proxy: {:?}", e);
                HttpResponse::InternalServerError().body("WebSocket proxy error")
            }
        };
    }
    
    // For regular HTTP requests, continue with the existing logic
    // Rebuild query string without the city parameter
    let new_query_string = if !query_params.is_empty() {
        let new_qs = url::form_urlencoded::Serializer::new(String::new())
            .extend_pairs(query_params.iter())
            .finish();
        format!("?{}", new_qs)
    } else {
        String::new()
    };
    
    // Build the forwarding URL
    let path = req.uri().path();
    let forwarding_url = format!("http://127.0.0.1:{}{}{}", 
        port, 
        path, 
        new_query_string
    );
    
    info!("Proxying HTTP request to city '{}' at {}", city, forwarding_url);
    
    // Create a client for this request with increased payload limit
    let client = Client::default();
    
    // Create a new request with the same method
    let mut forwarded_req = client.request(
        req.method().clone(),
        &forwarding_url,
    );
    
    // Forward relevant headers
    for (header_name, header_value) in req.headers().iter().filter(|(h, _)| {
        // Filter out headers that should not be forwarded
        *h != "host" && *h != "connection"
    }) {
        if let Ok(value) = header_value.to_str() {
            forwarded_req = forwarded_req.insert_header((header_name.clone(), value));
        }
    }
    
    // Add city information as a custom header for debugging
    forwarded_req = forwarded_req.insert_header(("X-Forwarded-City", city.clone()));
    
    // Forward the request body
    let forwarded_req = forwarded_req.send_stream(payload);
    
    // Wait for response from city server
    match forwarded_req.await {
        Ok(mut res) => {
            let mut client_res = HttpResponse::build(res.status());
            
            // Copy headers from the city server response
            for (header_name, header_value) in res.headers().iter() {
                client_res.insert_header((header_name.clone(), header_value.clone()));
            }
            
            // Stream body from city server to client
            match res.body().limit(20 * 1024 * 1024).await {
                Ok(body) => client_res.body(body),
                Err(e) => {
                    error!("Failed to get response body: {}", e);
                    HttpResponse::InternalServerError().body(format!("Failed to get response body: {}", e))
                }
            }
        },
        Err(e) => {
            error!("Proxy request failed: {}", e);
            HttpResponse::InternalServerError().body(format!("Proxy request failed: {}", e))
        }
    }
}

// Start the proxy server
pub async fn start_proxy_server(host: &str, port: u16, city_ports: HashMap<String, u16>) -> std::io::Result<()> {
    let city_config = web::Data::new(CityConfig::new(city_ports));
    
    info!("Starting proxy server on {}:{}", host, port);
    
    HttpServer::new(move || {
        App::new()
            .wrap(cors_middleware())
            .app_data(city_config.clone())
            .app_data(web::PayloadConfig::new(20 * 1024 * 1024))  // 20MB payload limit for incoming requests
            .default_service(web::route().to(proxy_handler))
    })
    .bind(format!("{}:{}", host, port))?
    .run()
    .await
}
