use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};

use geo::Contains;
use petgraph::graph::NodeIndex;
use rand::{distributions::WeightedIndex, prelude::Distribution, rngs::StdRng, Rng, SeedableRng};
use serde::{Deserialize, Serialize};

use crate::layers::{
    city::City,
    geo_util,
    transit_network::{TransitNetwork, TransitRoute, TransitRouteType, TransitStop},
};

use super::eval::{TransitNetworkEvals, TransitRouteEvals};

// should be less than 1.0
const PUNISHMENT_NONLINEARITY: f64 = 0.3;
// const PUNISHMENT_ROUTE_LEN: f64 = 0.2;
const PUNISHMENT_BAD_TURN: f64 = 0.4;
const PUNISHMENT_STOP_DIST: f64 = 0.1;

#[derive(Serialize, Deserialize)]
pub struct OptimizedTransitNetwork {
    pub network: TransitNetwork,
    pub optimized_routes: Vec<String>,
}

// struct to store all the tunable parameters for the ACO algorithm
#[derive(Clone, Deserialize)]
pub struct ACO {
    // ACO specific parameters
    pub alpha: f64,
    pub beta: f64,
    pub rho: f64,
    pub q0: f64,
    pub num_ant: usize,
    pub max_gen: usize,
    pub pheromone_max: f64,
    pub pheromone_min: f64,
    pub init_pheromone: f64,
    // Bus specific parameters
    pub bus_capacity: usize,
    pub min_stop_dist: f64,
    pub max_stop_dist: f64,
    // Punishment parameter
    pub min_route_len: usize,
    pub max_route_len: usize,
    pub max_nonlinearity: f64,
    pub avg_stop_dist: f64,
}

// struct to support partial updates to ACO parameters
#[derive(Clone, Deserialize)]
pub struct PartialACO {
    // ACO specific parameters
    pub alpha: Option<f64>,
    pub beta: Option<f64>,
    pub rho: Option<f64>,
    pub q0: Option<f64>,
    pub num_ant: Option<usize>,
    pub max_gen: Option<usize>,
    pub pheromone_max: Option<f64>,
    pub pheromone_min: Option<f64>,
    pub init_pheromone: Option<f64>,
    // Bus specific parameters
    pub bus_capacity: Option<usize>,
    pub min_stop_dist: Option<f64>,
    pub max_stop_dist: Option<f64>,
    // Punishment parameter
    pub min_route_len: Option<usize>,
    pub max_route_len: Option<usize>,
    pub max_nonlinearity: Option<f64>,
    pub avg_stop_dist: Option<f64>,
}

impl ACO {
    // function to initialize the ACO struct with default values
    pub fn init() -> ACO {
        ACO {
            alpha: 2.0,
            beta: 3.0,
            rho: 0.2,
            q0: 1.0,
            num_ant: 20,
            max_gen: 50,
            pheromone_max: 100.0,
            pheromone_min: 10.0,
            init_pheromone: 20.0,
            bus_capacity: 50,
            min_route_len: 5,
            max_route_len: 100,
            min_stop_dist: 100.0,
            max_stop_dist: 500.0,
            max_nonlinearity: 2.0,
            avg_stop_dist: 350.0,
        }
    }

    pub fn print_stats(&self) {
        println!("ACO Parameters:");
        println!("  alpha: {}", self.alpha);
        println!("  beta: {}", self.beta);
        println!("  rho: {}", self.rho);
        println!("  q0: {}", self.q0);
        println!("  num_ant: {}", self.num_ant);
        println!("  max_gen: {}", self.max_gen);
        println!("  pheromone_max: {}", self.pheromone_max);
        println!("  pheromone_min: {}", self.pheromone_min);
        println!("  init_pheromone: {}", self.init_pheromone);
        println!("  bus_capacity: {}", self.bus_capacity);
        println!("  min_route_len: {}", self.min_route_len);
        println!("  max_route_len: {}", self.max_route_len);
        println!("  min_stop_dist: {}", self.min_stop_dist);
        println!("  max_stop_dist: {}", self.max_stop_dist);
        println!("  max_nonlinearity: {}", self.max_nonlinearity);
        println!("  avg_stop_dist: {}", self.avg_stop_dist);
    }

