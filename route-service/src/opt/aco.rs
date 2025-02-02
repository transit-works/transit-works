use rand::Rng;
use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};

use crate::layers::{
    grid::GridNetwork,
    road_network::RoadNetwork,
    transit_network::{TransitNetwork, TransitRoute, TransitStop},
};

const MAX_ROUTE_LEN: usize = 20;
const INIT_PHEROMONE: f64 = 0.1;
const P: f64 = 0.1;

pub struct ACO {
    // parameters
    alpha: f64, // pheromone weight
    beta: f64,  // heuristic weight
    rho: f64,   // pheromone evaporation rate
    q: f64,     // pheromone deposit rate
    num_ants: usize,
    num_iterations: usize,
    // pheromone is assigned to edges between stops
    pheromone: HashMap<(String, String), f64>,
    solutions: Vec<Vec<TransitRoute>>,
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
        println!("  Number of ants: {}", self.num_ants);
        println!("  Number of iterations: {}", self.num_iterations);
        println!("  Number of pheromones: {}", self.pheromone.len());
    }

    pub fn init(transit: &TransitNetwork) -> Self {
        let num_ants = 20;
        let num_iterations = 200;
        let alpha = 2.0;
        let beta = 3.0;
        let rho = 0.1;
        let q = 100.0;
        let mut pheromone = HashMap::new();
        let solutions = Vec::new();

        // Initialize pheromone matrix
        // Place small amount of pheromone on edges between stops on existing routes
        for route in transit.routes.iter() {
            for i in 0..route.stops.len() - 1 {
                let from = route.stops[i].stop_id.clone();
                let to = route.stops[i + 1].stop_id.clone();
                pheromone.insert((from, to), INIT_PHEROMONE);
            }
        }

        ACO {
            alpha,
            beta,
            rho,
            q,
            num_ants,
            num_iterations,
            pheromone,
            solutions,
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
        let coords = current.geom.x_y();
        let nearby_stops = transit
            .stops
            .locate_within_distance([coords.0, coords.1], 500.0);

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
                .get(&(from.clone(), to.clone()))
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

    fn calculate_heuristic(
        &self,
        from: Arc<TransitStop>,
        to: Arc<TransitStop>,
        end: Arc<TransitStop>,
        od: &GridNetwork,
        _road: &RoadNetwork,
    ) -> f64 {
        let (fx, fy) = from.geom.x_y();
        let (tx, ty) = to.geom.x_y();
        // TODO should consider other existing routes and avoid canibalizing demand
        // find number of routes that use the stop
        //
        let demand = od.demand_between_coords(fx, fy, tx, ty);
        let reversed_demand = od.demand_between_coords(tx, ty, fx, fy);
        // euclidean distance to end stop, to encourage stops that move towards to end
        let (ex, ey) = end.geom.x_y();
        // TODO make this road distance
        let distance = ((tx - ex).powi(2) + (ty - ey).powi(2)).sqrt();
        (demand + reversed_demand + P) / (2.0 * distance)
    }

    fn update_pheromone(&mut self, routes: &[TransitRoute]) {
        // Decay
        for pheromone in self.pheromone.values_mut() {
            *pheromone *= 1.0 - self.rho;
        }

        // Deposit pheromone on routes
        for route in routes {
            // TODO deposit should be proportional to route evaluation
            let deposit = self.q / route.stops.len() as f64;
            for i in 0..route.stops.len() - 1 {
                let from = route.stops[i].stop_id.clone();
                let to = route.stops[i + 1].stop_id.clone();
                let pheromone = self.pheromone.get_mut(&(from, to)).unwrap();
                *pheromone += deposit;
            }
        }
    }

    //returns the best solution from a list of solutions based on an evaluation function
    fn evaluate_solutions(
        &mut self,
        solutions: Vec<Vec<TransitRoute>>,
        od: &GridNetwork,
    ) -> Vec<TransitRoute> {
        let mut best_solution: Vec<TransitRoute> = Vec::new();
        let mut best_cost: f64 = 0.0;
        for solution in solutions.iter() {
            let mut curr_cost: f64 = 0.0;
            for tr in solution.iter() {
                for i in 0..tr.stops.len() - 1 {
                    let from = tr.stops[i].clone();
                    let to = tr.stops[i + 1].clone();

                    let (fx, fy) = from.geom.x_y();
                    let (tx, ty) = to.geom.x_y();

                    let demand = od.demand_between_coords(fx, fy, tx, ty);
                    // TODO make this road distance and fix it based on research paper
                    let distance = ((tx - fx).powi(2) + (ty - fy).powi(2)).sqrt();

                    curr_cost += demand / distance;
                }
            }

            if curr_cost > best_cost {
                best_cost = curr_cost;
                best_solution = solution.clone();
            }

            curr_cost = 0.0;
        }

        best_solution
    }

    pub fn adjust_route(
        &mut self,
        route: &TransitRoute,
        od: &GridNetwork,
        road: &RoadNetwork,
        transit: &TransitNetwork,
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
        let mut ret = TransitNetwork {
            routes: Vec::new(),
            stops: transit.stops.clone(),
        };

        //initialize solutions
        let mut best_solution = transit.routes.clone();
        ret.routes = best_solution.clone();

        for _ in 0..self.num_iterations {
            for _ in 0..self.num_ants {
                let mut new_routes: Vec<TransitRoute> = Vec::new();
                // TODO: cannot adjust routes that are not type BUS
                // TODO: need to parrallelize this
                for route in best_solution.iter() {
                    if let Some(new_route) = self.adjust_route(route, od, road, &ret) {
                        new_routes.push(new_route);
                    }
                }
                self.solutions.push(new_routes.clone());
                self.update_pheromone(&new_routes);
                ret.routes = new_routes;
            }

            best_solution = self.evaluate_solutions(self.solutions.clone(), od);
        }
        ret
    }
}
