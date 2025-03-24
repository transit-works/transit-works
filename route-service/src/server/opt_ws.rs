use crate::opt::aco2;
use crate::server::server::{get_optimized_geojson, AppState};

use actix::prelude::*;
use actix_web::web;
use actix_web_actors::ws;
use std::time::{Duration, Instant};

// WebSocket actor for live optimization
pub(crate) struct OptimizationWs {
    app_state: web::Data<AppState>,
    route_ids: Vec<String>,
    iterations_done: usize,
    total_iterations: usize,
    heartbeat: Instant,
    current_route_index: usize, // Track which route we're currently optimizing
    iterations_per_route: usize, // Number of iterations to run per route
    converged_routes: Vec<bool>, // Track which routes have converged
    optimize_attempts_per_route: Vec<usize>, // Track optimization attempts for each route
}

impl OptimizationWs {
    pub fn new(app_state: web::Data<AppState>, route_ids: Vec<String>) -> Self {
        let iterations_per_route = 10; // 10 iterations per route
        let total_iterations = iterations_per_route * route_ids.len(); // Total iterations across all routes
        let routes_count = route_ids.len();

        Self {
            app_state,
            route_ids: route_ids.clone(),
            iterations_done: 0,
            total_iterations,
            heartbeat: Instant::now(),
            current_route_index: 0, // Start with the first route
            iterations_per_route,
            converged_routes: vec![false; routes_count], // Initialize all routes as not converged
            optimize_attempts_per_route: vec![0; routes_count], // Initialize optimization attempts count
        }
    }