    // Update ACO parameters from a PartialACO
    pub fn update_from_partial(&mut self, partial: PartialACO) {
        if let Some(alpha) = partial.alpha {
            self.alpha = alpha;
        }
        if let Some(beta) = partial.beta {
            self.beta = beta;
        }
        if let Some(rho) = partial.rho {
            self.rho = rho;
        }
        if let Some(q0) = partial.q0 {
            self.q0 = q0;
        }
        if let Some(num_ant) = partial.num_ant {
            self.num_ant = num_ant;
        }
        if let Some(max_gen) = partial.max_gen {
            self.max_gen = max_gen;
        }
        if let Some(pheromone_max) = partial.pheromone_max {
            self.pheromone_max = pheromone_max;
        }
        if let Some(pheromone_min) = partial.pheromone_min {
            self.pheromone_min = pheromone_min;
        }
        if let Some(init_pheromone) = partial.init_pheromone {
            self.init_pheromone = init_pheromone;
        }
        if let Some(bus_capacity) = partial.bus_capacity {
            self.bus_capacity = bus_capacity;
        }
        if let Some(min_stop_dist) = partial.min_stop_dist {
            self.min_stop_dist = min_stop_dist;
        }
        if let Some(max_stop_dist) = partial.max_stop_dist {
            self.max_stop_dist = max_stop_dist;
        }
        if let Some(min_route_len) = partial.min_route_len {
            self.min_route_len = min_route_len;
        }
        if let Some(max_route_len) = partial.max_route_len {
            self.max_route_len = max_route_len;
        }
        if let Some(max_nonlinearity) = partial.max_nonlinearity {
            self.max_nonlinearity = max_nonlinearity;
        }
        if let Some(avg_stop_dist) = partial.avg_stop_dist {
            self.avg_stop_dist = avg_stop_dist;
        }
    }
}

struct PheromoneMap {
    pheromone: HashMap<(String, String), f64>,
    aco: Arc<ACO>,
    init_pheromone: f64,
}

impl PheromoneMap {
    fn new(aco: Arc<ACO>) -> PheromoneMap {
        PheromoneMap {
            pheromone: HashMap::new(),
            init_pheromone: aco.init_pheromone,
            aco,
        }
    }

    pub fn get(&self, from: &str, to: &str) -> f64 {
        match self.pheromone.get(&(from.to_string(), to.to_string())) {
            Some(&val) => val,
            None => self.aco.init_pheromone,
        }
    }

    pub fn update(&mut self, from: &str, to: &str, f: impl Fn(f64) -> f64) -> f64 {
        let pheromone = self
            .pheromone
            .entry((from.to_string(), to.to_string()))
            .or_insert(self.aco.init_pheromone);
        *pheromone = f(*pheromone)
            .max(self.aco.pheromone_min)
            .min(self.aco.pheromone_max);
        *pheromone
    }

    pub fn decay(&mut self) {
        for (_, val) in self.pheromone.iter_mut() {
            *val *= 1.0 - self.aco.rho;
        }
        self.init_pheromone *= 1.0 - self.aco.rho;
    }

    pub fn update_route(&mut self, route: &TransitRoute, score: f64) {
        for w in route.outbound_stops.windows(2) {
            self.update(&w[0].stop_id, &w[1].stop_id, |x| x + score);
        }
    }
}

