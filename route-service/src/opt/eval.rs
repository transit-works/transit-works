use core::f64;
use std::collections::VecDeque;
use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
    vec,
};

use geo::{Area, Contains};
use petgraph::graph::NodeIndex;
use serde::{Deserialize, Serialize};

use crate::layers::{
    geo_util,
    grid::{GridNetwork, Link, Zone},
    road_network::{Node, RoadNetwork},
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
) -> (Vec<f64>, f64) {
    // get other routes serving demand
    let zone_to_zone_coverage = determine_routes_zone_to_zone_coverage(transit, od, route);
    let stops = &route.outbound_stops;
    let mut zones = vec![];
    let mut stop_to_zone = HashMap::new();
    let mut zone_to_count = HashMap::new();
    for stop in stops {
        let zone = stop.zone_index(&od);
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
            let (u, v) = (od.get_zone(zones[i]).zoneid, od.get_zone(zones[j]).zoneid);
            let coverage = (*zone_to_zone_coverage.get(&(u, v)).unwrap_or(&0) + 1) as f64;
            let demand_ij = od.link_between_zones(zones[i], zones[j]).unwrap();
            let ridership_ij = demand_ij.weight / coverage;
            *zone_to_ridership.entry(zones[i]).or_insert(0.0) -= ridership_ij;
        }
        // people getting on
        for j in i + 1..zones.len() {
            let (u, v) = (od.get_zone(zones[i]).zoneid, od.get_zone(zones[j]).zoneid);
            let coverage = (*zone_to_zone_coverage.get(&(u, v)).unwrap_or(&0) + 1) as f64;
            let demand_ij = od.link_between_zones(zones[i], zones[j]).unwrap();
            let ridership_ij = demand_ij.weight / coverage;
            *zone_to_ridership.entry(zones[i]).or_insert(0.0) += ridership_ij;
        }
    }

    let mut ridership = vec![];
    for stop in stops {
        if let Some(zone) = stop_to_zone.get(&stop.stop_id) {
            let ridership_stop =
                *zone_to_ridership.get(zone).unwrap() / *zone_to_count.get(zone).unwrap() as f64;
            ridership.push(ridership_stop);
        } else {
            ridership.push(0.0);
        }
    }

    for i in 1..ridership.len() {
        ridership[i] += ridership[i - 1];
    }

    let avg_ridership = ridership.iter().sum::<f64>() / ridership.len() as f64;

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
        let zone = stop.zone_index(&od).unwrap();
        let zone_ref = od.get_zone(zone);
        if vis_zones.contains(&zone_ref.zoneid) {
            continue;
        }
        vis_zones.push(zone_ref.zoneid);
        let mut zone_links = vec![];
        for stop2 in route_stops {
            let zone2 = stop2.zone_index(&od).unwrap();
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
        let node = stop.zone_index(&od);
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
        let zone = stop.zone_index(grid);
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

/// Evaluate the expected number of transfers for trips using the transit network
///
/// # Arguments
/// - `transit`: Transit network data
/// - `od`: Origin-Destination matrix data
///
/// # Returns
/// - Expected number of transfers
/// - Map of zone index to expected number of transfers
///
/// The expected number of transfers is calculated by determining the number of transfers to complete all possible
/// zone-to-zone trips in the city. A weight is applied based on the volume for that OD edge.
pub fn average_transfers(
    transit: &TransitNetwork,
    od: &GridNetwork,
) -> (f64, HashMap<NodeIndex, f64>) {
    // save which routes access which zones to speed up computation
    // define some acceptable walking radius for a transfer
    let mut zone_to_routes = HashMap::new();
    let mut route_to_zones = HashMap::new();

    for route in &transit.routes {
        let mut zones = HashSet::new();
        for stop in &route.outbound_stops {
            let nearby_zones = stop.nearby_zone_indices(od);
            for zone in nearby_zones {
                zones.insert(zone);
            }
        }
        for zone in &zones {
            zone_to_routes
                .entry(*zone)
                .or_insert_with(Vec::new)
                .push(route.route_id.clone());
        }
        route_to_zones.insert(route.route_id.clone(), zones);
    }

    let zones = od.get_all_valid_zones();

    let mut expected_transfers = 0.0;
    let mut total_volume = 0.0;
    let mut zone_to_transfers = HashMap::new();
    for from in &zones {
        if !zone_to_routes.contains_key(from) {
            continue;
        }
        log::trace!("Zone {:?}", od.get_zone(*from).zoneid);

        let transfers_map =
            compute_all_transfers_from_zone(&zone_to_routes, &route_to_zones, *from, &zones);

        let mut zone_expected_transfers = 0.0;
        let mut zone_total_volume = 0.0;

        for to in &zones {
            if from == to {
                continue;
            }
            let demand = od.demand_between_zones(*from, *to);

            if let Some(transfers) = transfers_map.get(to) {
                zone_expected_transfers += *transfers * demand;
                zone_total_volume += demand;
            }
        }

        if zone_total_volume > 0.0 {
            zone_to_transfers.insert(*from, zone_expected_transfers / zone_total_volume);
            expected_transfers += zone_expected_transfers;
            total_volume += zone_total_volume;
        }
    }

    let avg_transfers = if total_volume > 0.0 {
        expected_transfers / total_volume
    } else {
        0.0
    };
    (avg_transfers, zone_to_transfers)
}

/// Calculate minimum transfers from a source zone to all possible destination zones
/// using a single BFS traversal
fn compute_all_transfers_from_zone(
    zone_to_routes: &HashMap<NodeIndex, Vec<String>>,
    route_to_zones: &HashMap<String, HashSet<NodeIndex>>,
    from: NodeIndex,
    zones: &Vec<NodeIndex>,
) -> HashMap<NodeIndex, f64> {
    let mut transfers_map = HashMap::new();

    // If source zone has no routes, all destinations are unreachable
    if !zone_to_routes.contains_key(&from) {
        return transfers_map;
    }

    // Source to source is always 0 transfers
    transfers_map.insert(from, 0.0);

    // Track visited zones to avoid cycles
    let mut visited = HashSet::new();
    visited.insert(from);

    // Queue of (zone, transfers)
    let mut queue = VecDeque::new();
    queue.push_back((from, 0.0));

    // Initialize with direct connections (0 transfers)
    for route in zone_to_routes[&from].iter() {
        if let Some(reachable_zones) = route_to_zones.get(route) {
            for &zone in reachable_zones {
                if zone != from {
                    transfers_map.insert(zone, 0.0); // Direct connection = 0 transfers
                    visited.insert(zone);
                    queue.push_back((zone, 0.0));
                }
            }
        }
    }

    while let Some((current_zone, transfers)) = queue.pop_front() {
        // Get all routes from the current zone
        if let Some(routes) = zone_to_routes.get(&current_zone) {
            for route in routes {
                // Get all zones reachable from this route
                if let Some(reachable_zones) = route_to_zones.get(route) {
                    for &next_zone in reachable_zones {
                        if next_zone == from || visited.contains(&next_zone) {
                            continue;
                        }

                        // If we haven't seen this zone yet or found a better path
                        let new_transfers = transfers + 1.0;
                        let update = match transfers_map.get(&next_zone) {
                            None => true,
                            Some(&existing) => new_transfers < existing,
                        };

                        if update {
                            transfers_map.insert(next_zone, new_transfers);
                            visited.insert(next_zone);
                            queue.push_back((next_zone, new_transfers));
                        }
                    }
                }
            }
        }
    }

    // Apply a penalty for unreachable zones
    let penalty = 5.0;
    for &zone in zones {
        if zone != from && !transfers_map.contains_key(&zone) {
            transfers_map.insert(zone, penalty);
        }
    }

    transfers_map
}
