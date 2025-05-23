use crate::gtfs::{
    gtfs::Gtfs,
    structs::{Route, Stop, Trip},
};

use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

pub fn convert_to_geojson(features: &Vec<Value>) -> Value {
    let output = json!({
        "type": "FeatureCollection",
        "features": features,
    });

    return output;
}

pub fn get_all_features(gtfs_data: &Gtfs) -> Vec<Value> {
    let mut feature_set: Vec<Value> = vec![];
    feature_set.extend(get_route_features(&gtfs_data));
    feature_set.extend(get_stop_features(&gtfs_data.stops));

    return feature_set;
}

// Build route features from gtfs data
fn get_route_features(gtfs_data: &Gtfs) -> Vec<Value> {
    let route_to_shape = build_route_shape_mapping(&gtfs_data.trips);
    let route_to_stops = build_route_stop_mapping(&gtfs_data.trips);
    let features = gtfs_data
        .routes
        .values()
        .map(|route| {
            json!({
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": get_route_coords(&route, gtfs_data, &route_to_shape),
                },
                "properties": {
                    "route_id": &route.route_id,
                    "route_short_name": &route.route_short_name,
                    "route_long_name": &route.route_long_name,
                    "route_desc": &route.route_desc,
                    "route_type": &route.route_type,
                    "route_url": &route.route_url,
                    "route_stops": &route_to_stops.get(&route.route_id).unwrap_or(&vec![]),
                }
            })
        })
        .collect::<Vec<Value>>();

    return features;
}

// Build stop features from gtfs data
fn get_stop_features(stops: &HashMap<String, Arc<Stop>>) -> Vec<Value> {
    let features = stops
        .values()
        .map(|stop| {
            let stop = stop.as_ref();

            json!({
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [stop.stop_lon, stop.stop_lat]
                },
                "properties": {
                    "stop_id": &stop.stop_id,
                    "stop_name": &stop.stop_name,
                    "stop_code": &stop.stop_code,
                    "stop_description": &stop.stop_desc,
                    "stop_location_type": &stop.location_type,
                    "stop_parent_station": &stop.parent_station,
                    "stop_zone_id": &stop.zone_id,
                    "stop_url": &stop.stop_url,
                    "stop_long": &stop.stop_lon,
                    "stop_lat": &stop.stop_lat,
                    "stop_wheel_chair_boarding": &stop.wheelchair_boarding,
                    "stop_transfers": &stop.transfers,
                }
            })
        })
        .collect::<Vec<Value>>();

    return features;
}

// Map route_id to shape_id
fn build_route_shape_mapping(trips: &HashMap<String, Vec<Trip>>) -> HashMap<String, String> {
    let mut mapping: HashMap<String, String> = HashMap::new();

    for trip_list in trips.values() {
        for trip in trip_list {
            let shape_id = trip.shape_id.clone().unwrap_or_else(|| String::new());
            mapping.insert(trip.route_id.clone(), shape_id);
        }
    }

    return mapping;
}

// Map route_id to [stop_id]
fn build_route_stop_mapping(trips: &HashMap<String, Vec<Trip>>) -> HashMap<String, Vec<String>> {
    let mut mapping: HashMap<String, Vec<String>> = HashMap::new();
    for trip_list in trips.values() {
        for trip in trip_list {
            let stop_ids = trip
                .stop_times
                .iter()
                .map(|stop_time| stop_time.stop_id.clone())
                .collect::<Vec<String>>();

            if let Some(vec) = mapping.get_mut(&trip.route_id) {
                for stop_id in stop_ids {
                    if !vec.contains(&stop_id) {
                        vec.push(stop_id.clone());
                    }
                }
            } else {
                mapping.insert(trip.route_id.clone(), stop_ids);
            }
        }
    }

    mapping
}

fn get_route_coords(
    route: &Route,
    gtfs_data: &Gtfs,
    route_to_shape: &HashMap<String, String>,
) -> Vec<[f64; 2]> {
    if let Some(shape_id) = route_to_shape.get(&route.route_id) {
        let route_shapes = gtfs_data.shapes.get(shape_id).unwrap();
        route_shapes
            .iter()
            .map(|shape| [shape.shape_pt_lon, shape.shape_pt_lat])
            .collect()
    } else {
        vec![]
    }
}