// Helper function to calculate route-specific parameters
fn calculate_route_specific_params(route: &TransitRoute, city: &City, base_params: &ACO) -> ACO {
    let mut route_params = base_params.clone();

    if route.outbound_stops.len() > 1 {
        let mut total_dist = 0.0;
        for w in route.outbound_stops.windows(2) {
            let (from, to) = (&w[0], &w[1]);
            let (dist, _) = from.road_distance(to, &city.road);
            total_dist += dist;
        }

        // Calculate average stop distance for this specific route
        let route_avg_stop_dist = total_dist / (route.outbound_stops.len() as f64 - 1.0);

        // Set min/max as percentage variations of the average
        route_params.avg_stop_dist = route_avg_stop_dist;
        route_params.min_stop_dist = route_avg_stop_dist * 0.2; // 20% of average
        route_params.max_stop_dist = route_avg_stop_dist * 2.0; // 200% of average

        log::debug!(
            "Route-specific params: avg_dist={:.1}m, min_dist={:.1}m, max_dist={:.1}m",
            route_params.avg_stop_dist,
            route_params.min_stop_dist,
            route_params.max_stop_dist
        );
    }

    route_params
}

pub fn run_aco(
    params: ACO,
    route: &TransitRoute,
    city: &City,
    opt_transit: &TransitNetwork,
) -> Option<(TransitRoute, f64)> {
    if route.route_type != TransitRouteType::Bus {
        return None;
    }

    // Calculate route-specific stop distance metrics
    let route_params = calculate_route_specific_params(route, city, &params);

    // Initialize the pheromone map
    let aco = Arc::new(route_params);
    let mut pheromone_map = PheromoneMap::new(aco.clone());
    let mut heuristic_map = HashMap::new();

    // get the stop choices
    let stops = filter_stops_by_route_bbox(route, city, 250.0);
    // can speed up by precomputing stops to zone mapping in city struct?
    let zone_to_zone_coverage = filter_zones_by_stops(&stops, city, opt_transit);

    // Run the ACO algorithm
    let mut gen_best_route = route.clone();
    let mut gen_best_eval = evaluate_route(&aco, &gen_best_route, &city, &zone_to_zone_coverage).0;
    let init_eval = gen_best_eval;
    let mut update_pheromone = vec![];
    let mut rng = StdRng::seed_from_u64(42);
    for gen_i in 0..aco.max_gen {
        log::debug!("Generation: {}", gen_i);
        // pheromone evaporation
        pheromone_map.decay();
        // update pheromone for the best route
        pheromone_map.update_route(&gen_best_route, gen_best_eval);
        // update the pheromone for the rest of the attempts routes
        for (route, score) in update_pheromone.iter() {
            pheromone_map.update_route(route, *score);
        }
        update_pheromone.clear();
        let mut curr_best_route = gen_best_route.clone();
        let mut curr_best_eval = gen_best_eval;
        for ant_i in 0..aco.num_ant {
            log::debug!("  Ant: {}", ant_i);
            // each ant attempts to build a better route
            if let Some(new_route) = adjust_route(
                &aco,
                &gen_best_route,
                &city,
                &pheromone_map,
                &mut heuristic_map,
                &stops,
                &zone_to_zone_coverage,
                &mut rng,
            ) {
                let new_route_eval =
                    evaluate_route(&aco, &new_route, &city, &zone_to_zone_coverage).0;
                if new_route_eval > curr_best_eval {
                    update_pheromone.push((curr_best_route, curr_best_eval));
                    curr_best_route = new_route;
                    curr_best_eval = new_route_eval;
                    log::debug!("    New best route found: {}", new_route_eval);
                } else {
                    update_pheromone.push((new_route, new_route_eval));
                }
            }
        }

        if curr_best_eval > gen_best_eval {
            gen_best_route = curr_best_route;
            gen_best_eval = curr_best_eval;
        } else {
            update_pheromone.push((curr_best_route, curr_best_eval));
        }
    }

    if gen_best_eval > init_eval {
        let evals = TransitRouteEvals::for_route(opt_transit, &gen_best_route, &city.grid);
        gen_best_route.evals = Some(evals);
        gen_best_route.stop_times = route.stop_times.clone();
        return Some((gen_best_route, gen_best_eval));
    } else {
        return None;
    }
}

