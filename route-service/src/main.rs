mod layers;
mod gtfs;

use std::fs::File;
use std::io::Write;

use gtfs::{gtfs::Gtfs, geojson};

fn main() {
    println!("Hello, world!");
    let gtfs = Gtfs::from_path("/Users/jeevanopel/workspace/transit-works/scripts/toronto.db").unwrap();
    gtfs.print_stats();
    let features = geojson::get_all_features(&gtfs);
    println!("There are {} features", features.len());
    let geojson = geojson::convert_to_geojson(&features);
    println!("Generated GeoJSON");
    let mut file = File::create("data.geojson").unwrap();
    file.write_all(serde_json::to_string_pretty(&geojson).unwrap().as_bytes())
        .unwrap();
}