    fn run_optimization_iteration(&mut self, ctx: &mut ws::WebsocketContext<Self>) {
        // Check if we've completed all iterations
        if self.iterations_done >= self.total_iterations {
            println!("Completed all iterations for routes {:?}", self.route_ids);
            ctx.close(None);
            return;
        }

        // Calculate which iteration number we're on for each route
        let route_iteration = (self.iterations_done / self.route_ids.len()) + 1;

        // Calculate which route to optimize in this iteration (alternate between routes)
        let mut current_route_index = self.iterations_done % self.route_ids.len();
        self.current_route_index = current_route_index;

        // Check if this route has already converged, if so, find the next non-converged route
        if self.converged_routes[current_route_index] {
            // Try to find another route that hasn't converged yet
            let mut found_non_converged = false;
            let original_index = current_route_index;

            // Try routes after the current one
            for i in (current_route_index + 1)..self.route_ids.len() {
                if !self.converged_routes[i] {
                    current_route_index = i;
                    self.current_route_index = i;
                    found_non_converged = true;
                    break;
                }
            }

            // If we didn't find any non-converged routes after the current one, try from the beginning
            if !found_non_converged {
                for i in 0..original_index {
                    if !self.converged_routes[i] {
                        current_route_index = i;
                        self.current_route_index = i;
                        found_non_converged = true;
                        break;
                    }
                }
            }

            // If all routes have converged, we can finish early
            if !found_non_converged {
                println!("All routes have converged, finishing optimization early");
                ctx.text(
                    serde_json::to_string(&serde_json::json!({
                        "message": "All routes have converged to optimal solutions",
                        "iteration": self.total_iterations,
                        "total_iterations": self.total_iterations,
                        "all_converged": true,
                        "early_completion": true,
                        "converged_routes": self.converged_routes.clone(),
                        "optimize_attempts": self.optimize_attempts_per_route.clone()
                    }))
                    .unwrap(),
                );
                ctx.close(None);
                return;
            }

            println!(
                "Route at index {} already converged, switching to route at index {}",
                original_index, current_route_index
            );
        }

        // Get the current route ID
        let route_id = match self.route_ids.get(current_route_index) {
            Some(id) => id.clone(),
            None => {
                println!(
                    "Invalid route index {}, stopping optimization",
                    current_route_index
                );
                ctx.close(None);
                return;
            }
        };

        println!(
            "Running optimization iteration {} for route {} ({}/{} routes, iteration {}/{})",
            self.iterations_done + 1,
            route_id,
            current_route_index + 1,
            self.route_ids.len(),
            route_iteration,
            self.iterations_per_route
        );

        // Update heartbeat timestamp to prevent timeout during long-running optimization
        self.heartbeat = Instant::now();

        // Access the city data (immutable)
        let city_guard = match self.app_state.city.lock() {
            Ok(guard) => guard,
            Err(e) => {
                println!("Failed to acquire lock on city data: {}", e);
                ctx.text(
                    serde_json::to_string(&serde_json::json!({
                        "error": "Server error: Failed to access city data"
                    }))
                    .unwrap(),
                );
                ctx.close(None);
                return;
            }
        };

        if let Some(city) = &*city_guard {
            // Get the optimized transit data
            let mut optimized_transit_guard = match self.app_state.optimized_transit.lock() {
                Ok(guard) => guard,
                Err(e) => {
                    println!("Failed to acquire lock on optimized transit data: {}", e);
                    ctx.text(
                        serde_json::to_string(&serde_json::json!({
                            "error": "Server error: Failed to access optimized transit data"
                        }))
                        .unwrap(),
                    );
                    ctx.close(None);
                    return;
                }
            };

            let optimized_transit = optimized_transit_guard.as_mut().unwrap();
            let mut all_evaluations = Vec::new();
            let mut optimized_count = 0;
            let mut optimized_route_ids_guard = self.app_state.optimized_route_ids.lock().unwrap();

            // Find the specific route to optimize in this iteration
            let route = optimized_transit
                .routes
                .iter()
                .find(|r| r.route_id == route_id)
                .cloned();

            if let Some(route) = route {
                // Create ACO instance for this optimization iteration
                let aco = self.app_state.aco_params.lock().unwrap().clone();

                // Increment the optimization attempt counter for this route
                self.optimize_attempts_per_route[current_route_index] += 1;

                match aco2::run_aco(aco, &route, &city) {
                    Some((opt_route, eval)) => {
                        // Update the route in optimized_transit for next iteration
                        optimized_transit.routes.retain(|r| r.route_id != route_id);
                        optimized_transit.routes.push(opt_route);

                        // Ensure route ID is in the optimized list
                        if !optimized_route_ids_guard.contains(&route_id) {
                            optimized_route_ids_guard.push(route_id.clone());
                        }

                        all_evaluations.push((route_id.clone(), eval));
                        optimized_count += 1;
                    }
                    None => {
                        println!(
                            "Failed to optimize route {} - marking as converged",
                            route_id
                        );

                        // if this is the first iteration for this route, it is optimal already, mark it as noop
                        let noop_route_ids = {
                            let mut noop_route_ids_guard =
                                self.app_state.noop_route_ids.lock().unwrap();
                            if route_iteration == 1 {
                                println!("Route {} is already optimal, marking as noop", route_id);
                                if !noop_route_ids_guard.contains(&route_id) {
                                    noop_route_ids_guard.push(route_id.clone());
                                }
                            }
                            noop_route_ids_guard.clone()
                        };

                        // Mark this route as converged
                        self.converged_routes[current_route_index] = true;

                        // No optimization was performed, but we need to send a message to the client
                        let convergence_msg = serde_json::json!({
                            "message": format!("Route {} has converged to optimal solution", route_id),
                            "warning": format!("Route {} reached optimal solution", route_id),
                            "iteration": self.iterations_done + 1,
                            "total_iterations": self.total_iterations,
                            "current_route": route_id,
                            "current_route_index": current_route_index,
                            "routes_count": self.route_ids.len(),
                            "all_route_ids": self.route_ids,
                            "route_iteration": route_iteration, // Current iteration number for this route
                            "iterations_per_route": self.iterations_per_route,
                            "converged_routes": self.converged_routes.clone(), // Include which routes have converged
                            "optimize_attempts": self.optimize_attempts_per_route.clone(),
                            "converged": true,
                            "converged_route": route_id,
                            "converged_route_index": current_route_index,
                            "noop_route_ids": noop_route_ids,
                        });

                        ctx.text(serde_json::to_string(&convergence_msg).unwrap());
                    }
                }
            } else {
                println!("Route {} not found", route_id);
                // Mark this route as converged (or essentially skipped)
                self.converged_routes[current_route_index] = true;
            }

            // Send an update for all routes
            if optimized_count > 0 {
                let response = serde_json::json!({
                    "message": format!("Optimized route {} (route {}/{}, iteration {}/{})",
                                    route_id, current_route_index + 1, self.route_ids.len(),
                                    route_iteration, self.iterations_per_route),
                    "geojson": get_optimized_geojson(city, optimized_transit, &optimized_route_ids_guard),
                    "evaluation": all_evaluations,
                    "iteration": self.iterations_done + 1,
                    "total_iterations": self.total_iterations,
                    "current_route": route_id,
                    "current_route_index": current_route_index,
                    "routes_count": self.route_ids.len(),
                    "all_route_ids": self.route_ids,
                    "route_iteration": route_iteration,
                    "iterations_per_route": self.iterations_per_route,
                    "converged_routes": self.converged_routes.clone(),
                    "optimize_attempts": self.optimize_attempts_per_route.clone(),
                    "optimized_routes": optimized_count
                });

                // Send the update via WebSocket
                ctx.text(serde_json::to_string(&response).unwrap());
            }

            // Increment iteration counter
            self.iterations_done += 1;

            // Schedule next iteration with a short delay
            let current_iteration = self.iterations_done;
            let addr = ctx.address();
            ctx.run_later(Duration::from_millis(500), move |_, _| {
                addr.do_send(RunNextIteration {
                    iteration: current_iteration,
                });
            });
        } else {
            let error_msg = "City data not loaded";
            println!("{}", error_msg);
            ctx.text(
                serde_json::to_string(&serde_json::json!({
                    "error": error_msg
                }))
                .unwrap(),
            );
            ctx.close(None);
        }

        // Update heartbeat timestamp again after the long optimization process
        self.heartbeat = Instant::now();
    }