pub fn run_aco_batch(
    params: ACO,
    routes: &Vec<&TransitRoute>,
    city: &City,
    opt_transit: &mut TransitNetwork,
) -> Vec<String> {
    // Calculate route-specific parameters and sort routes by evaluation ascending (worst first)
    let mut routes_with_params = routes
        .iter()
        .map(|route| {
            // Calculate route-specific parameters for evaluation
            let route_params = calculate_route_specific_params(route, city, &params);

            // get the stop choices
            let stops = filter_stops_by_route_bbox(route, city, 250.0);
            // can speed up by precomputing stops to zone mapping in city struct?
            let zone_to_zone_coverage = filter_zones_by_stops(&stops, city, opt_transit);
            let eval = evaluate_route(&route_params, route, city, &zone_to_zone_coverage);
            (route, eval.0, route_params)
        })
        .collect::<Vec<_>>();
    routes_with_params.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap());

    // run aco on the routes and update the transit network
    let mut optimized_route_ids = vec![];
    let (mut count, tot) = (1, routes_with_params.len());
    for (route, _, route_params) in routes_with_params {
        println!("Optimizing route: {}, {}/{}", route.route_id, count, tot);
        count += 1;
        if let Some((optimized_route, eval)) = run_aco(route_params, route, city, opt_transit) {
            println!("  Route optimized with score: {}", eval);
            // Update the network by replacing the route
            let route_id = optimized_route.route_id.clone();
            if let Some(idx) = opt_transit
                .routes
                .iter()
                .position(|r| r.route_id == route_id)
            {
                opt_transit.routes[idx] = optimized_route;
                optimized_route_ids.push(route_id);
            }
        }
    }
    optimized_route_ids
}

pub fn run_aco_network(
    params: ACO,
    city: &City,
    transit: &TransitNetwork,
) -> OptimizedTransitNetwork {
    let routes = transit.routes.iter().collect::<Vec<_>>();

    // Create a mutable copy of the transit network
    let mut opt_transit = transit.clone();

    // Optimize routes and update the network in-place
    let optimized_route_ids = run_aco_batch(params, &routes, city, &mut opt_transit);

    // Update the network evals
    opt_transit.evals = Some(TransitNetworkEvals::for_network(&opt_transit, &city.grid));

    OptimizedTransitNetwork {
        network: opt_transit,
        optimized_routes: optimized_route_ids,
    }
}

// Helpers for ACO

