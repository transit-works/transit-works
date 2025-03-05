use std::{collections::{HashMap, HashSet}, sync::Arc};

use geo::{Bearing, Geodesic};
use rand::{
    distributions::WeightedIndex,
    prelude::Distribution,
    rngs::{StdRng, ThreadRng},
    SeedableRng,
};

use crate::{
    layers::{
        city::City,
        geo_util,
        transit_network::{TransitRoute, TransitRouteType, TransitStop},
    },
    opt::eval,
};

// struct to store all the tunable parameters for the ACO algorithm
pub struct ACO {
    // ACO specific parameters
    alpha: f64,
    beta: f64,
    rho: f64,
    q0: f64,
    num_ant: usize,
    max_gen: usize,
    pheromone_max: f64,
    pheromone_min: f64,
    init_pheromone: f64,
    // Bus specific parameters
    bus_capacity: usize,
    min_stop_dist: f64,
    max_stop_dist: f64,
    // Punishment parameter
    min_route_len: usize,
    max_route_len: usize,
    max_nonlinearity: f64,
    avg_stop_dist: f64,
}

// should be less than 1.0
const PUNISHMENT_NONLINEARITY: f64 = 0.3;
const PUNISHMENT_ROUTE_LEN: f64 = 0.3;
const PUNISHMENT_STOP_DIST: f64 = 0.4;

