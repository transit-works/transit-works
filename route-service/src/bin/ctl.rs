use std::time::Instant;

use clap::Parser;

use route_service::gtfs::geojson;
use route_service::gtfs::gtfs::Gtfs;
use route_service::gtfs::structs::RouteType;
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
    output_dir: String,

    #[arg(long)]
    suffix: Option<String>,
}

fn main() {
    env_logger::init();
    let args = Args::parse();

    println!("Reading GTFS from path: {}", args.gtfs_path);
    let gtfs = Gtfs::from_path(&args.gtfs_path).unwrap();
    gtfs.print_stats();

    // output to geojson
    let gtfs_geojson_path = format!("{}/gtfs.geojson", args.output_dir);
    output_geojson(&gtfs, &gtfs_geojson_path);

    println!("Building grid network from path: {}", args.db_path);
    let grid = GridNetwork::load(&args.db_path).unwrap();
    grid.print_stats();

    println!("Building road network from path: {}", args.db_path);
    let road = RoadNetwork::load(&args.db_path).unwrap();
    road.print_stats();

    println!("Building transit network from GTFS");
    let mut transit = TransitNetwork::from_gtfs(&gtfs, &road).unwrap();
    transit.print_stats();

    // Only consider non-bus routes
    // 73480 73530
    // transit.routes = transit
    //     .routes
    //     .into_iter()
    //     .filter(|r| r.route_type == RouteType::Bus)
    //     .filter(|r| {
    //         r.route_id == "73592"
    //             || r.route_id == "73588"
    //             || r.route_id == "73506"
    //             || r.route_id == "73594"
    //             || r.route_id == "73480"
    //             || r.route_id == "73530"
    //     })
    //     .take(10)
    //     .collect();

    // weird tracing routes
    // 73485 73527 73502 73421 73464 73451 73530 73483
    // remaining
    // 73489 73430 73589 73493 73521 73473 73536
    // transit.routes = transit
    //     .routes
    //     .into_iter()
    //     .filter(|r| {
    //         r.route_id == "73485"
    //             || r.route_id == "73527"
    //             || r.route_id == "73502"
    //             || r.route_id == "73421"
    //             || r.route_id == "73464"
    //             || r.route_id == "73451"
    //             || r.route_id == "73530"
    //             || r.route_id == "73483"
    //             || r.route_id == "73489"
    //             || r.route_id == "73430"
    //             || r.route_id == "73589"
    //             || r.route_id == "73493"
    //             || r.route_id == "73521"
    //             || r.route_id == "73473"
    //             || r.route_id == "73536"
    //     })
    //     .collect();

    let suffix = args.suffix.unwrap_or("".to_string());
    let before_path = format!("{}/before{}.geojson", args.output_dir, suffix);
    output_routes_geojson(&transit, &gtfs, &road, &before_path);

    // println!("Initializing ACO");
    // let mut aco = ACO::init();
    // aco.print_stats();

    // println!("Running ACO!");
    // let start = Instant::now();
    // let solution = aco.run(&grid, &road, &transit);
    // println!("  ACO finished in {:?}", start.elapsed());
    // solution.print_stats();

    // let solution_path = format!("{}/solution{}.geojson", args.output_dir, suffix);
    // output_routes_geojson(&solution, &gtfs, &road, &solution_path);
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