// Computes a score for the route and a punishment factor for the route
fn evaluate_route(
    params: &ACO,
    route: &TransitRoute,
    city: &City,
    zone_to_zone_coverage: &HashMap<(u32, u32), u32>,
) -> (f64, f64) {
    // 1 - Compute nonlinearity Z_r
    let stops = &route.outbound_stops;
    let mut road_dist = 0.0;
    let mut bad_turn_count = 0;
    let mut path_pi = vec![];
    for w in stops.windows(2) {
        let (from, to) = (&w[0], &w[1]);
        let (dist_ij, path_ij) = from.road_distance(to, &city.road);
        // check if path_ij is a u-turn or large detour from path_pi
        let (p0, p1) = (path_pi.get(path_pi.len() - 2), path_pi.last());
        let (c0, c1) = (path_ij.first(), path_ij.get(1));
        if let (Some(p0), Some(p1), Some(c0), Some(c1)) = (p0, p1, c0, c1) {
            let (p0, p1) = (city.road.get_node(*p0).geom, city.road.get_node(*p1).geom);
            let (c0, c1) = (city.road.get_node(*c0).geom, city.road.get_node(*c1).geom);
            let diff = angle_diff(p0, p1, c0, c1);
            if diff.abs() > 178.0 {
                bad_turn_count += 1;
            }
        }
        // add the distance to the total road distance
        road_dist += dist_ij;
        path_pi = path_ij;
    }
    let straight_line_dist = geo_util::haversine(
        stops.first().unwrap().geom.x(),
        stops.first().unwrap().geom.y(),
        stops.last().unwrap().geom.x(),
        stops.last().unwrap().geom.y(),
    );
    let nonlinearity = road_dist / straight_line_dist;

    // 2 - Compute demand p_r
    let mut zones = vec![];
    let mut zones_count = HashMap::new();
    for stop in stops {
        // possible dont add demand for bad stops to not reward them
        let zone = stop.zone_index(&city.grid);
        if let Some(zone) = zone {
            if !zones.contains(&zone) {
                zones.push(zone);
                zones_count.insert(zone, 1);
            } else {
                *zones_count.entry(zone).or_insert(0) += 1;
            }
        }
    }
    let mut demand = 0.0;
    for i in 0..zones.len() {
        for j in i + 1..zones.len() {
            let (u, v) = (
                city.grid.get_zone(zones[i]).zoneid,
                city.grid.get_zone(zones[j]).zoneid,
            );
            let coverage = *zone_to_zone_coverage.get(&(u, v)).unwrap_or(&1) as f64;
            demand += (city.grid.demand_between_zones(zones[i], zones[j])
                + city.grid.demand_between_zones(zones[j], zones[i]))
                * zones_count[&zones[i]] as f64
                * 0.75
                / coverage;
        }
    }

    // compute score
    let score = demand / ((road_dist / 1000.0) * nonlinearity);

    // calculate average distance between stops
    let avg_stop_dist = if stops.len() > 1 {
        road_dist / (stops.len() as f64 - 1.0)
    } else {
        0.0
    };

    // determine punishment factor
    let mut punishment_factor = 0.0;
    if nonlinearity > params.max_nonlinearity - 0.5 {
        // max punishment if nonlinearity is greater than max_nonlinearity
        punishment_factor += PUNISHMENT_NONLINEARITY
            * ((nonlinearity - params.max_nonlinearity + 0.5) / 0.5).min(1.0);
    }
    if bad_turn_count > 0 {
        let expected_stops =
            ((straight_line_dist / params.avg_stop_dist) * params.max_nonlinearity).ceil();
        punishment_factor += PUNISHMENT_BAD_TURN
            * (bad_turn_count as f64 / (expected_stops as f64 * 0.1).max(10.0)).min(1.0);
    }
    if avg_stop_dist > 0.0 {
        // Calculate deviation from average stop distance
        if avg_stop_dist <= params.min_stop_dist || avg_stop_dist >= params.max_stop_dist {
            // Outside allowed range - maximum punishment
            punishment_factor += PUNISHMENT_STOP_DIST;
        } else {
            // Inside allowed range - scale based on distance from ideal average
            let normalized_deviation = if avg_stop_dist < params.avg_stop_dist {
                // Below average: normalize between min and avg
                (params.avg_stop_dist - avg_stop_dist)
                    / (params.avg_stop_dist - params.min_stop_dist)
            } else {
                // Above average: normalize between avg and max
                (avg_stop_dist - params.avg_stop_dist)
                    / (params.max_stop_dist - params.avg_stop_dist)
            };

            // Apply non-linear scaling (quadratic growth)
            punishment_factor +=
                PUNISHMENT_STOP_DIST * (normalized_deviation * normalized_deviation);
        }
    }

    log::debug!(
        "  Score: {}, Punishment: {}, Nonlinearity: {}, Bad Turn: {}, Avg Stop Dist: {:?}m",
        score,
        punishment_factor,
        nonlinearity,
        bad_turn_count,
        avg_stop_dist,
    );

    (
        score * (1.0 - punishment_factor).max(0.0),
        punishment_factor,
    )
}

