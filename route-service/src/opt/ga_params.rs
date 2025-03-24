use rand::Rng;

use crate::{
    layers::{
        city::City,
        transit_network::{TransitNetwork, TransitRoute},
    },
    opt::aco2::{run_aco, ACO},
};

/// Configuration parameters for the genetic algorithm
pub struct GAConfig {
    pub population_size: usize,
    pub max_generations: usize,
    pub mutation_rate: f64,
    pub crossover_rate: f64,
    pub elitism_count: usize,
    pub tournament_size: usize,
}

/// Representation of ACO parameters as a chromosome for GA optimization
#[derive(Clone)]
struct ACOChromosome {
    aco_params: ACO,
    fitness: Option<f64>,
}

impl ACOChromosome {
    /// Print detailed stats about this chromosome
    #[allow(dead_code)]
    fn print_stats(&self) {
        println!("Chromosome Fitness: {}", self.fitness.unwrap_or(0.0));
        self.aco_params.print_stats();
    }
}

impl GAConfig {
    /// Initialize with default values
    pub fn new() -> Self {
        GAConfig {
            population_size: 20,
            max_generations: 30,
            mutation_rate: 0.1,
            crossover_rate: 0.7,
            elitism_count: 2,
            tournament_size: 3,
        }
    }

    /// Create a custom configuration for the genetic algorithm
    pub fn with_params(
        population_size: usize,
        max_generations: usize,
        mutation_rate: f64,
        crossover_rate: f64,
        elitism_count: usize,
        tournament_size: usize,
    ) -> Self {
        GAConfig {
            population_size,
            max_generations,
            mutation_rate,
            crossover_rate,
            elitism_count,
            tournament_size,
        }
    }

    /// Run genetic algorithm to find optimal ACO parameters
    pub fn optimize_aco_params(&self, route: &TransitRoute, city: &City) -> Option<(ACO, f64)> {
        let mut rng = rand::thread_rng();

        let transit = city.transit.clone();

        log::info!(
            "Starting GA optimization for route {} with population={}, generations={}",
            route.route_id,
            self.population_size,
            self.max_generations
        );

        // Initialize population
        log::info!(
            "Initializing population with {} individuals",
            self.population_size
        );
        let mut population = self.initialize_population(&mut rng);

        // Evaluate initial population
        log::info!("Evaluating initial population");
        for (i, individual) in population.iter_mut().enumerate() {
            log::debug!("Evaluating individual {}/{}", i + 1, self.population_size);
            self.evaluate_fitness(individual, route, city, &transit);
        }

        // Keep track of best solution
        population.sort_by(|a, b| {
            b.fitness
                .unwrap_or(0.0)
                .partial_cmp(&a.fitness.unwrap_or(0.0))
                .unwrap()
        });

        let mut best_solution = population[0].clone();
        let mut best_fitness = best_solution.fitness.unwrap_or(0.0);

        log::info!("Initial best fitness: {}", best_fitness);

        // Main GA loop
        for generation in 0..self.max_generations {
            log::info!(
                "Starting generation {}/{}",
                generation + 1,
                self.max_generations
            );

            // Create next generation
            let mut next_generation = Vec::with_capacity(self.population_size);

            // Elitism: keep best individuals
            log::debug!(
                "Applying elitism: keeping top {} individuals",
                self.elitism_count
            );
            for i in 0..self.elitism_count.min(population.len()) {
                next_generation.push(population[i].clone());
            }

            // Fill the rest of the population
            log::debug!("Creating new individuals through crossover and mutation");
            while next_generation.len() < self.population_size {
                // Selection
                let parent1 = self.tournament_selection(&population, &mut rng);
                let parent2 = self.tournament_selection(&population, &mut rng);

                // Crossover and mutation
                let mut offspring = if rng.gen::<f64>() < self.crossover_rate {
                    self.crossover(&parent1, &parent2, &mut rng)
                } else {
                    parent1.clone()
                };
                self.mutate(&mut offspring, &mut rng);
                next_generation.push(offspring);
            }

            // Replace current population
            population = next_generation;

            // Evaluate new population
            log::debug!("Evaluating new population");
            for (i, individual) in population.iter_mut().enumerate() {
                if individual.fitness.is_none() {
                    log::trace!("Evaluating individual {}/{}", i + 1, self.population_size);
                    self.evaluate_fitness(individual, route, city, &transit);
                }
            }

            // Sort by fitness for next generation
            population.sort_by(|a, b| {
                b.fitness
                    .unwrap_or(0.0)
                    .partial_cmp(&a.fitness.unwrap_or(0.0))
                    .unwrap()
            });

            // Update best solution
            if population[0].fitness.unwrap_or(0.0) > best_fitness {
                best_solution = population[0].clone();
                best_fitness = best_solution.fitness.unwrap_or(0.0);
                log::info!(
                    "Generation {}/{}: New best solution found: fitness = {}",
                    generation + 1,
                    self.max_generations,
                    best_fitness
                );
            } else if (generation + 1) % 5 == 0 {
                log::info!(
                    "Generation {}/{}: Current best fitness = {}",
                    generation + 1,
                    self.max_generations,
                    best_fitness
                );
            }

            // logging for average fitness
            let avg_fitness: f64 = population
                .iter()
                .map(|ind| ind.fitness.unwrap_or(0.0))
                .sum::<f64>()
                / population.len() as f64;
            log::info!(
                "Generation {}/{} completed - Best: {:.4}, Avg: {:.4}",
                generation + 1,
                self.max_generations,
                best_fitness,
                avg_fitness
            );
        }

        log::info!(
            "GA optimization completed. Final best fitness: {}",
            best_fitness
        );

        // Return best solution found
        Some((best_solution.aco_params, best_fitness))
    }

