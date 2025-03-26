use core::f64;
use std::{collections::HashMap, collections::HashSet, sync::Arc};

use geo::Contains;
use petgraph::graph::NodeIndex;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

use crate::gtfs::gtfs::Gtfs;

use crate::layers::{
    geo_util,
    grid::GridNetwork,
    transit_network::{TransitNetwork, TransitRoute, TransitStop},
};

use super::consts::{self};

const ADJUSTMENT_FACTOR: f64 = 1.0;
const DEFAULT_FREQUENCY: f64 = 10.0;

#[derive(Clone, PartialEq, Serialize, Deserialize)]
pub struct TransitNetworkEvals {
    pub avg_transfers: f64,
    pub zone_to_transfers: HashMap<NodeIndex, f64>,
}

#[derive(Clone, PartialEq, Serialize, Deserialize)]
pub struct TransitRouteEvals {
    pub ridership: Vec<f64>,
    pub avg_ridership: f64,
    pub economic_score: f64,
    pub coverage: f64,
}

impl TransitNetworkEvals {
    pub fn for_network(transit: &TransitNetwork, od: &GridNetwork) -> TransitNetworkEvals {
        let (avg_transfers, zone_to_transfers) = average_transfers(transit, od);
        TransitNetworkEvals {
            avg_transfers,
            zone_to_transfers,
        }
    }
}

impl TransitRouteEvals {
    pub fn for_route(
        transit: &TransitNetwork,
        route: &TransitRoute,
        od: &GridNetwork,
    ) -> TransitRouteEvals {
        let (ridership, avg_ridership) = ridership_over_route(transit, route, od);
        let economic_score = evaluate_economic_score(route, od, transit);
        let coverage = evaluate_coverage(&route.outbound_stops, od);
        TransitRouteEvals {
            ridership,
            avg_ridership,
            economic_score,
            coverage,
        }
    }
}

/// transit score is out of 100 and a combination of avg transfers, avg ridership, and coverage
pub fn transit_score(
    avg_transfers: f64, // 0 - 3
    avg_ridership: f64, // 0 - 50
    coverage: f64,      // 0 - 100
) -> f64 {
    let transfers_score = 100.0 - (avg_transfers / 3.0) * 100.0;
    let ridership_score = (avg_ridership / 50.0) * 100.0;
    let coverage_score = coverage;
    let ret = (transfers_score + ridership_score + coverage_score) / 3.0;
    ret.min(100.0).max(0.0)
}

/// average ridership over all routes
pub fn avg_ridership(transit: &TransitNetwork, od: &GridNetwork) -> f64 {
    let mut total_ridership = 0.0;
    for route in &transit.routes {
        let avg_ridership = route.evals.as_ref().map_or_else(
            || ridership_over_route(transit, route, od).1,
            |e| e.avg_ridership,
        );
        total_ridership += avg_ridership;
    }
    total_ridership / transit.routes.len() as f64
}

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
            // Check if both maps contain the zone
            if let (Some(&ridership_key), Some(&count)) =
                (zone_to_ridership.get(zone), zone_to_count.get(zone))
            {
                // Make sure count is not zero to avoid division by zero
                if count > 0 {
                    let ridership_stop = ridership_key / count as f64;
                    ridership.push(ridership_stop);
                } else {
                    ridership.push(0.0);
                }
            } else {
                // Either zone_to_ridership or zone_to_count doesn't have this zone
                ridership.push(0.0);
            }
        } else {
            ridership.push(0.0);
        }
    }

    for i in 1..ridership.len() {
        ridership[i] += ridership[i - 1];
    }

    let avg_ridership = ridership.iter().sum::<f64>() / ridership.len().max(1) as f64;

    (ridership, avg_ridership)
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

    curr_populations / (total_population + 1.0) * 100.0
}

