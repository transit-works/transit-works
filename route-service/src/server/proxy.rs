use actix_codec::Framed;
use actix_web::{web, App, HttpServer, HttpResponse, HttpRequest};

use awc::{ws::Codec, Client, BoxedSocket};
use futures::{FutureExt, SinkExt, StreamExt};
use std::collections::HashMap;
use log::{debug, error, info, log_enabled, warn};

// Add WebSocket related imports
use actix_web_actors::ws;
use actix::{Actor, ActorContext, ActorFutureExt, AsyncContext, StreamHandler, WrapFuture, Addr, Context, Message as ActixMessage};
use std::time::{Duration, Instant};
use awc::ws::{Frame, Message};

use crate::server::cors::cors_middleware;

const MAX_PAYLOAD_SIZE: usize = 20 * 1024 * 1024;

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

// Define messages for internal actor communication
#[derive(ActixMessage)]
#[rtype(result = "()")]
enum InternalMessage {
    TextMessage(String),
    BinaryMessage(Vec<u8>),
    PingMessage(Vec<u8>),
    PongMessage(Vec<u8>),
    CloseMessage(Option<ws::CloseReason>),
}

// WebSocket proxy actor
struct WebSocketProxy {
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
                warn!("WebSocket client timeout, disconnecting");
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
        debug!("WebSocket proxy started for city '{}' at port {}", self.city, self.port);
        
        // Start heartbeat
        self.heartbeat(ctx);
        
        // Build WebSocket target URL
        let ws_url = format!(
            "ws://127.0.0.1:{}{}{}",
            self.port, 
            self.path,
            if !self.query_string.is_empty() { format!("?{}", self.query_string) } else { String::new() }
        );
        
        debug!("Connecting to WebSocket at: {}", ws_url);
        
        // Connect to target WebSocket
        let client = awc::Client::default();
            
        let req = client.ws(ws_url)
            .max_frame_size(MAX_PAYLOAD_SIZE);
        
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
                
                // Get the actor address to send messages back
                let addr = ctx.address();
                
                // Process messages coming from the server
                let stream_future = stream
                    .for_each(move |msg| {
                        match msg {
                            Ok(Frame::Continuation(_)) => {
                                debug!("Received continuation frame from server, ignoring");
                            }
                            Ok(Frame::Text(bytes)) => {
                                // Directly forward the exact bytes as a String to preserve JSON format
                                if let Ok(text) = String::from_utf8(bytes.to_vec()) {
                                    // check if log debug enabled
                                    if log_enabled!(log::Level::Debug) {
                                        debug!("Received text from server ({}B), forwarding to client", bytes.len());
                                        let preview = if text.len() > 100 {
                                            format!("{}... (truncated)", &text[..100])
                                        } else {
                                            text.clone()
                                        };
                                        debug!("Text preview: {}", preview);
                                    }
                                    // Send message to actor instead of using ctx directly
                                    addr.do_send(InternalMessage::TextMessage(text));
                                } else {
                                    error!("Invalid UTF-8 in server text message");
                                    // Try with lossy conversion as fallback
                                    let text = String::from_utf8_lossy(&bytes).into_owned();
                                    addr.do_send(InternalMessage::TextMessage(text));
                                }
                            }
                            Ok(Frame::Binary(bin)) => {
                                debug!("Received binary from server ({}B), forwarding to client", bin.len());
                                addr.do_send(InternalMessage::BinaryMessage(bin.to_vec()));
                            }
                            Ok(Frame::Ping(msg)) => {
                                debug!("Received ping from server, forwarding to client");
                                addr.do_send(InternalMessage::PingMessage(msg.to_vec()));
                            }
                            Ok(Frame::Pong(msg)) => {
                                debug!("Received pong from server");
                                addr.do_send(InternalMessage::PongMessage(msg.to_vec()));
                            }
                            Ok(Frame::Close(reason)) => {
                                debug!("Server closed WebSocket connection: {:?}", reason);
                                addr.do_send(InternalMessage::CloseMessage(reason));
                            }
                            Err(e) => {
                                error!("Error in WebSocket stream from server: {}", e);
                                addr.do_send(InternalMessage::CloseMessage(Some(ws::CloseReason {
                                    code: ws::CloseCode::Error,
                                    description: Some(format!("Server error: {}", e)),
                                })));
                            }
                        }
                        futures::future::ready(())
                    });
                
                // Spawn the forwarding future
                ctx.spawn(stream_future.into_actor(act));
                
                debug!("WebSocket connection established with server");
            } else {
                error!("Failed to connect to target WebSocket");
                ctx.close(None);
                ctx.stop();
            }
            
            futures::future::ready(())
        }));
    }
    
    fn stopping(&mut self, _: &mut Self::Context) -> actix::Running {
        debug!("WebSocket proxy stopping");
        actix::Running::Stop
    }
}

// Handle internal messages
impl actix::Handler<InternalMessage> for WebSocketProxy {
    type Result = ();

    fn handle(&mut self, msg: InternalMessage, ctx: &mut Self::Context) {
        match msg {
            InternalMessage::TextMessage(text) => {
                ctx.text(text);
            }
            InternalMessage::BinaryMessage(bin) => {
                ctx.binary(bin);
            }
            InternalMessage::PingMessage(bytes) => {
                ctx.ping(&bytes);
            }
            InternalMessage::PongMessage(bytes) => {
                ctx.pong(&bytes);
            }
            InternalMessage::CloseMessage(reason) => {
                ctx.close(reason);
                ctx.stop();
            }
        }
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
                debug!("Client closed WebSocket connection: {:?}", reason);
                
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
            }
            Ok(ws::Message::Nop) => {
                debug!("Received Nop frame from client");
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
    debug!("Handling WebSocket request to city '{}' at path '{}'", city, path);
    
    let ws_proxy = WebSocketProxy::new(city, port, path, query_string);

    ws::start(
        ws_proxy,
        &req,
        stream,
    )
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
            debug!("City parameter not found in query string");
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
        debug!("Detected WebSocket upgrade request for city '{}' at path '{}'", city, req.uri().path());
        
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
    
    debug!("Proxying HTTP request to city '{}' at {}", city, forwarding_url);
    
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
            match res.body().limit(MAX_PAYLOAD_SIZE).await {
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
    
    debug!("Starting proxy server on {}:{}", host, port);
    
    HttpServer::new(move || {
        App::new()
            .wrap(cors_middleware())
            .app_data(city_config.clone())
            .app_data(web::PayloadConfig::new(MAX_PAYLOAD_SIZE))  
            .app_data(web::JsonConfig::default().limit(MAX_PAYLOAD_SIZE)) 
            .default_service(web::route().to(proxy_handler))
    })
    .bind(format!("{}:{}", host, port))?
    .run()
    .await
}