    // Heartbeat to keep connection alive
    fn heartbeat(&self, ctx: &mut ws::WebsocketContext<Self>) {
        ctx.run_interval(Duration::from_secs(10), |act, ctx| {
            if Instant::now().duration_since(act.heartbeat) > Duration::from_secs(120) {
                println!("Websocket connection timeout, disconnecting");
                ctx.stop();
                return;
            }

            println!("Sending ping to keep WebSocket alive");
            ctx.ping(b"");
        });
    }
}

// Message to trigger the next optimization iteration
struct RunNextIteration {
    iteration: usize,
}

impl Message for RunNextIteration {
    type Result = ();
}

impl Handler<RunNextIteration> for OptimizationWs {
    type Result = ();

    fn handle(&mut self, msg: RunNextIteration, ctx: &mut ws::WebsocketContext<Self>) {
        // Verify that this is the correct iteration we're expecting
        if msg.iteration == self.iterations_done {
            println!(
                "Handling RunNextIteration message for iteration {}",
                msg.iteration + 1
            );
            self.run_optimization_iteration(ctx);
        } else {
            println!(
                "Ignoring outdated RunNextIteration message for iteration {} (currently at {})",
                msg.iteration + 1,
                self.iterations_done
            );
        }
    }
}

impl Actor for OptimizationWs {
    type Context = ws::WebsocketContext<Self>;

    fn started(&mut self, ctx: &mut Self::Context) {
        println!(
            "WebSocket connection started for routes {:?}",
            self.route_ids
        );

        // Send immediate confirmation that the WebSocket connection is established
        let connection_msg = serde_json::json!({
            "status": "connected",
            "message": "WebSocket connection established, optimization starting",
            "routes": self.route_ids,
        });

        println!(
            "Sending WebSocket connection confirmation: {:?}",
            connection_msg
        );

        // Send the confirmation message immediately
        ctx.text(serde_json::to_string(&connection_msg).unwrap());

        // Setup heartbeat first, optimization second
        self.heartbeat(ctx);

        // Short delay before starting optimization to ensure connection message is received
        let addr = ctx.address();
        ctx.run_later(Duration::from_millis(100), move |_, _| {
            addr.do_send(RunNextIteration { iteration: 0 });
        });
    }
}

impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for OptimizationWs {
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        match msg {
            Ok(ws::Message::Ping(msg)) => {
                println!("Received ping");
                self.heartbeat = Instant::now();
                ctx.pong(&msg);
            }
            Ok(ws::Message::Pong(_)) => {
                println!("Received pong");
                self.heartbeat = Instant::now();
            }
            Ok(ws::Message::Text(_)) => {
                println!("Received text message");
                self.heartbeat = Instant::now();
            }
            Ok(ws::Message::Binary(_)) => {
                println!("Received binary message");
                self.heartbeat = Instant::now();
            }
            Ok(ws::Message::Close(reason)) => {
                println!("WebSocket closed by client: {:?}", reason);
                ctx.close(reason);
                ctx.stop();
            }
            _ => {
                println!("Unhandled WebSocket message, stopping actor");
                ctx.stop();
            }
        }
    }
}