    /// Initialize a random population
    fn initialize_population(&self, rng: &mut impl Rng) -> Vec<ACOChromosome> {
        let mut population = Vec::with_capacity(self.population_size);

        for _ in 0..self.population_size {
            population.push(ACOChromosome {
                aco_params: self.generate_random_parameters(rng),
                fitness: None,
            });
        }

        population
    }

    /// Generate random ACO parameters
    fn generate_random_parameters(&self, rng: &mut impl Rng) -> ACO {
        // Create random ACO parameters within reasonable ranges
        ACO {
            alpha: rng.gen_range(1.0..5.0),
            beta: rng.gen_range(1.0..5.0),
            rho: rng.gen_range(0.05..0.5),
            q0: rng.gen_range(0.5..1.0),
            num_ant: rng.gen_range(5..20),
            max_gen: rng.gen_range(10..50),
            pheromone_max: rng.gen_range(20.0..50.0),
            pheromone_min: rng.gen_range(1.0..10.0),
            init_pheromone: rng.gen_range(10.0..30.0),
            bus_capacity: rng.gen_range(30..70),
            min_route_len: rng.gen_range(3..10),
            max_route_len: rng.gen_range(50..100),
            min_stop_dist: rng.gen_range(50.0..150.0),
            max_stop_dist: rng.gen_range(300.0..700.0),
            max_nonlinearity: rng.gen_range(1.5..3.5),
            avg_stop_dist: rng.gen_range(150.0..300.0),
        }
    }

    /// Evaluate fitness of an individual
    fn evaluate_fitness(
        &self,
        individual: &mut ACOChromosome,
        route: &TransitRoute,
        city: &City,
        transit: &TransitNetwork,
    ) {
        // Run ACO with the parameters and evaluate the result
        if let Some((_, score)) = run_aco(individual.aco_params.clone(), route, city, transit) {
            individual.fitness = Some(score);
        } else {
            // If ACO fails to find a route, assign a low fitness
            individual.fitness = Some(0.01);
        }
    }

    /// Select an individual using tournament selection
    fn tournament_selection(
        &self,
        population: &[ACOChromosome],
        rng: &mut impl Rng,
    ) -> ACOChromosome {
        // Tournament selection
        let mut best = &population[rng.gen_range(0..population.len())];

        for _ in 1..self.tournament_size {
            let candidate = &population[rng.gen_range(0..population.len())];
            if candidate.fitness.unwrap_or(0.0) > best.fitness.unwrap_or(0.0) {
                best = candidate;
            }
        }

        best.clone()
    }

