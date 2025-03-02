use core::f64;
use std::{collections::HashMap, sync::Arc};

use serde::{Deserialize, Serialize};

use crate::layers::{
    grid::{GridNetwork, Link, Zone},
    road_network::RoadNetwork,
    transit_network::{TransitNetwork, TransitStop},
};

use super::consts;

/// Evaluate the ridership of a route at each stop
///
/// # Arguments
/// - `route_stops`: Vector of transit stops along the route
/// - `od`: Origin-Destination matrix data
///
/// # Returns
/// - Tuple of:
///   - Vector of ridership at each stop
///   - Average ridership per stop
///
/// # Notes
/// - Ridership is calculated by summing the demand between zones for all pairs of stops
/// - Ridership is distributed equally over all stops in the same zone
/// - TODO: Distribute ridership over other nearby routes if they service the same zone-to-zone demand
pub fn ridership_over_route(
    route_stops: &Vec<Arc<TransitStop>>,
    od: &GridNetwork,
) -> (Vec<f64>, f64) {
    let mut ridership = vec![];
    let mut zone_prev_outer = None;
    // populate the net change at each stop for ridership
    for i in 0..route_stops.len() {
        let stop = &route_stops[i];
        let (x, y) = (stop.geom.x(), stop.geom.y());
        let zone = od.find_nearest_zone(x, y).unwrap();
        if zone_prev_outer == Some(zone) {
            // track duplicate zones for stops, and skip them
            ridership.push(f64::NAN);
            continue;
        }
        let mut zone_prev = None;
        let mut net_at_stop = 0.0;
        // TODO divide demand by frequency
        // TODO distribute ridership over other nearby routes and stops
        for j in 0..i {
            // riders leaving at stop i
            let (x1, y1) = (route_stops[j].geom.x(), route_stops[j].geom.y());
            let zone_curr = od.find_nearest_zone(x1, y1).unwrap();
            // avoid double counting the same zone, assume the total demand from that zone
            // is distribued over all the stops in that zone from the route
            if zone_prev == Some(zone_curr) {
                continue;
            }
            zone_prev = Some(zone_curr);
            let demand = od.demand_between_zones(zone, zone_curr);
            net_at_stop -= demand;
        }
        for j in i + 1..route_stops.len() {
            // riders boarding at stop i
            let (x2, y2) = (route_stops[j].geom.x(), route_stops[j].geom.y());
            let zone_curr = od.find_nearest_zone(x2, y2).unwrap();
            if zone_prev == Some(zone_curr) {
                continue;
            }
            zone_prev = Some(zone_curr);
            let demand = od.demand_between_zones(zone, zone_curr);
            net_at_stop += demand;
        }
        zone_prev_outer = Some(zone);
        ridership.push(net_at_stop);
    }
    // for all NAN entries in a row, distribe the last non-NAN value over them
    // assume that the demand is equally distribued over all the stops in the same zone
    let mut last_non_nan = 0.0;
    let mut count_nan = 0;
    for i in 0..ridership.len() {
        if ridership[i].is_nan() {
            count_nan += 1;
        } else {
            if count_nan > 0 {
                let distribute = last_non_nan / (count_nan as f64);
                for j in 0..count_nan {
                    ridership[i - j - 1] = distribute;
                }
                count_nan = 0;
            }
            last_non_nan = ridership[i];
        }
    }
    // rider ship should be the running sum of the net at stop
    for i in 1..ridership.len() {
        ridership[i] += ridership[i - 1];
    }
    let average_ridership = ridership.iter().sum::<f64>() / ridership.len() as f64;
    (ridership, average_ridership / consts::BUS_CAPACITY as f64)
}

/// Struct to store demand between zones for all pairs of stops along a route
#[derive(Serialize, Deserialize)]
pub struct RouteDemandGridInfo {
    pub zones: Vec<Zone>,
    pub links: Vec<Vec<Link>>,
    pub zones_to_stop_id: HashMap<u32, Vec<String>>,
}

/// Get the demand between zones for all pairs of stops along a route
///
/// # Arguments
/// - `route_stops`: Vector of transit stops along the route
/// - `od`: Origin-Destination matrix data
///
/// # Returns
/// - Struct containing:
///   - Vector of zones for each stop
///   - Vector of vectors of demand between zones for each pair of stops
pub fn get_route_demand_grid_info(
    route_stops: &Vec<Arc<TransitStop>>,
    od: &GridNetwork,
) -> RouteDemandGridInfo {
    let mut zones = vec![];
    let mut links = vec![];
    let mut vis_zones = vec![];
    let mut zones_to_stop_id = HashMap::new();
    for stop in route_stops {
        let (x, y) = (stop.geom.x(), stop.geom.y());
        let zone = od.find_nearest_zone(x, y).unwrap();
        let zone_ref = od.get_zone(zone);
        if vis_zones.contains(&zone_ref.zoneid) {
            continue;
        }
        vis_zones.push(zone_ref.zoneid);
        let mut zone_links = vec![];
        for stop2 in route_stops {
            let (x2, y2) = (stop2.geom.x(), stop2.geom.y());
            let zone2 = od.find_nearest_zone(x2, y2).unwrap();
            let demand = od.link_between_zones(zone, zone2).unwrap();
            zone_links.push((*demand).clone());
        }
        zones.push(zone_ref.clone());
        links.push(zone_links);
        zones_to_stop_id
            .entry(zone_ref.zoneid)
            .or_insert_with(Vec::new)
            .push(stop.stop_id.clone());
    }
    RouteDemandGridInfo {
        zones: zones,
        links: links,
        zones_to_stop_id: zones_to_stop_id,
    }
}

/// Struct to store all the zones of the city
#[derive(Serialize, Deserialize)]
pub struct CityGridInfo {
    zones: Vec<Zone>,
    links: Vec<Vec<Link>>,
}

/// Get the grids of the whole city
pub fn get_city_grid_info(od: &GridNetwork) -> CityGridInfo {
    let mut zones = vec![];
    let mut links = vec![];
    let mut vis_zones = vec![];
    for zone in od.graph.node_indices() {
        let zone_ref = od.get_zone(zone);
        if vis_zones.contains(&zone_ref.zoneid) {
            continue;
        }
        vis_zones.push(zone_ref.zoneid);
        let mut zone_links = vec![];
        for zone2 in od.graph.node_indices() {
            let demand = od.link_between_zones(zone, zone2).unwrap();
            zone_links.push((*demand).clone());
        }
        zones.push(zone_ref.clone());
        links.push(zone_links);
    }
    CityGridInfo {
        zones: zones,
        links: links,
    }
}

/// Get the population density data of all the zones along a route
pub fn get_route_demand_population_info(route_stops: &Vec<Arc<TransitStop>>) {
    // TODO: get OSM building pop density data available through Sqlite
    panic!("Not implemented");
}

pub fn evaluate_transit_network(
    transit: &TransitNetwork,
    road: &RoadNetwork,
    od: &GridNetwork,
) -> f64 {
    // TODO: come up with some microsim approach to evaluate the entire transit network
    panic!("Not implemented");
}
