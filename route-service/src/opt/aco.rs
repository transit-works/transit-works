use std::collections::HashMap;

use petgraph::visit::EdgeRef;

use crate::layers::{
    grid::{GridNetwork, Link},
    road_network::RoadNetwork,
    transit_network::{TransitNetwork, TransitRoute},
};

struct AntColony {
    // Parameters
    alpha: f64, // pheromone weight
    beta: f64,  // heuristic weight
    rho: f64,   // pheromone evaporation rate
    q: f64,     // pheromone deposit rate
    num_ants: usize,
    num_iterations: usize,
    num_repetitions: usize,
    // Data
    transit: TransitNetwork,
    grid: GridNetwork,
    road: RoadNetwork,
    pheromone: HashMap<(u32, u32), f64>,
}

// Assumptions:
//   1. The number of routes remains the same
//   2. The start and end stops of each route remain the same
// https://ieeexplore.ieee.org/document/8790117
impl AntColony {
    fn init(transit: TransitNetwork, grid: GridNetwork, road: RoadNetwork) -> Self {
        let num_ants = 10;
        let num_iterations = 100;
        let num_repetitions = 10;
        let alpha = 1.0;
        let beta = 2.0;
        let rho = 0.1;
        let q = 1.0;
        let mut pheromone = HashMap::new();

        // Initialize pheromone matrix
        for edge in grid.graph.edge_references() {
            let src = grid.graph[edge.source()].zoneid;
            let dst = grid.graph[edge.target()].zoneid;
            pheromone.insert((src, dst), 0.1);
        }

        AntColony {
            alpha,
            beta,
            rho,
            q,
            num_ants,
            num_iterations,
            num_repetitions,
            transit,
            grid,
            road,
            pheromone,
        }
    }


}
