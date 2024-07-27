mod layers;

use layers::{grid_network::GridNetwork, road_network::RoadNetwork};

fn main() {
    println!("Hello, world!");

    let tmp = "toronto.db";
    let grid = GridNetwork::load(tmp);
    let road = RoadNetwork::load(tmp);
}
