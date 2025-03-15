mod gtfs;
mod layers;
mod opt;
mod server;

use clap::Parser;
use server::server::start_server;
use server::proxy::start_proxy_server;
use std::collections::HashMap;
use futures::future::join_all;
use log::info;

/// Transit route optimization and evaluation service
#[derive(Parser, Debug)]
#[clap(author, version, about)]
struct Args {
    /// Path to GTFS data base directory
    #[clap(
        long,
        default_value = "/Users/jeevanopel/workspace/transit-works/scripts/city_data"
    )]
    gtfs_base_path: String,

    /// Path to database base directory
    #[clap(
        long,
        default_value = "/Users/jeevanopel/workspace/transit-works/scripts/city_db"
    )]
    db_base_path: String,

    /// Server host address
    #[clap(long, default_value = "127.0.0.1")]
    host: String,

    /// Proxy server port
    #[clap(long, default_value_t = 8080)]
    port: u16,

    /// Cities to start servers for (comma separated)
    #[clap(long, default_value = "toronto,sanfrancisco")]
    cities: String,
}

struct CityInfo {
    name: String,
    port: u16,
    gtfs_path: String,
    db_path: String,
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init();

    // Parse command line arguments
    let args = Args::parse();
    
    // Define city to port mappings
    let mut city_ports = HashMap::new();
    city_ports.insert("toronto".to_string(), 8081);
    city_ports.insert("sanfrancisco".to_string(), 8082);
    
    // Parse the cities from command line
    let cities: Vec<String> = args.cities
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    
    // Prepare city info for each configured city
    let city_servers: Vec<CityInfo> = cities
        .into_iter()
        .filter_map(|city| {
            city_ports.get(&city).map(|&port| {
                CityInfo {
                    name: city.clone(),
                    port,
                    gtfs_path: format!("{}/{}/gtfs", args.gtfs_base_path, city),
                    db_path: format!("{}/{}.db", args.db_base_path, city),
                }
            })
        })
        .collect();
    
    if city_servers.is_empty() {
        eprintln!("No valid cities configured. Exiting.");
        return Ok(());
    }
    
    info!("Starting city servers...");
    
    // Spawn a future for each city server
    let server_futures = city_servers.iter().map(|city| {
        let host = args.host.clone();
        let name = city.name.clone();
        let gtfs_path = city.gtfs_path.clone();
        let db_path = city.db_path.clone();
        let port = city.port;
        
        info!("Configuring server for city {} on port {}", name, port);
        
        actix_web::rt::spawn(async move {
            info!("Starting server for {} on port {}", name, port);
            if let Err(e) = start_server(&gtfs_path, &db_path, &host, port).await {
                eprintln!("Failed to start server for {}: {}", name, e);
            }
            Ok::<_, std::io::Error>(())
        })
    });
    
    // Start the proxy server
    info!("Starting proxy server on port {}", args.port);
    let proxy_host = args.host.clone();
    let proxy_port = args.port;
    let proxy_future = actix_web::rt::spawn(async move {
        start_proxy_server(&proxy_host, proxy_port, city_ports.clone()).await
    });
    
    // Combine all futures
    let mut all_futures = Vec::new();
    all_futures.extend(server_futures);
    all_futures.push(proxy_future);
    
    // Wait for all servers to complete (they normally shouldn't unless there's an error)
    let results = join_all(all_futures).await;
    
    // Check for any errors
    for result in results {
        if let Err(e) = result {
            eprintln!("Server task failed: {}", e);
        }
    }

    Ok(())
}