// Compute the heuristic score for selecting a stop
fn compute_heuristic(
    from: &TransitStop,
    to: &TransitStop,
    city: &City,
    heuristic_map: &mut HashMap<(String, String), f64>,
    zone_to_zone_coverage: &HashMap<(u32, u32), u32>,
    path_prev: &Vec<NodeIndex>,
) -> f64 {
    if let Some(val) = heuristic_map.get(&(from.stop_id.clone(), to.stop_id.clone())) {
        return *val;
    }
    let (road_dist, path_curr) = from.road_distance(to, &city.road);
    // check if path_ij is a u-turn or large detour from path_pi
    let (p0, p1) = (path_prev.get(path_prev.len() - 2), path_prev.last());
    let (c0, c1) = (path_curr.first(), path_curr.get(1));
    if let (Some(p0), Some(p1), Some(c0), Some(c1)) = (p0, p1, c0, c1) {
        let (p0, p1) = (city.road.get_node(*p0).geom, city.road.get_node(*p1).geom);
        let (c0, c1) = (city.road.get_node(*c0).geom, city.road.get_node(*c1).geom);
        let diff = angle_diff(p0, p1, c0, c1);
        if diff.abs() > 178.0 {
            return 0.0;
        }
    }
    let demand_ij =
        city.grid
            .demand_between_coords(from.geom.x(), from.geom.y(), to.geom.x(), to.geom.y());
    let demand_ji =
        city.grid
            .demand_between_coords(to.geom.x(), to.geom.y(), from.geom.x(), from.geom.y());
    let zone_i = from.zone(&city.grid).unwrap();
    let zone_j = to.zone(&city.grid).unwrap();
    let coverage_ij = *zone_to_zone_coverage
        .get(&(zone_i.zoneid, zone_j.zoneid))
        .unwrap_or(&1) as f64;
    let coverage_ji = *zone_to_zone_coverage
        .get(&(zone_j.zoneid, zone_i.zoneid))
        .unwrap_or(&1) as f64;
    let h = (demand_ij + demand_ji + 0.01)
        / ((road_dist * 2.0) * (coverage_ij + coverage_ji + 1.0) + 0.01);
    heuristic_map.insert((from.stop_id.clone(), to.stop_id.clone()), h);
    h
}

fn adjust_route(
    params: &ACO,
    route: &TransitRoute,
    city: &City,
    pheromone_map: &PheromoneMap,
    heuristic_map: &mut HashMap<(String, String), f64>,
    stops: &Vec<Arc<TransitStop>>,
    zone_to_zone_coverage: &HashMap<(u32, u32), u32>,
    rng: &mut StdRng,
) -> Option<TransitRoute> {
    let first = route.outbound_stops.first().unwrap();
    let last = route.outbound_stops.last().unwrap();

    let mut new_stops = vec![first.clone()];
    let mut visited = HashSet::new(); // Use this visited list
    visited.insert(first.stop_id.clone());
    let mut radius = params.max_stop_dist;
    let max_radius = params.max_stop_dist * 3.0;
    loop {
        if geo_util::haversine(
            new_stops.last().unwrap().geom.x(),
            new_stops.last().unwrap().geom.y(),
            last.geom.x(),
            last.geom.y(),
        ) < params.max_stop_dist
            && rng.gen_bool(0.5)
        {
            new_stops.push(last.clone());
            break;
        }
        if new_stops.len() >= params.max_route_len {
            log::debug!("    Max route length reached");
            break;
        }
        let choices = valid_next_stops(
            params,
            new_stops.last().unwrap(),
            first,
            last,
            &stops,
            radius,
            new_stops.len(),
        );
        // let choices = filter_stops_by_dir(params, new_stops.last().unwrap(), last, city, radius);
        if choices.is_empty() {
            if radius >= max_radius {
                log::debug!(
                    "    No choices found after {} stops, location: {:?}, distance to end {}",
                    new_stops.len(),
                    new_stops.last().unwrap().geom,
                    geo_util::haversine(
                        new_stops.last().unwrap().geom.x(),
                        new_stops.last().unwrap().geom.y(),
                        last.geom.x(),
                        last.geom.y()
                    )
                );
                break;
            } else {
                radius *= 2.0;
                continue;
            }
        }
        if let Some(next) = select_next_stop_from_choices(
            params,
            new_stops.last().unwrap(),
            new_stops.get(new_stops.len() - 2),
            city,
            pheromone_map,
            heuristic_map,
            &choices,
            &visited,
            &zone_to_zone_coverage,
            rng,
        ) {
            visited.insert(next.stop_id.clone());
            new_stops.push(next);
            // reset radius
            radius = params.max_stop_dist;
        } else {
            log::debug!("    No stops found");
            if radius >= max_radius {
                break;
            }
            radius *= 2.0;
            continue;
        }
    }

    if new_stops.last().unwrap().stop_id != last.stop_id {
        return None;
    }

    Some(TransitRoute {
        route_id: route.route_id.clone(),
        route_type: route.route_type.clone(),
        outbound_stops: new_stops,
        inbound_stops: vec![],
        evals: None,
        stop_times: HashMap::new(),
    })
}