pub fn evaluate_network_coverage(transit: &TransitNetwork, od: &GridNetwork) -> f64 {
    let mut total_coverage = 0.0;
    for route in &transit.routes {
        let coverage = route.evals.as_ref().map_or_else(
            || evaluate_coverage(&route.outbound_stops, od),
            |e| e.coverage,
        );
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
    od: &GridNetwork,
    transit: &TransitNetwork,
) -> f64 {
    let route_stops = if route.outbound_stops.len() >= 2 {
        &route.outbound_stops
    } else {
        &route.inbound_stops
    };
    if route_stops.len() < 2 {
        return 0.0;
    }
    let (ridership, _) = ridership_over_route(transit, route, od);

    let from_stop = &route_stops[0];
    let to_stop = &route_stops[1];
    let from_zone = od.find_nearest_zone(from_stop.geom.x(), from_stop.geom.y());
    let to_zone = od.find_nearest_zone(to_stop.geom.x(), to_stop.geom.y());
    let mut period: usize = 1;
    if let (Some(from), Some(to)) = (from_zone, to_zone) {
        if let Some(link) = od.link_between_zones(from, to) {
            let link_hash = &link.weight_by_time;
            let mut max_val = 0.0;
            for (key, value) in link_hash {
                if *value > max_val {
                    max_val = *value;
                    period = key.to_number();
                }
            }
        }
    }

    let stop_frequencies = &route.stop_times;

    let f = stop_frequencies
        .get(&period)
        .unwrap_or(&(DEFAULT_FREQUENCY as usize));
    let div = consts::BUS_CAPACITY as f64 * (*f as f64) / route.outbound_stops.len() as f64;

    let avg_ridership =
        ridership.iter().map(|&x| x.min(div as f64)).sum::<f64>() / ridership.len() as f64;

    let res = (avg_ridership / div) * 100.0 * ADJUSTMENT_FACTOR;
    res
}

pub fn evaluate_network_economic_score(transit: &TransitNetwork, od: &GridNetwork) -> f64 {
    let mut total_score = 0.0;
    for route in &transit.routes {
        let score = route.evals.as_ref().map_or_else(
            || evaluate_economic_score(route, od, transit),
            |e: &TransitRouteEvals| e.economic_score,
        );

        total_score += score;
        println!("score : {}", score);
    }

    println!("avg : {}", total_score / (transit.routes.len() as f64));
    total_score / (transit.routes.len() as f64)
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

#[derive(Serialize)]
pub struct RankedRoute {
    pub route_id: String,
    pub route_short_name: String,
    pub route_long_name: String,
    pub score_before: f64,
    pub score_after: f64,
    pub improvement: f64,
}

pub fn rank_routes_by_improvement(
    original_gtfs: &Gtfs,
    original_transit: &TransitNetwork,
    optimized_transit: &TransitNetwork,
    optimized_route_ids: &Vec<String>,
) -> Vec<RankedRoute> {
    let mut ranked_routes = vec![];
    for route_id in optimized_route_ids {
        let original = original_transit
            .routes
            .iter()
            .find(|r| r.route_id == *route_id);
        let optimized = optimized_transit
            .routes
            .iter()
            .find(|r| r.route_id == *route_id);
        if let (Some(original), Some(optimized)) = (original, optimized) {
            let original_score = original.evals.as_ref().map_or(0.0, |e| e.avg_ridership);
            let optimized_score = optimized.evals.as_ref().map_or(0.0, |e| e.avg_ridership);
            let improvement_pct = (optimized_score - original_score) / original_score * 100.0;
            ranked_routes.push(RankedRoute {
                route_id: route_id.clone(),
                route_short_name: original_gtfs
                    .routes
                    .get(route_id)
                    .unwrap()
                    .route_short_name
                    .clone()
                    .unwrap_or_default(),
                route_long_name: original_gtfs
                    .routes
                    .get(route_id)
                    .unwrap()
                    .route_long_name
                    .clone()
                    .unwrap_or_default(),
                score_before: original_score,
                score_after: optimized_score,
                improvement: improvement_pct,
            });
        }
    }
    // sort by highest improvement first
    ranked_routes.sort_by(|a, b| b.improvement.partial_cmp(&a.improvement).unwrap());
    ranked_routes
}
