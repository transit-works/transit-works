use actix_web::{web, App, HttpServer, HttpResponse, HttpRequest};
use awc::{body::MessageBody, Client};
use futures::{SinkExt, StreamExt};
use std::collections::HashMap;
use log::{info, error};

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
            log::warn!("City parameter not found in query string");
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