/// Stochastically select a stop based on ACO formula using heuristic and pheomone values
fn select_next_stop_from_choices(
    params: &ACO,
    curr: &Arc<TransitStop>,
    prev: Option<&Arc<TransitStop>>,
    city: &City,
    pheromone_map: &PheromoneMap,
    heuristic_map: &mut HashMap<(String, String), f64>,
    choices: &Vec<Arc<TransitStop>>,
    visited: &HashSet<String>,
    zone_to_zone_coverage: &HashMap<(u32, u32), u32>,
    rng: &mut StdRng,
) -> Option<Arc<TransitStop>> {
    // get the path from prev to curr, to determine if curr to stop (next) is good
    let path = if let Some(prev) = prev {
        prev.road_distance(curr, &city.road).1
    } else {
        vec![]
    };
    // compute probability of visiting each stop
    let mut weights = vec![];
    for stop in choices {
        if visited.contains(&stop.stop_id) {
            continue;
        }
        // ensure there is no u turn prev -> curr -> stop
        // if let Some(prev) = prev {
        //     let diff = angle_diff(prev.geom, curr.geom, curr.geom, stop.geom);
        //     if diff.abs() > 140.0 {
        //         continue;
        //     }
        // }

        let heuristic = compute_heuristic(
            curr,
            stop,
            city,
            heuristic_map,
            &zone_to_zone_coverage,
            &path,
        );
        if heuristic == 0.0 {
            // very low probability of selecting this stop
            weights.push(0.001);
            continue;
        }

        let pheromone = pheromone_map.get(&curr.stop_id, &stop.stop_id);
        let weight = heuristic.powf(params.alpha) * pheromone.powf(params.beta);
        weights.push(weight);
    }

    if weights.is_empty() {
        return None;
    }

    // select the next stop
    let dist = WeightedIndex::new(&weights).unwrap();
    let next = &choices[dist.sample(rng)];
    Some(next.clone())
}

///
fn filter_stops_by_route_bbox(
    route: &TransitRoute,
    city: &City,
    padding_meters: f64,
) -> Vec<Arc<TransitStop>> {
    let (mut min_lat, mut min_lon, mut max_lat, mut max_lon) = (
        f64::INFINITY,
        f64::INFINITY,
        f64::NEG_INFINITY,
        f64::NEG_INFINITY,
    );
    for stop in &route.outbound_stops {
        let lat = stop.geom.y();
        let lon = stop.geom.x();
        if lat < min_lat {
            min_lat = lat;
        }
        if lon < min_lon {
            min_lon = lon;
        }
        if lat > max_lat {
            max_lat = lat;
        }
        if lon > max_lon {
            max_lon = lon;
        }
    }
    let envelope =
        geo_util::compute_envelope_rect(min_lat, min_lon, max_lat, max_lon, padding_meters);

    log::debug!(
        "wkt: POLYGON(({} {}, {} {}, {} {}, {} {}))",
        min_lon,
        min_lat,
        max_lon,
        min_lat,
        max_lon,
        max_lat,
        min_lon,
        max_lat
    );

    city.transit
        .outbound_stops
        .locate_in_envelope(&envelope)
        .map(|s| s.stop.clone())
        .collect::<Vec<_>>()
}

