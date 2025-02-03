use std::time::Instant;

use clap::Parser;

use route_service::gtfs::geojson;
use route_service::gtfs::gtfs::Gtfs;
use route_service::layers::{
    grid::GridNetwork, road_network::RoadNetwork, transit_network::TransitNetwork,
};
use route_service::opt::aco::ACO;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    #[arg(long)]
    gtfs_path: String,

    #[arg(long)]
    db_path: String,

    #[arg(long)]
    output_path: String,
}

fn main() {
    let args = Args::parse();

    println!("Reading GTFS from path: {}", args.gtfs_path);
    let gtfs = Gtfs::from_path(&args.gtfs_path).unwrap();
    gtfs.print_stats();

    println!("Building transit network from GTFS");
    let mut transit = TransitNetwork::from_gtfs(&gtfs).unwrap();
    transit.print_stats();

    println!("Building grid network from path: {}", args.db_path);
    let grid = GridNetwork::load(&args.db_path).unwrap();
    grid.print_stats();

    println!("Building road network from path: {}", args.db_path);
    let road = RoadNetwork::load(&args.db_path).unwrap();
    road.print_stats();

    // Only consider non-bus routes
    transit.routes = transit.routes
        .into_iter()
        .filter(|route| route.route_type != route_service::gtfs::structs::RouteType::Bus)
        .take(20)
        .collect();

    println!("Initializing ACO");
    let mut aco = ACO::init(&transit);
    aco.print_stats();

    println!("Running ACO!");
    let start = Instant::now();
    let solution = aco.run(&grid, &road, &transit);
    println!("  ACO finished in {:?}", start.elapsed());
    solution.print_stats();

    // Output the best solution as GeoJSON
    output_routes_geojson(&solution, &gtfs, &road, &args.output_path);
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
