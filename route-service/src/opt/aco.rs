use geo::{Haversine, Length, LineString};
use rand::Rng;
use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
    time::Instant,
};

use crate::{
    gtfs::structs::RouteType,
    layers::{
        geo_util,
        grid::GridNetwork,
        road_network::RoadNetwork,
        transit_network::{TransitNetwork, TransitRoute, TransitStop},
    },
};

const MAX_ROUTE_LEN: usize = 50;
const MIN_ROUTE_LEN: usize = 10;
const LEN_PENALTY: f64 = 0.1;
const LOOP_PENALTY: f64 = 0.2;
const NONLINEAR_PENALTY: f64 = 0.3;
const INIT_PHEROMONE: f64 = 0.1;
const P: f64 = 0.1;

pub struct ACO {
    // parameters
    alpha: f64, // pheromone weight
    beta: f64,  // heuristic weight
    rho: f64,   // pheromone evaporation rate
    q: f64,     // pheromone deposit rate
    aco_num_ant: usize,
    aco_max_gen: usize,
    max_gen: usize,
    // pheromone is assigned to edges between stops
    pheromone: HashMap<(String, String), f64>,
}

// Assumptions:
//   1. The number of routes remains the same
//   2. The start and end stops of each route remain the same
// https://ieeexplore.ieee.org/document/8790117
impl ACO {
    pub fn print_stats(&self) {
        println!("ACO parameters:");
        println!("  Alpha: {}", self.alpha);
        println!("  Beta: {}", self.beta);
        println!("  Rho: {}", self.rho);
        println!("  Q: {}", self.q);
        println!("  Number of ants: {}", self.aco_num_ant);
        println!("  Number of ant iterations: {}", self.aco_max_gen);
        println!("  Number of iterations: {}", self.max_gen);
        println!("  Number of pheromones: {}", self.pheromone.len());
    }

    pub fn init() -> Self {
        let aco_num_ant = 5;
        let aco_max_gen = 5;
        let max_gen = 2;
        let alpha = 2.0;
        let beta = 3.0;
        let rho = 0.1;
        let q = 100.0;
        let pheromone = HashMap::new();
        ACO {
            alpha,
            beta,
            rho,
            q,
            aco_num_ant,
            aco_max_gen,
            max_gen,
            pheromone,
        }
    }

    // TODO cannot select stops that are not type BUS
    fn select_next_stop(
        &self,
        current: Arc<TransitStop>,
        end: Arc<TransitStop>,
        visited: &HashSet<String>,
        od: &GridNetwork,
        road: &RoadNetwork,
        transit: &TransitNetwork,
    ) -> Option<Arc<TransitStop>> {
        let mut rng = rand::thread_rng();
        let mut probabilities = Vec::new();
        let mut total = 0.0;

        // all stops in 500m radius
        let (x, y) = current.geom.x_y();
        let sq_r = geo_util::compute_square_radius(x, y, 500.0);
        let nearby_stops = transit.stops.locate_within_distance([x, y], sq_r);

        // compute probability of visiting each stop
        let from = current.stop_id.clone();
        for nearby_stop in nearby_stops.into_iter() {
            let stop = &nearby_stop.stop;
            // return the goal stop immediately if it is nearby
            if stop.stop_id == end.stop_id {
                return Some(stop.clone());
            }
            if visited.contains(&stop.stop_id) {
                continue;
            }
            let to = stop.stop_id.clone();
            let pheromone = self
                .pheromone
                .get(&(from.clone(), to))
                .unwrap_or(&INIT_PHEROMONE);
            let heuristic =
                self.calculate_heuristic(current.clone(), stop.clone(), end.clone(), od, road);
            let probability = pheromone.powf(self.alpha) * heuristic.powf(self.beta);
            total += probability;
            probabilities.push((stop.clone(), probability));
        }

        // roulette wheel selection
        let random_value = rng.gen::<f64>() * total;
        let mut cumulative = 0.0;
        for (stop, prob) in probabilities {
            cumulative += prob;
            if cumulative >= random_value {
                return Some(stop);
            }
        }

        // no stop selected
        None
    }

    // TODO heuristic should consider nearby busses and also the length of the route
    // Probably want to cache costs between stops / nodes on road network
    fn calculate_heuristic(
        &self,
        from: Arc<TransitStop>,
        to: Arc<TransitStop>,
        end: Arc<TransitStop>,
        od: &GridNetwork,
        road: &RoadNetwork,
    ) -> f64 {
        let (fx, fy) = from.geom.x_y();
        let (tx, ty) = to.geom.x_y();
        // TODO should consider other existing routes and avoid canibalizing demand
        // find number of routes that use the stop
        let demand =
            od.demand_between_coords(fx, fy, tx, ty) + od.demand_between_coords(tx, ty, fx, fy);
        // euclidean distance to end stop, to encourage stops that move towards to end
        let (ex, ey) = end.geom.x_y();
        // TODO make this road distance
        let distance = ((tx - ex).powi(2) + (ty - ey).powi(2)).sqrt();
        (demand + P) / (2.0 * distance)
    }

    fn update_route_pheromone(
        &mut self,
        od: &GridNetwork,
        road: &RoadNetwork,
        route: &TransitRoute,
    ) {
        // Decay all the pheromones
        for (_, v) in self.pheromone.iter_mut() {
            *v *= 1.0 - self.rho;
        }
        // Deposit pheromone on routes
        let deposit = ACO::evaluate_route(od, road, route).0 / self.q;
        // add or set the pheromone to deposit
        for w in route.stops.windows(2) {
            *self
                .pheromone
                .entry((w[0].stop_id.clone(), w[1].stop_id.clone()))
                .or_insert(0.0) += deposit;
        }
    }

