mod layers;
mod gtfs;

use layers::{grid_network::GridNetwork, road_network::RoadNetwork};
use gtfs::gtfs::GtfsDataSet;

fn main() {
    println!("Hello, world!");

    let tmp = "toronto.db";
    let grid = GridNetwork::load(tmp);
    let road = RoadNetwork::load(tmp);
}