impl ACO {
    // function to initialize the ACO struct with default values
    pub fn init() -> ACO {
        ACO {
            alpha: 2.0,
            beta: 3.0,
            rho: 0.1,
            q0: 1.0,
            num_ant: 20,
            max_gen: 10,
            pheromone_max: 30.0,
            pheromone_min: 5.0,
            init_pheromone: 20.0,
            bus_capacity: 50,
            min_route_len: 5,
            max_route_len: 100,
            min_stop_dist: 100.0,
            max_stop_dist: 500.0,
            max_nonlinearity: 1.5,
            avg_stop_dist: 200.0,
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

pub fn run_aco(params: ACO, route: &TransitRoute, city: &City) -> Option<(TransitRoute, f64)> {
    if route.route_type != TransitRouteType::Bus {
        return None;
    }

    // Initialize the pheromone map
    let aco = Arc::new(params);
    let mut pheromone_map = PheromoneMap::new(aco.clone());
    let mut heuristic_map = HashMap::new();

    // Run the ACO algorithm
    let mut gen_best_route = route.clone();
    let mut gen_best_eval = evaluate_route(&aco, &gen_best_route, &city).0;
    let init_eval = gen_best_eval;
    for gen_i in 0..aco.max_gen {
        println!("Generation: {}", gen_i);
        // pheromone evaporation
        pheromone_map.decay();
        pheromone_map.update_route(&gen_best_route, gen_best_eval);
        let mut curr_best_route = gen_best_route.clone();
        let mut curr_best_eval = gen_best_eval;
        for ant_i in 0..aco.num_ant {
            println!("  Ant: {}", ant_i);
            // each ant attempts to build a better route
            if let Some(new_route) = adjust_route(&aco, &gen_best_route, &city, &pheromone_map, &mut heuristic_map) {
                let new_route_eval = evaluate_route(&aco, &new_route, &city).0;
                if new_route_eval > curr_best_eval {
                    curr_best_route = new_route;
                    curr_best_eval = new_route_eval;
                    println!("    New best route found: {}", new_route_eval);
                }
            }
        }

        if curr_best_eval > gen_best_eval {
            gen_best_route = curr_best_route;
            gen_best_eval = curr_best_eval;
        }
    }

    if gen_best_eval > init_eval {
        return Some((gen_best_route, gen_best_eval));
    } else {
        return None;
    }
}

// Helpers for ACO

// Computes a score for the route and a punishment factor for the route
fn evaluate_route(params: &ACO, route: &TransitRoute, city: &City) -> (f64, f64) {
    // 1 - Compute nonlinearity Z_r
    let stops = &route.outbound_stops;
    let mut road_dist = 0.0;
    let mut encountered_nodes = HashSet::new();
    let mut duplicate_nodes = 0;
    for w in stops.windows(2) {
        let (from, to) = (&w[0], &w[1]);
        let (dist_ij, mut path_ij) = from.road_distance(to, &city.road);
        road_dist += dist_ij;
        for node in path_ij.drain(0..) {
            if encountered_nodes.contains(&node) {
                duplicate_nodes += 1;
            }
            encountered_nodes.insert(node);
        }
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
    for stop in stops {
        let (x, y) = (stop.geom.x(), stop.geom.y());
        let zone = city.grid.find_nearest_zone(x, y);
        if let Some(zone) = zone {
            if !zones.contains(&zone) {
                zones.push(zone);
            }
        }
    }
    let mut demand = 0.0;
    for i in 0..zones.len() {
        for j in i + 1..zones.len() {
            demand += city.grid.demand_between_zones(zones[i], zones[j])
                + city.grid.demand_between_zones(zones[j], zones[i]);
        }
    }

    // compute score
    let score = demand / ((road_dist / 1000.0) * nonlinearity);

    // determine punishment factor
    let mut punishment_factor = 0.0;
    if nonlinearity > params.max_nonlinearity {
        punishment_factor += PUNISHMENT_NONLINEARITY;
    }
    if stops.len() < params.min_route_len {
        punishment_factor += PUNISHMENT_ROUTE_LEN;
    }
    if stops.len() > params.max_route_len {
        punishment_factor += PUNISHMENT_ROUTE_LEN;
    }
    println!("  Score: {}, Punishment: {}, Nonlinearity: {}, Duplicate Nodes: {}", score, punishment_factor, nonlinearity, duplicate_nodes);

    (score * (1.0 - punishment_factor), punishment_factor)
}

// Compute the heuristic score for selecting a stop
fn compute_heuristic(from: &TransitStop, to: &TransitStop, city: &City, heuristic_map: &mut HashMap<(String, String), f64>) -> f64 {
    if let Some(val) = heuristic_map.get(&(from.stop_id.clone(), to.stop_id.clone())) {
        return *val;
    }
    let road_dist = from.road_distance(to, &city.road).0;
    let demand_ij =
        city.grid
            .demand_between_coords(from.geom.x(), from.geom.y(), to.geom.x(), to.geom.y());
    let demand_ji =
        city.grid
            .demand_between_coords(to.geom.x(), to.geom.y(), from.geom.x(), from.geom.y());
    // TODO other routes
    let h = (demand_ij + demand_ji + 0.1) / (road_dist * 2.0);
    heuristic_map.insert((from.stop_id.clone(), to.stop_id.clone()), h);
    h
}

fn adjust_route(
    params: &ACO,
    route: &TransitRoute,
    city: &City,
    pheromone_map: &PheromoneMap,
    heuristic_map: &mut HashMap<(String, String), f64>,
) -> Option<TransitRoute> {
    let first = route.outbound_stops.first().unwrap();
    let last = route.outbound_stops.last().unwrap();

    let mut new_stops = vec![first.clone()];
    let mut visited = HashSet::new(); // Use this visited list
    visited.insert(first.stop_id.clone());
    let mut radius = params.max_stop_dist;
    loop {
        if new_stops.len() >= params.max_route_len {
            break;
        }
        if let Some(next) = select_next_stop_from_choices(
            params,
            new_stops.last().unwrap(),
            city,
            pheromone_map,
            heuristic_map,
            &filter_stops_by_dir(params, new_stops.last().unwrap(), last, city, radius),
            &visited,
        ) {
            visited.insert(next.stop_id.clone());
            new_stops.push(next);
        } else if radius > 1000.0 {
            break;
        } else {
            radius += 250.0;
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
    })
}

/// Stochastically select a stop based on ACO formula using heuristic and pheomone values
fn select_next_stop_from_choices(
    params: &ACO,
    curr: &Arc<TransitStop>,
    city: &City,
    pheromone_map: &PheromoneMap,
    heuristic_map: &mut HashMap<(String, String), f64>,
    choices: &Vec<Arc<TransitStop>>,
    visited: &HashSet<String>,
) -> Option<Arc<TransitStop>> {
    // compute probability of visiting each stop
    let mut weights = vec![];
    for stop in choices {
        if visited.contains(&stop.stop_id) {
            continue;
        }
        let heuristic = compute_heuristic(curr, stop, city, heuristic_map);
        let pheromone = pheromone_map.get(&curr.stop_id, &stop.stop_id);
        let weight = heuristic.powf(params.alpha) * pheromone.powf(params.beta);
        weights.push(weight);
    }

    if weights.is_empty() {
        return None;
    }

    // select the next stop
    let mut rng = ThreadRng::default();
    let dist = WeightedIndex::new(&weights).unwrap();
    let next = &choices[dist.sample(&mut rng)];
    Some(next.clone())
}

fn filter_stops_by_dir(
    params: &ACO,
    curr: &Arc<TransitStop>,
    last: &Arc<TransitStop>,
    city: &City,
    radius: f64,
) -> Vec<Arc<TransitStop>> {
    let dist = curr.road_distance(last, &city.road).0;
    if dist < params.avg_stop_dist {
        return vec![last.clone()];
    }

    let envelope = geo_util::compute_envelope(curr.geom.y(), curr.geom.x(), radius);
    let stops = city.transit.outbound_stops.locate_in_envelope(&envelope);

    // only select the stops that have a bearing towards the last stop within 90 degrees
    stops
        .map(|s| s.stop.clone())
        .filter(|stop| {
            let dist =
                geo_util::haversine(curr.geom.x(), curr.geom.y(), stop.geom.x(), stop.geom.y());
            if dist < params.min_stop_dist {
                return false;
            }
            let bearing = Geodesic::bearing(curr.geom, stop.geom);
            let normalized_bearing = (bearing + 360.0) % 360.0;
            let bearing_to_last = Geodesic::bearing(stop.geom, last.geom);
            let normalized_bearing_to_last = (bearing_to_last + 360.0) % 360.0;
            let diff = (normalized_bearing - normalized_bearing_to_last).abs();
            diff < 110.0
        })
        .collect::<Vec<_>>()
}

/// 
fn filter_stops_by_bbox(
    curr: &Arc<TransitStop>,
    last: &Arc<TransitStop>,
    city: &City,
    padding_meters: f64,
) -> Vec<Arc<TransitStop>> {
    let envelope = geo_util::compute_envelope_rect(
        curr.geom.y(),
        curr.geom.x(),
        last.geom.y(),
        last.geom.x(),
        padding_meters,
    );
    city
        .transit
        .outbound_stops
        .locate_in_envelope(&envelope)
        .map(|s| s.stop.clone())
        .collect::<Vec<_>>()
}
