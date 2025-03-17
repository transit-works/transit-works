use std::time::Instant;

use clap::Parser;

use route_service::gtfs::geojson;
use route_service::gtfs::gtfs::Gtfs;
use route_service::gtfs::structs::RouteType;
use route_service::layers::city::City;
use route_service::layers::{
    grid::GridNetwork, road_network::RoadNetwork, transit_network::TransitNetwork,
};
use route_service::opt::aco::ACO;
use route_service::opt::eval::{evaluate_coverage, evaluate_network_coverage};
use route_service::opt::ga_params::optimize_aco_params;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    #[arg(long)]
    gtfs_path: String,

    #[arg(long)]
    db_path: String,

    #[arg(long)]
    output_dir: String,

    #[arg(long)]
    suffix: Option<String>,
}

fn main() {
    env_logger::init();
    let args = Args::parse();

    let city =
        City::load_with_cached_transit("toronto", &args.gtfs_path, &args.db_path, true, false)
            .unwrap();

    output_geojson(&city.gtfs, &format!("{}/gtfs.geojson", args.output_dir));

    let target_routes = city
        .transit
        .routes
        .iter()
        .filter(|r| {
            r.route_id == "73094"
            // || r.route_id == "73705"
            // || r.route_id == "73688"
            // || r.route_id == "73682"
            // || r.route_id == "73770"
        })
        .collect::<Vec<_>>();

    // let res = evaluate_network_coverage(&transit, grid);

    let target_route = target_routes.first().unwrap();

    if let Some((params, fitness)) = optimize_aco_params(target_route, &city) {
        println!("Optimized params: ");
        params.print_stats();
        println!("Optimized fitness: {:?}", fitness);
    } else {
        println!("Failed to optimize params");
    }
}

// Convert TransitNetwork to GeoJSON
// GTFS is an intermediate format
fn output_routes_geojson(
    transit: &TransitNetwork,
    src_gtfs: &Gtfs,
    road: &RoadNetwork,
    path: &str,
) {
    println!(
        "Writing {} routes as geojson to path: {}",
        transit.routes.len(),
        path
    );
    println!("  Converting GTFS to GeoJSON");
    let start = Instant::now();
    let gtfs = transit.to_gtfs(src_gtfs, road);
    println!("  Converted GTFS to GeoJSON in {:?}", start.elapsed());
    gtfs.print_stats();
    output_geojson(&gtfs, path)
}

// Output GTFS as GeoJSON
fn output_geojson(gtfs: &Gtfs, path: &str) {
    println!("Writing GTFS as geojson to path: {}", path);
    let start = Instant::now();
    let features = geojson::get_all_features(&gtfs);
    println!("  There are {} features", features.len());
    let geojson = geojson::convert_to_geojson(&features);
    println!("  Generated GeoJSON in {:?}", start.elapsed());
    std::fs::write(path, serde_json::to_string_pretty(&geojson).unwrap()).unwrap();
    println!("  Wrote GeoJSON");
}
