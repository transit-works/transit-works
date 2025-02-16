use crate::gtfs::{geojson, gtfs::Gtfs};
use actix_web::{get, App, HttpResponse, HttpServer, Responder};
use std::net::SocketAddr;

const URL: &str = "127.0.0.1";
const PORT: u16 = 8080;

#[get("/get-data")]
async fn get_data() -> impl Responder {
    println!("Hello, world!");
    let gtfs =
        Gtfs::from_path("/Users/jeevanopel/workspace/transit-works/scripts/city_db/toronto.db")
            .unwrap();
    gtfs.print_stats();
    let features = geojson::get_all_features(&gtfs);
    println!("There are {} features", features.len());
    let geojson = geojson::convert_to_geojson(&features);
    println!("Generated GeoJSON");
    HttpResponse::Ok().json(geojson)
}

pub async fn start_server() -> std::io::Result<()> {
    let addr: SocketAddr = format!("{}:{}", URL, PORT)
        .parse()
        .expect("Invalid address format");

    HttpServer::new(|| App::new().service(get_data))
        .bind(addr)?
        .run()
        .await?;

    println!("Server started at {} on port {}.", URL, PORT);
    Ok(())
}
