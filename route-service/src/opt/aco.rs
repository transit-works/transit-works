use env_logger::init;
use geo::{Distance, Haversine, Length, LineString, Point};
use rand::{distributions::WeightedIndex, prelude::Distribution, SeedableRng};
use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
    time::Instant,
};

use crate::layers::{
    geo_util,
    grid::GridNetwork,
    road_network::RoadNetwork,
    transit_network::{RTreeNode, TransitNetwork, TransitRoute, TransitRouteType, TransitStop},
};

const MAX_ROUTE_LEN: usize = 100;
const MIN_ROUTE_LEN: usize = 10;
const LEN_PENALTY: f64 = 0.1;
const LOOP_PENALTY: f64 = 0.2;
const NONLINEAR_PENALTY: f64 = 0.3;
const INIT_PHEROMONE: f64 = 0.1;
const P: f64 = 0.01;
const LATITUDE_DEGREE_METERS: f64 = 110574.0;
const LONGITUDE_DEGREE_METERS: f64 = 111320.0;

pub struct ACO {
    // parameters
    alpha: f64, // pheromone weight
    beta: f64,  // heuristic weight
    rho: f64,   // pheromone evaporation rate
    q: f64,     // pheromone deposit rate
    aco_num_ant: usize,
    aco_max_gen: usize,
    max_gen: usize,
    heuristic_cache: HashMap<(String, String), f64>,
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
    }

    pub fn init() -> Self {
        let aco_num_ant = 20;
        let aco_max_gen = 10;
        let max_gen = 4;
        let alpha = 2.0;
        let beta = 3.0;
        let rho = 0.1;
        let q = 100.0;
        ACO {
            alpha: alpha,
            beta: beta,
            rho: rho,
            q: q,
            aco_num_ant: aco_num_ant,
            aco_max_gen: aco_max_gen,
            max_gen: max_gen,
            heuristic_cache: HashMap::new(),
        }
    }

    pub fn init_with_params(
        alpha: f64,
        beta: f64,
        rho: f64,
        q: f64,
        aco_num_ant: usize,
        aco_max_gen: usize,
        max_gen: usize,
    ) -> Self {
        ACO {
            alpha: alpha,
            beta: beta,
            rho: rho,
            q: q,
            aco_num_ant: aco_num_ant,
            aco_max_gen: aco_max_gen,
            max_gen: max_gen,
            heuristic_cache: HashMap::new(),
        }
    }

    // TODO cannot select stops that are not type BUS
    fn select_next_stop(
        &mut self,
        current: Arc<TransitStop>,
        end: Arc<TransitStop>,
        visited: &HashSet<String>,
        route: Vec<Arc<TransitStop>>,
        od: &GridNetwork,
        road: &RoadNetwork,
        transit: &TransitNetwork,
        pheromone: &HashMap<(String, String), f64>,
    ) -> Option<Arc<TransitStop>> {

        let distance_to_end = current.road_distance(&end, road).0;

        //log::debug!("distance to end : {}", distance_to_end);
        //if the distance to the end is less than 200m, return the end
        if distance_to_end < 200.0 {
            return Some(end.clone());
        }
        let mut rng = rand::thread_rng();
        //let mut rng = rand::rngs::StdRng::seed_from_u64(100);
        let mut choices = Vec::new();
        let mut weights = Vec::new();

        let lat = 200.0 / LATITUDE_DEGREE_METERS;
        let lon = 200.0 / (LONGITUDE_DEGREE_METERS * lat.to_radians().cos());
        let radius = lat.max(lon);

        //let nearby_stops = transit.outbound_stops.locate_within_distance([current.geom.x(), current.geom.y()], radius);

        let env = geo_util::compute_envelope(current.geom.y(), current.geom.x(), 1000.0);
        let nearby_stops = transit.outbound_stops.locate_in_envelope(&env);

        let direction_vector = [end.geom.x() - current.geom.x(), end.geom.y() - current.geom.y()];
        let direction_norm = (direction_vector[0].powi(2) + direction_vector[1].powi(2)).sqrt();
        let direction_unit = [
            direction_vector[0] / direction_norm,
            direction_vector[1] / direction_norm
        ];


        let filtered : Vec<RTreeNode>= nearby_stops.into_iter().filter(|s| {
            let new_vec = [s.stop.geom.x() - current.geom.x(), s.stop.geom.y() - current.geom.y()];
            let norm = (new_vec[0].powi(2) + new_vec[1].powi(2)).sqrt();

            let unit = [new_vec[0] / norm,  new_vec[1] / norm];
            let dot_product = direction_unit[0] * unit[0] + direction_unit[1] * unit[1];
            let angle_rad = dot_product.acos();
            let angle_deg = angle_rad.to_degrees();

            let d = current.road_distance(&s.stop, road);
            angle_deg <= 45.0 && d.0 >= 100.0// need to add min distance check
        })
        .cloned()
        .collect();

    log::trace!("filtered stops found : {}", filtered.len());

        // compute probability of visiting each stop
        let from = current.stop_id.clone();
        for nearby_stop in filtered.into_iter() {
            let stop = &nearby_stop.stop;
            if visited.contains(&stop.stop_id) {
                continue;
            }
            let to = stop.stop_id.clone();
            let pheromone = pheromone
                .get(&(from.clone(), to))
                .unwrap_or(&INIT_PHEROMONE);
            let heuristic = self.calculate_heuristic(current.clone(), stop.clone(), route.clone(), od, road);
            assert_valid_f64(*pheromone, "pheromone");
            assert_valid_f64(heuristic, "heuristic");
            let probability = pheromone.powf(self.alpha) * heuristic.powf(self.beta);
            log::trace!("probability : {}", probability);
            log::trace!("pheromone value : {}", pheromone);
            if probability == 0.0 {
                continue;
            }
            choices.push(stop.clone());
            weights.push(probability);
            assert_valid_f64(probability, "probability");
        }
        if weights.is_empty() {
            //return None
            return Some(end.clone());
        }
        let dist = WeightedIndex::new(&weights).unwrap();
        //let idx = dist.sample(&mut rng);
        let idx = weights.iter()
        .enumerate()
        .max_by(|&(_, a), &(_, b)| a.partial_cmp(&b).unwrap()) // Handle f64 safely
        .map(|(i, _)| i)
        .unwrap();
        if idx < choices.len() {
            Some(choices[idx].clone())
        } else {
            None
        }
    }

    fn update_route_pheromone(
        &mut self,
        od: &GridNetwork,
        road: &RoadNetwork,
        routes: &Vec<TransitRoute>,
        pheromone: &mut HashMap<(String, String), f64>,
    ) {
        // Decay all the pheromones
        for (_, v) in pheromone.iter_mut() {
            *v *= 1.0 - self.rho;
        }
        // Deposit pheromone on routes
        let mut tmp_pheromone = 0.0;
        //add or set the pheromone to deposit
        for i in 0..routes.len(){
            tmp_pheromone += ACO::evaluate_route(od, road, &routes[i]).0 / self.q;
        }

        for i in 0..routes.len(){
            for w in routes[i].outbound_stops.windows(2){
                let old_pheromone = pheromone.get(&(w[0].stop_id.clone(), w[1].stop_id.clone()));
                if !old_pheromone.is_none(){
                    *pheromone
                    .entry((w[0].stop_id.clone(), w[1].stop_id.clone()))
                    .or_insert(INIT_PHEROMONE) = self.rho * old_pheromone.unwrap() + tmp_pheromone;
                }
            }
        }
    }

    fn maybe_punish_route(
        &mut self,
        route: &TransitRoute,
        nonlinearity: f64,
        pheromone: &mut HashMap<(String, String), f64>,
    ) {
        let mut penalty = 0.0;
        if route.outbound_stops.len() < MIN_ROUTE_LEN {
            penalty += LEN_PENALTY;
        }
        let mut encountered = HashSet::new();
        for stop in route.outbound_stops.iter() {
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
            for w in route.outbound_stops.windows(2) {
                *pheromone
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
        pheromone: &HashMap<(String, String), f64>,
    ) -> Option<TransitRoute> {
        let start: Arc<TransitStop> = route.outbound_stops.first().unwrap().clone();
        let end: Arc<TransitStop> = route.outbound_stops.last().unwrap().clone();
        let mut stops = vec![start.clone()];

        let mut visited = HashSet::new();
        visited.insert(start.stop_id.clone());
        let mut curr = start;
        while curr != end {
            let (cx, cy) = curr.geom.x_y();
            let cid = curr.stop_id.clone();
            if let Some(next) =
                self.select_next_stop(curr, end.clone(), &visited, stops.clone(), od, road, transit, pheromone)
            {
                let (nx, ny) = next.geom.x_y();
                let (ex, ey) = end.geom.x_y();
                if log::log_enabled!(log::Level::Trace) {
                    log::trace!(
                        "        Next stop: {}, distance to end: {}",
                        next.stop_id,
                        Haversine::distance(Point::new(nx, ny), Point::new(ex, ey))
                    );
                    log::trace!(
                        "        Current stop: {}, distance to next: {}",
                        cid,
                        Haversine::distance(Point::new(cx, cy), Point::new(nx, ny))
                    );
                }
                stops.push(next.clone());
                visited.insert(next.stop_id.clone());
                curr = next;
            } else {
                log::debug!("        Failed to find a next stop");
                return None;
            }
            // prevent infinite loop
            if stops.len() > MAX_ROUTE_LEN {
                log::debug!("        Failed to reach end in limit");
                return None;
            }
        }

        Some(TransitRoute {
            route_id: route.route_id.clone(),
            route_type: route.route_type.clone(),
            inbound_stops: ACO::construct_inbound_stops(&stops, transit),
            outbound_stops: stops,
        })
    }

    /// Given a list of outbound stops, find the nearest inbound stop for each outbound stop
    ///
    /// # Arguments
    /// - `outbound`: a list of outbound stops
    /// - `transit`: the transit network
    ///
    /// # Returns
    /// A list of inbound stops that are nearest to the outbound stops
    ///
    /// Find the nearest inbound stop for each outbound stop to mirror the route as closely as possible
    /// TODO: ensure the paired stop is on the same streets, if not, take a detour and try to
    /// get back on the same path as soon as possible (e.g. one way streets)
    fn construct_inbound_stops(
        outbound: &Vec<Arc<TransitStop>>,
        transit: &TransitNetwork,
    ) -> Vec<Arc<TransitStop>> {
        outbound
            .iter()
            .map(|stop| {
                let (x, y) = stop.geom.x_y();
                transit
                    .inbound_stops
                    .nearest_neighbor(&[x, y])
                    .map(|s| s.stop.clone())
                    .unwrap_or(stop.clone())
            })
            .collect()
    }

    /// Evaluate a route based on the passenger demand and the length of the route
    ///
    /// # Arguments
    /// - `od`: the grid network
    /// - `road`: the road network
    ///
    /// # Returns
    /// A tuple of the evaluation of the route and the nonlinearity coefficient
    ///
    /// The evaluation is the passenger demand divided by the length of the route times the nonlinearity coefficient
    fn evaluate_route(od: &GridNetwork, road: &RoadNetwork, route: &TransitRoute) -> (f64, f64) {
        let mut length_route = 0.0;
        let mut passenger_demand = 0.0;
        for w in route.outbound_stops.windows(2) {
            let (fx, fy) = w[0].geom.x_y();
            let (tx, ty) = w[1].geom.x_y();

            // if geo_util::haversine(fx, fy, tx, ty) <= 100.0{
            //     continue;
            // }
            passenger_demand +=
                od.demand_between_coords(fx, fy, tx, ty) + od.demand_between_coords(tx, ty, fx, fy);
            length_route += w[0].road_distance(&w[1], road).0;
        }

        let first = route.outbound_stops.first().unwrap();
        let last = route.outbound_stops.last().unwrap();
        let straight_line = LineString::from(vec![
            (first.geom.x(), first.geom.y()),
            (last.geom.x(), last.geom.y()),
        ]);
        let straight_line_distance = straight_line.length::<Haversine>();
        let nonlinear_coefficient = length_route / straight_line_distance;

        (
            (passenger_demand + P) / (length_route * nonlinear_coefficient + P),
            nonlinear_coefficient,
        )
    }

    /// Calculate the heuristic for selecting the next stop
    ///
    /// # Arguments
    /// - `from`: the current stop
    /// - `to`: the next stop
    /// - `end`: the goal stop (end of route)
    /// - `od`: the grid network
    /// - `road`: the road network
    ///
    /// # Returns
    /// The heuristic value for the edge (from, to)
    ///
    /// TODO heuristic should consider nearby busses and also the length of the route
    /// Probably want to cache costs between stops / nodes on road network
    fn calculate_heuristic(
        &mut self,
        from: Arc<TransitStop>,
        to: Arc<TransitStop>,
        stops: Vec<Arc<TransitStop>>,
        od: &GridNetwork,
        road: &RoadNetwork,
    ) -> f64 {
        if let Some(heuristic) = self
            .heuristic_cache
            .get(&(from.stop_id.clone(), to.stop_id.clone()))
        {
            return *heuristic;
        }
        //let (fx, fy) = from.geom.x_y();
        //let (tx, ty) = to.geom.x_y();
        // TODO should consider other existing routes and avoid canibalizing demand
        // figure out how to find number of routes that use this stop

        let mut heuristic = 0.0;
        for stop in &stops {
            let (fx, fy) = stops[0].geom.x_y();
            let (tx, ty) = stop.geom.x_y();
            let demand = od.demand_between_coords(fx, fy, tx, ty) + od.demand_between_coords(tx, ty, fx, fy) + P;
            assert_valid_f64(demand, "demand");
            let length_of_route = stop.road_distance(&to, road).0 + to.road_distance(stop, road).0;
            if length_of_route == 0.0{
                return 0.0;
            }

            heuristic += demand/length_of_route;
        }

        // let demand =
        //     od.demand_between_coords(fx, fy, tx, ty) + od.demand_between_coords(tx, ty, fx, fy);
        //let (distance_f_t, _) = from.road_distance(&to, road);
        // if distance_f_t == 0.0 {
        //     return 0.0;
        // }
        //assert_valid_f64(demand, "demand");
        // P is a constant to prevent 0 heuristic and division by 0
        // (demand + P) / (2.0 * distance_f_t + P)
        //let heuristic = (demand + P) / (2.0 * distance_f_t);
        self.heuristic_cache
            .insert((from.stop_id.clone(), to.stop_id.clone()), heuristic);
        heuristic
    }

    pub fn optimize_route(
        &mut self,
        od: &GridNetwork,
        road: &RoadNetwork,
        transit: &TransitNetwork,
        route: &TransitRoute,
    ) -> Option<(TransitRoute, f64)> {
        let mut pheromone = HashMap::new();
        let mut best_route = route.clone();
        let mut best_eval = ACO::evaluate_route(od, road, route);
        let init_eval = ACO::evaluate_route(od, road, route);
        let gen_best_eval = best_eval;
        log::debug!("    Initial route len : {}", route.outbound_stops.len());
        log::debug!("inital evaluation : {}", init_eval.0);
        for aco_max_gen_i in 0..self.aco_max_gen {
            let mut ant_routes : Vec<TransitRoute> = Vec::new();
            log::debug!("    Gen {}", aco_max_gen_i);
            // Update pheromone for route
            //self.update_route_pheromone(od, road, &best_route, &mut pheromone);
            for aco_num_ant_i in 0..self.aco_num_ant {
                log::debug!("      Ant {}", aco_num_ant_i);
                if let Some(new_route) = self.adjust_route(
                    &best_route,
                    od,
                    road,
                    transit,
                    &vec![best_route.clone()],
                    &pheromone,
                ) {
                    ant_routes.push(new_route.clone());
                    let new_eval = ACO::evaluate_route(od, road, &new_route);
                    //log::debug!("new route evaluated to : {}", new_eval.0);
                    if new_eval.0 > best_eval.0 {
                        best_eval = new_eval;
                        best_route = new_route;
                        log::debug!("    New best route len : {}", best_route.outbound_stops.len());
                    }
                } else {
                    log::debug!("        Failed to build new route");
                }
            }
            self.update_route_pheromone(od, road, &ant_routes, &mut pheromone);
            self.maybe_punish_route(&best_route, best_eval.1, &mut pheromone);
        }
        if gen_best_eval.0 < best_eval.0 {
            Some((best_route, best_eval.0))
        } else {
            log::debug!("Returned original route because not better route was found");
            Some((route.clone(), init_eval.0))
        }
    }

    pub fn optimize_routes(
        &mut self,
        od: &GridNetwork,
        road: &RoadNetwork,
        transit: &TransitNetwork,
        routes: &Vec<&TransitRoute>,
    ) -> Vec<TransitRoute> {
        log::info!("Running ACO");
        self.print_stats();
        let start = Instant::now();
        let mut best_routes = routes
            .iter()
            .map(|route| (*route).clone())
            .collect::<Vec<_>>();
        for max_gen_i in 0..self.max_gen {
            log::debug!("ACO generation {}", max_gen_i);
            // Sort the routes by their evaluate_route
            best_routes.sort_by(|a, b| {
                ACO::evaluate_route(od, road, b)
                    .0
                    .partial_cmp(&ACO::evaluate_route(od, road, a).0)
                    .unwrap()
            });
            for i in 0..best_routes.len() {
                log::debug!("  Route {}, id: {}", i, best_routes[i].route_id);
                // Do not optimize non-bus routes
                if best_routes[i].route_type != TransitRouteType::Bus {
                    continue;
                }
                if let Some((best_route, _)) =
                    self.optimize_route(od, road, transit, &best_routes[i])
                {
                    best_routes[i] = best_route;
                } else {
                    log::debug!("      Route did not improve");
                }
            }
        }
        log::info!(
            "ACO finished in {:?}, returing {} optimized routes",
            start.elapsed(),
            best_routes.len()
        );
        best_routes
    }

    pub fn optimize_network(
        &mut self,
        od: &GridNetwork,
        road: &RoadNetwork,
        transit: &TransitNetwork,
    ) -> Vec<TransitRoute> {
        self.optimize_routes(od, road, transit, &transit.routes.iter().collect())
    }
}

fn assert_valid_f64(f: f64, name: &str) {
    assert!(f.is_finite(), "{} must be finite ({})", name, f);
    assert!(f == 0.0 || f.is_normal(), "{} must be normal ({})", name, f);
    assert!(f >= 0.0, "{} must be greater than 0 ({})", name, f);
}