    fn evaluate_route(od: &GridNetwork, road: &RoadNetwork, route: &TransitRoute) -> (f64, f64) {
        let mut length_route = 0.0;
        let mut passenger_demand = 0.0;
        for w in route.stops.windows(2) {
            let (fx, fy) = w[0].geom.x_y();
            let (tx, ty) = w[1].geom.x_y();
            passenger_demand +=
                od.demand_between_coords(fx, fy, tx, ty) + od.demand_between_coords(tx, ty, fx, fy);
            length_route += road.get_road_distance(fx, fy, tx, ty).0 * 2.0;
        }

        let first = route.stops.first().unwrap();
        let last = route.stops.last().unwrap();
        let straight_line = LineString::from(vec![
            (first.geom.x(), first.geom.y()),
            (last.geom.x(), last.geom.y()),
        ]);
        let straight_line_distance = straight_line.length::<Haversine>();
        let nonlinear_coefficient = length_route / straight_line_distance;

        (
            passenger_demand / (length_route * nonlinear_coefficient),
            nonlinear_coefficient,
        )
    }

    fn maybe_punish_route(&mut self, route: &TransitRoute, nonlinearity: f64) {
        let mut penalty = 0.0;
        if route.stops.len() < MIN_ROUTE_LEN {
            penalty += LEN_PENALTY;
        }
        let mut encountered = HashSet::new();
        for stop in route.stops.iter() {
            if encountered.contains(&stop.stop_id) {
                penalty += LOOP_PENALTY;
                break;
            }
            encountered.insert(stop.stop_id.clone());
        }
        if nonlinearity > 1.5 {
            penalty += NONLINEAR_PENALTY;
        }
        if penalty > 0.0 {
            for w in route.stops.windows(2) {
                *self
                    .pheromone
                    .entry((w[0].stop_id.clone(), w[1].stop_id.clone()))
                    .or_insert(INIT_PHEROMONE) *= 1.0 - penalty;
            }
        }
    }

    fn adjust_route(
        &mut self,
        route: &TransitRoute,
        od: &GridNetwork,
        road: &RoadNetwork,
        transit: &TransitNetwork,
        routes: &[TransitRoute],
    ) -> Option<TransitRoute> {
        let start: Arc<TransitStop> = route.stops.first().unwrap().clone();
        let end: Arc<TransitStop> = route.stops.last().unwrap().clone();
        let mut stops = vec![start.clone()];

        let mut visited = HashSet::new();
        visited.insert(start.stop_id.clone());
        let mut curr = start;
        while curr != end {
            if let Some(next) =
                self.select_next_stop(curr, end.clone(), &visited, od, road, transit)
            {
                stops.push(next.clone());
                visited.insert(next.stop_id.clone());
                curr = next;
            } else {
                return None;
            }
            // prevent infinite loop
            if stops.len() > MAX_ROUTE_LEN {
                return None;
            }
        }

        Some(TransitRoute {
            route_id: route.route_id.clone(),
            route_type: route.route_type,
            stops: stops,
        })
    }

    pub fn run(
        &mut self,
        od: &GridNetwork,
        road: &RoadNetwork,
        transit: &TransitNetwork,
    ) -> TransitNetwork {
        log::info!("Running ACO");
        self.print_stats();
        let start = Instant::now();
        let mut best_routes = transit.routes.clone();
        for max_gen_i in 0..self.max_gen {
            log::debug!("ACO generation {}", max_gen_i);
            // Sort the routes by their evaluate_route
            // best_routes.sort_by(|a, b| {
            //     ACO::evaluate_route(od, road, b)
            //         .0
            //         .partial_cmp(&ACO::evaluate_route(od, road, a).0)
            //         .unwrap()
            // });
            for i in 0..best_routes.len() {
                log::debug!("  Route {}", i);
                // Do not optimize non-bus routes
                if best_routes[i].route_type != RouteType::Bus {
                    continue;
                }
                // Update pheromone for route
                let mut best_route = best_routes[i].clone();
                let mut best_eval = ACO::evaluate_route(&od, &road, &best_route);
                for aco_max_gen_i in 0..self.aco_max_gen {
                    log::debug!("    Ant {}", aco_max_gen_i);
                    self.update_route_pheromone(od, road, &best_route);
                    for aco_num_ant_i in 0..self.aco_num_ant {
                        log::debug!("      Ant {}", aco_num_ant_i);
                        if let Some(new_route) =
                            self.adjust_route(&best_route, od, road, transit, &best_routes)
                        {
                            let new_eval = ACO::evaluate_route(&od, &road, &new_route);
                            if new_eval.0 > best_eval.0 {
                                best_eval = new_eval;
                                best_route = new_route;
                            }
                        }
                    }
                    // TODO punish the pheromone for the route if needed
                    self.maybe_punish_route(&best_route, best_eval.1);
                }
                // If the route is better than the best route, replace it
                if ACO::evaluate_route(&od, &road, &best_routes[i]).0 < best_eval.0 {
                    best_routes[i] = best_route;
                }
            }
        }
        log::info!(
            "ACO finished in {:?}, returing {} optimized routes",
            start.elapsed(),
            best_routes.len()
        );
        TransitNetwork {
            routes: best_routes,
            stops: transit.stops.clone(),
        }
    }
}
