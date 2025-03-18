use actix_web::cookie::time::{convert, Time};
use core::f64;
use std::{collections::HashMap, collections::HashSet, sync::Arc};

use geo::Area;
use geo::{Intersects, Point, Polygon};
use geo_types::Coord;
use serde::{Deserialize, Serialize};

use crate::layers::grid::TimePeriod;
use crate::layers::{
    geo_util,
    grid::{GridNetwork, Link, Zone},
    road_network::RoadNetwork,
    transit_network::{TransitNetwork, TransitRoute, TransitStop},
};

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
    transit: &TransitNetwork,
    route: &TransitRoute,
    od: &GridNetwork,
    route: &TransitRoute,
    transit: &TransitNetwork,
) -> (Vec<f64>, f64) {
    let mut ridership = vec![];
    let mut zone_prev_outer = None;
    // populate the net change at each stop for ridership
    let mut number_of_intersecting_stops: HashMap<(String, String), f64> = HashMap::new();
    for r in transit.routes.iter() {
        if r.route_id != route.route_id {
            for stops in route.outbound_stops.windows(2) {
                let edge = (stops[0].stop_id.clone(), stops[1].stop_id.clone());
                *number_of_intersecting_stops.entry(edge).or_insert(0.0) += 1.0;
            }
        }
    }

    for i in 0..route_stops.len() {
        let stop = &route_stops[i];
        let (x, y) = (stop.geom.x(), stop.geom.y());
        let zone = od.find_nearest_zone(x, y);
        if let Some(zone) = zone {
            if !zones.contains(&zone) {
                zones.push(zone);
            }
            stop_to_zone.insert(stop.stop_id.clone(), zone);
            *zone_to_count.entry(zone).or_insert(0) += 1;
        }
    }
    let mut zone_to_ridership = HashMap::new();
    for i in 0..zones.len() {
        // people getting off
        for j in 0..i {
            // riders leaving at stop i
            let intersecting = number_of_intersecting_stops
            .get(&(stop.stop_id.clone(), route_stops[j].stop_id.clone()))
            .unwrap_or(&1.0);

            let (x1, y1) = (route_stops[j].geom.x(), route_stops[j].geom.y());
            if let Some(zone_curr) = od.find_nearest_zone(x1, y1) {
                // avoid double counting the same zone, assume the total demand from that zone
                // is distribued over all the stops in that zone from the route
                if zone_prev == Some(zone_curr) {
                    continue;
                }
                zone_prev = Some(zone_curr);
                let demand = od.demand_between_zones(zone, zone_curr);
                net_at_stop -= demand/intersecting;
            }
        }
        for j in i + 1..route_stops.len() {
            // riders boarding at stop i
            let intersecting = number_of_intersecting_stops
            .get(&(stop.stop_id.clone(), route_stops[j].stop_id.clone()))
            .unwrap_or(&1.0);
            let (x2, y2) = (route_stops[j].geom.x(), route_stops[j].geom.y());
            if let Some(zone_curr) = od.find_nearest_zone(x2, y2) {
                if zone_prev == Some(zone_curr) {
                    continue;
                }
                zone_prev = Some(zone_curr);
                let demand = od.demand_between_zones(zone, zone_curr);
                net_at_stop += demand/intersecting;
            }
        }
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
            if i == ridership.len() - 1{
                ridership[i] = 0.0;
            }
            else{
                count_nan += 1;
            }
        } else {
            ridership.push(0.0);
        }
    }

    for i in 1..ridership.len() {
        ridership[i] += ridership[i - 1];
    }

    let s: f64 = ridership.iter().filter(|&&r| !r.is_nan()).sum();

    (ridership, avg_ridership)
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

/// Function to evaluate the coverage of a route
/// Coverage is calculated using the ratio of the ridership over the sum population around a 400m radius of each stop
pub fn evaluate_coverage(route_stops: &Vec<Arc<TransitStop>>, od: &GridNetwork) -> f64 {
    let mut curr_populations = 0.0;
    let mut total_population = 0.0;
    for stop in route_stops {
        let (x, y) = (stop.geom.x(), stop.geom.y());
        let node = od.find_nearest_zone(x, y);
        if node.is_none() {
            continue;
        }
        let zone = od.get_zone(node.unwrap());
        curr_populations += zone.population as f64;
        let env = geo_util::compute_envelope(y, x, 400.0);
        let nodes_in_envelope = od.rtree.locate_in_envelope_intersecting(&env);
        let mut total_population_stop = 0.0;
        for n in nodes_in_envelope {
            let z = od.get_zone(n.get_node_index());
            total_population_stop += z.population as f64;
        }
        total_population += total_population_stop * 0.6;
    }

    curr_populations / total_population * 100.0
}

