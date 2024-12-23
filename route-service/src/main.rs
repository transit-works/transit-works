mod layers;
mod gtfs;

use layers::{grid_network::GridNetwork, road_network::RoadNetwork};
use gtfs::raw_gtfs::GtfsDataSet;
use gtfs::gtfs::Gtfs;

fn main() {
    println!("Hello, world!");

    let tmp = "toronto.db";
    let grid = GridNetwork::load(tmp);
    let road = RoadNetwork::load(tmp);

    let gtfs = GtfsDataSet::from_path("/Users/jeevanopel/Downloads/OpenData_TTC_Schedules").unwrap();
    gtfs.print_stats();

    let gtfs_enriched = Gtfs::from_path("/Users/jeevanopel/Downloads/OpenData_TTC_Schedules").unwrap();
    gtfs_enriched.print_stats();
}