    /// Perform crossover between two parents
    fn crossover(
        &self,
        parent1: &ACOChromosome,
        parent2: &ACOChromosome,
        rng: &mut impl Rng,
    ) -> ACOChromosome {
        // Uniform crossover
        let p1 = &parent1.aco_params;
        let p2 = &parent2.aco_params;

        ACOChromosome {
            aco_params: ACO {
                alpha: if rng.gen_bool(0.5) {
                    p1.alpha
                } else {
                    p2.alpha
                },
                beta: if rng.gen_bool(0.5) { p1.beta } else { p2.beta },
                rho: if rng.gen_bool(0.5) { p1.rho } else { p2.rho },
                q0: if rng.gen_bool(0.5) { p1.q0 } else { p2.q0 },
                num_ant: if rng.gen_bool(0.5) {
                    p1.num_ant
                } else {
                    p2.num_ant
                },
                max_gen: if rng.gen_bool(0.5) {
                    p1.max_gen
                } else {
                    p2.max_gen
                },
                pheromone_max: if rng.gen_bool(0.5) {
                    p1.pheromone_max
                } else {
                    p2.pheromone_max
                },
                pheromone_min: if rng.gen_bool(0.5) {
                    p1.pheromone_min
                } else {
                    p2.pheromone_min
                },
                init_pheromone: if rng.gen_bool(0.5) {
                    p1.init_pheromone
                } else {
                    p2.init_pheromone
                },
                bus_capacity: if rng.gen_bool(0.5) {
                    p1.bus_capacity
                } else {
                    p2.bus_capacity
                },
                min_route_len: if rng.gen_bool(0.5) {
                    p1.min_route_len
                } else {
                    p2.min_route_len
                },
                max_route_len: if rng.gen_bool(0.5) {
                    p1.max_route_len
                } else {
                    p2.max_route_len
                },
                min_stop_dist: if rng.gen_bool(0.5) {
                    p1.min_stop_dist
                } else {
                    p2.min_stop_dist
                },
                max_stop_dist: if rng.gen_bool(0.5) {
                    p1.max_stop_dist
                } else {
                    p2.max_stop_dist
                },
                max_nonlinearity: if rng.gen_bool(0.5) {
                    p1.max_nonlinearity
                } else {
                    p2.max_nonlinearity
                },
                avg_stop_dist: if rng.gen_bool(0.5) {
                    p1.avg_stop_dist
                } else {
                    p2.avg_stop_dist
                },
            },
            fitness: None,
        }
    }

    /// Helper function to mutate usize parameters with bounds
    fn mutate_usize(
        &self,
        current: usize,
        max_change: usize,
        min_bound: usize,
        max_bound: usize,
        rng: &mut impl Rng,
    ) -> usize {
        let change = rng.gen_range(0..=max_change);
        let new_value = if rng.gen_bool(0.5) {
            current.saturating_add(change)
        } else {
            current.saturating_sub(change)
        };
        new_value.max(min_bound).min(max_bound)
    }