fn filter_zones_by_stops(
    stops: &Vec<Arc<TransitStop>>,
    city: &City,
    opt_transit: &TransitNetwork,
) -> HashMap<(u32, u32), u32> {
    let mut zone_to_zone_coverage = HashMap::new();
    let mut zones = vec![];
    for stop in stops {
        let zone = stop.zone_index(&city.grid);
        if let Some(zone) = zone {
            if !zones.contains(&zone) {
                zones.push(zone);
            }
        }
    }
    for i in 0..zones.len() {
        for j in i + 1..zones.len() {
            for route in opt_transit.routes.iter() {
                if route
                    .outbound_stops
                    .iter()
                    .any(|stop| city.grid.get_zone(zones[i]).polygon.contains(&stop.geom))
                    && route
                        .outbound_stops
                        .iter()
                        .any(|stop| city.grid.get_zone(zones[j]).polygon.contains(&stop.geom))
                {
                    *zone_to_zone_coverage
                        .entry((
                            city.grid.get_zone(zones[i]).zoneid,
                            city.grid.get_zone(zones[j]).zoneid,
                        ))
                        .or_insert(0) += 1;
                }
            }
        }
    }
    zone_to_zone_coverage
}

fn valid_next_stops(
    params: &ACO,
    curr: &Arc<TransitStop>,
    first: &Arc<TransitStop>,
    last: &Arc<TransitStop>,
    stops: &Vec<Arc<TransitStop>>,
    radius: f64,
    stops_so_far: usize,
) -> Vec<Arc<TransitStop>> {
    let dist_fl = geo_util::haversine(first.geom.x(), first.geom.y(), last.geom.x(), last.geom.y());
    // Use the route-specific avg_stop_dist parameter for expected stops calculation
    let expected_stops =
        ((dist_fl / params.avg_stop_dist) * params.max_nonlinearity).ceil() as usize;

    stops
        .iter()
        .filter(|stop| {
            let dist =
                geo_util::haversine(curr.geom.x(), curr.geom.y(), stop.geom.x(), stop.geom.y());
            // Use the route-specific min_stop_dist
            if dist < params.min_stop_dist || dist > radius {
                return false;
            }
            let diff = angle_diff(curr.geom, stop.geom, stop.geom, last.geom);
            // diff ranges from 180 to 60 depending on distance from end to allow exploration
            let allowed_diff = 120.0 - (stops_so_far as f64 / expected_stops as f64) * 80.0;
            diff.abs() < allowed_diff
        })
        .cloned()
        .collect()
}

/// Compute the angle difference between two bearings a->b and c->d
/// Returns a value between -180 and 180
fn angle_diff(
    a: geo::Point<f64>,
    b: geo::Point<f64>,
    c: geo::Point<f64>,
    d: geo::Point<f64>,
) -> f64 {
    let (ax, ay) = (a.x(), a.y());
    let (bx, by) = (b.x(), b.y());
    let (cx, cy) = (c.x(), c.y());
    let (dx, dy) = (d.x(), d.y());
    let (v1x, v1y) = (bx - ax, by - ay);
    let (v2x, v2y) = (dx - cx, dy - cy);
    let dot = v1x * v2x + v1y * v2y;
    let cross = v1x * v2y - v1y * v2x;
    let angle = cross.atan2(dot).to_degrees();
    assert!(-180.0 <= angle && angle <= 180.0);
    angle
}
