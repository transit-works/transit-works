mod gtfs_to_geojson;

use std::fs::File;
use std::io::Write;
use gtfs_structures::Gtfs;

fn main() {
    let gtfs = Gtfs::new("src/data").unwrap();
    println!("there are {} stops in the gtfs", gtfs.stops.len());

    let features = gtfs_to_geojson::get_all_features(&gtfs);
    let geojson = gtfs_to_geojson::convert_to_geojson(&features);

    // Write GeoJSON to file
    let mut file = File::create("output.geojson").unwrap();
    file.write_all(serde_json::to_string_pretty(&geojson).unwrap().as_bytes())
        .unwrap();
}
