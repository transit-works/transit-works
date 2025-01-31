use clap::Parser;

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
    let transit = TransitNetwork::from_gtfs(gtfs).unwrap();
    transit.print_stats();

    println!("Building grid network from path: {}", args.db_path);
    let grid = GridNetwork::load(&args.db_path).unwrap();
    grid.print_stats();

    println!("Building road network from path: {}", args.db_path);
    let road = RoadNetwork::load(&args.db_path).unwrap();
    road.print_stats();

    println!("Initializing ACO");
    let mut aco = ACO::init(&transit);
    aco.print_stats();

    println!("Running ACO!");
    let network_result = aco.run(&grid, &road, &transit);
    network_result.print_stats();
}