    /// Perform mutation on an individual
    fn mutate(&self, individual: &mut ACOChromosome, rng: &mut impl Rng) {
        let aco = &mut individual.aco_params;

        if rng.gen::<f64>() < self.mutation_rate {
            aco.alpha += rng.gen_range(-0.5..0.5);
            aco.alpha = aco.alpha.max(0.1).min(10.0);
        }

        if rng.gen::<f64>() < self.mutation_rate {
            aco.beta += rng.gen_range(-0.5..0.5);
            aco.beta = aco.beta.max(0.1).min(10.0);
        }

        if rng.gen::<f64>() < self.mutation_rate {
            aco.rho += rng.gen_range(-0.05..0.05);
            aco.rho = aco.rho.max(0.01).min(0.99);
        }

        if rng.gen::<f64>() < self.mutation_rate {
            aco.q0 += rng.gen_range(-0.1..0.1);
            aco.q0 = aco.q0.max(0.1).min(1.0);
        }

        if rng.gen::<f64>() < self.mutation_rate {
            aco.num_ant = self.mutate_usize(aco.num_ant, 5, 5, 100, rng);
        }

        if rng.gen::<f64>() < self.mutation_rate {
            aco.max_gen = self.mutate_usize(aco.max_gen, 10, 20, 500, rng);
        }

        if rng.gen::<f64>() < self.mutation_rate {
            aco.pheromone_max += rng.gen_range(-5.0..5.0);
            aco.pheromone_max = aco.pheromone_max.max(aco.pheromone_min + 1.0).min(100.0);
        }

        if rng.gen::<f64>() < self.mutation_rate {
            aco.pheromone_min += rng.gen_range(-2.0..2.0);
            aco.pheromone_min = aco.pheromone_min.max(0.1).min(aco.pheromone_max - 1.0);
        }

        if rng.gen::<f64>() < self.mutation_rate {
            aco.init_pheromone += rng.gen_range(-3.0..3.0);
            aco.init_pheromone = aco
                .init_pheromone
                .max(aco.pheromone_min)
                .min(aco.pheromone_max);
        }

        if rng.gen::<f64>() < self.mutation_rate {
            aco.bus_capacity = self.mutate_usize(aco.bus_capacity, 5, 10, 100, rng);
        }

        if rng.gen::<f64>() < self.mutation_rate {
            aco.min_route_len = self.mutate_usize(
                aco.min_route_len,
                2,
                2,
                aco.max_route_len.saturating_sub(1),
                rng,
            );
        }

        if rng.gen::<f64>() < self.mutation_rate {
            aco.max_route_len = self.mutate_usize(
                aco.max_route_len,
                5,
                aco.min_route_len.saturating_add(1),
                200,
                rng,
            );
        }

        if rng.gen::<f64>() < self.mutation_rate {
            aco.min_stop_dist += rng.gen_range(-20.0..20.0);
            aco.min_stop_dist = aco.min_stop_dist.max(50.0).min(aco.max_stop_dist - 50.0);
        }

        if rng.gen::<f64>() < self.mutation_rate {
            aco.max_stop_dist += rng.gen_range(-50.0..50.0);
            aco.max_stop_dist = aco.max_stop_dist.max(aco.min_stop_dist + 50.0).min(1000.0);
        }

        if rng.gen::<f64>() < self.mutation_rate {
            aco.max_nonlinearity += rng.gen_range(-0.3..0.3);
            aco.max_nonlinearity = aco.max_nonlinearity.max(1.1).min(5.0);
        }

        if rng.gen::<f64>() < self.mutation_rate {
            aco.avg_stop_dist += rng.gen_range(-20.0..20.0);
            aco.avg_stop_dist = aco.avg_stop_dist.max(100.0).min(500.0);
        }

        // Reset fitness since we modified the parameters
        individual.fitness = None;
    }
}

/// Run genetic algorithm to find optimal ACO parameters for a route
///
/// This function uses default GA parameters. For more control, create a GAConfig
/// instance directly and call optimize_aco_params on it.
#[allow(dead_code)]
pub fn optimize_aco_params(route: &TransitRoute, city: &City) -> Option<(ACO, f64)> {
    let ga_config = GAConfig::new();

    log::info!(
        "Starting genetic algorithm optimization for route {}",
        route.route_id
    );
    log::info!(
        "GA config: population={}, generations={}, mutation_rate={:.2}, crossover_rate={:.2}, elitism={}", 
        ga_config.population_size,
        ga_config.max_generations,
        ga_config.mutation_rate,
        ga_config.crossover_rate,
        ga_config.elitism_count
    );

    let result = ga_config.optimize_aco_params(route, city);

    if let Some((_, fitness)) = &result {
        log::info!(
            "Genetic algorithm optimization completed. Best fitness: {}",
            fitness
        );
    } else {
        log::error!("Genetic algorithm optimization failed to find a better solution");
    }

    result
}

/// Run genetic algorithm with custom parameters to find optimal ACO parameters
#[allow(dead_code)]
pub fn optimize_aco_params_with_config(
    route: &TransitRoute,
    city: &City,
    population_size: usize,
    max_generations: usize,
    mutation_rate: f64,
    crossover_rate: f64,
    elitism_count: usize,
) -> Option<(ACO, f64)> {
    let ga_config = GAConfig::with_params(
        population_size,
        max_generations,
        mutation_rate,
        crossover_rate,
        elitism_count,
        3, // tournament size
    );

    ga_config.optimize_aco_params(route, city)
}
