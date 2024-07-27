mod layers;

use layers::grid_network;

fn main() {
    println!("Hello, world!");

    let tmp = "toronto.db";
    let grid = grid_network::load(tmp);
}