pub fn evaluate_network_coverage(transit: &TransitNetwork, od: &GridNetwork) -> f64 {
    let mut total_coverage = 0.0;
    for route in &transit.routes {
        let coverage = evaluate_coverage(&route.outbound_stops, od);
        total_coverage += coverage;
    }

    println!(
        "Total coverage: {}",
        total_coverage / transit.routes.len() as f64
    );
    total_coverage / transit.routes.len() as f64
}

pub fn evaluate_economic_score(
    route: &TransitRoute,
    route_stops: &Vec<Arc<TransitStop>>,
    od: &GridNetwork,
    transit : &TransitNetwork,
) -> f64 {
    let (ridership, avg) = ridership_over_route(route_stops, od, route, transit);
    let s: f64 = ridership.iter().filter(|&&r| !r.is_nan()).sum();
    let ridership_per_stop = s / route_stops.len() as f64;

    // Get the weight_by_time enum from the GridNetwork
    let mut total_weight_by_time = 0.0;
    let from_stop = &route_stops[0];
    let to_stop = &route_stops[1];
    let from_zone = od.find_nearest_zone(from_stop.geom.x(), from_stop.geom.y());
    let to_zone = od.find_nearest_zone(to_stop.geom.x(), to_stop.geom.y());
    let mut time_period = 0.0;
    let mut period: usize = 1;
    if let (Some(from), Some(to)) = (from_zone, to_zone) {
        if let Some(link) = od.link_between_zones(from, to) {
            let link_hash = &link.weight_by_time;
            let mut max_val = 0.0;
            for (key, value) in  link_hash{
                if *value > max_val{
                    max_val = *value;
                    period = key.to_number();
                }
            }
        }
    }

    let mut stop_frequencies = &route.stop_times;
    let mut first_stop_id = String::new();
    for ((stop_id, _), _) in stop_frequencies.iter().take(1){
        first_stop_id = stop_id.clone();
    }

    let f = stop_frequencies.get(&(first_stop_id, period));
    
    if f.is_none() {
        println!("No frequency data available for route {}", route.route_id);
        let res = (s / (consts::BUS_CAPACITY as f64) * 100.0);
        res.min(100.0)
    } else {
        let res = (s / (consts::BUS_CAPACITY as f64 * (*f.unwrap() as f64))) * 100.0;
        res.min(100.0)
    }
}

pub fn evaluate_network_economic_score(transit: &TransitNetwork, od: &GridNetwork) -> f64 {
    let mut total_score = 0.0;
    for route in &transit.routes {
        let score = evaluate_economic_score(route, &route.outbound_stops, od, transit);
        println!("Economic score for route {}: {}", route.route_id, score);
        total_score += score;
    }

    println!(
        "Total economic score: {}",
        total_score / transit.routes.len() as f64
    );
    total_score / transit.routes.len() as f64
}

pub fn evaluate_transit_network(
    transit: &TransitNetwork,
    road: &RoadNetwork,
    od: &GridNetwork,
) -> f64 {
    // TODO: come up with some microsim approach to evaluate the entire transit network
    panic!("Not implemented");
}

pub fn determine_routes_zone_to_zone_coverage(
    transit: &TransitNetwork,
    grid: &GridNetwork,
    opt_route: &TransitRoute,
) -> HashMap<(u32, u32), u32> {
    let mut num_routes = HashMap::new();
    let mut zones = vec![];
    for stop in &opt_route.outbound_stops {
        let (x, y) = (stop.geom.x(), stop.geom.y());
        let zone = grid.find_nearest_zone(x, y);
        if let Some(zone) = zone {
            if !zones.contains(&zone) {
                zones.push(zone);
            }
        }
    }
    for i in 0..zones.len() {
        for j in i + 1..zones.len() {
            for route in transit.routes.iter() {
                if route.route_id == opt_route.route_id {
                    continue;
                }
                if route
                    .outbound_stops
                    .iter()
                    .any(|s| grid.get_zone(zones[i]).polygon.contains(&s.geom))
                    && route
                        .outbound_stops
                        .iter()
                        .any(|s| grid.get_zone(zones[j]).polygon.contains(&s.geom))
                {
                    let (u, v) = (
                        grid.get_zone(zones[i]).zoneid,
                        grid.get_zone(zones[j]).zoneid,
                    );
                    *num_routes.entry((u, v)).or_insert(0) += 1;
                    *num_routes.entry((v, u)).or_insert(0) += 1;
                }
            }
        }
    }
    num_routes
}
