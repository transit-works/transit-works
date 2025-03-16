use crate::gtfs::geojson;
use crate::layers::city::City;
use crate::layers::transit_network::{TransitNetwork, TransitRoute};
use crate::opt::aco::ACO;
use crate::opt::{aco2, eval};

use actix::prelude::*;
use actix_web::{get, post, web, App, Error, HttpRequest, HttpResponse, HttpServer, Responder};
use actix_web_actors::ws;
use geo::Centroid;
use serde::Deserialize;
use serde_json::Value;
use std::net::SocketAddr;
use std::sync::Mutex;
use std::time::{Duration, Instant};

struct AppState {
    city: Mutex<Option<City>>,
    optimized_transit: Mutex<Option<TransitNetwork>>, // Stores optimized routes
    optimized_route_ids: Mutex<Vec<String>>, // Tracks which routes have been optimized
}

#[derive(Deserialize)]
struct RouteIds {
    routes: Vec<String>,
}

fn get_optimized_geojson(
    city: &City,
    optimized_transit: &TransitNetwork,
    optimized_route_ids: &Vec<String>,
) -> Value {
    let all_opt_routes = optimized_transit
        .routes
        .iter()
        .filter(|r| optimized_route_ids.contains(&r.route_id))
        .collect::<Vec<&TransitRoute>>();
    let features = geojson::get_all_features(&TransitNetwork::to_gtfs_filtered(
        all_opt_routes,
        &city.gtfs,
        &city.road,
    ));
    let geojson = geojson::convert_to_geojson(&features);
    geojson
}

fn get_base_geojson(city: &City) -> Value {
    let features = geojson::get_all_features(&TransitNetwork::to_gtfs_copy(
        city.transit.routes.iter().collect(),
        &city.gtfs,
    ));
    let geojson = geojson::convert_to_geojson(&features);
    geojson
}

#[get("/get-data")]
async fn get_data(data: web::Data<AppState>) -> impl Responder {
    println!("Fetching network data");

    // Try to access the city from the shared state
    let city_guard = data.city.lock().unwrap();

    if let Some(city) = &*city_guard {
        HttpResponse::Ok().json(get_base_geojson(city))
    } else {
        HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "City data not loaded"
        }))
    }
}

#[post("/optimize-route/{route_id}")]
async fn optimize_route(route_id: web::Path<String>, data: web::Data<AppState>) -> impl Responder {
    let route_id = route_id.into_inner();
    println!("Optimizing route: {}", route_id);

    // Access the original city (immutable)
    let city_guard = data.city.lock().unwrap();
    let city = match &*city_guard {
        Some(city) => city,
        None => {
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "City data not loaded"
            }));
        }
    };

    // Find the route with the given ID from the original city data
    let original_route = city
        .transit
        .routes
        .iter()
        .find(|r| r.route_id == route_id)
        .cloned();

    if let Some(route) = original_route {
        // Create ACO instance on demand for this optimization
        let mut aco = ACO::init();

        if let Some((opt_route, eval)) =
            aco.optimize_route(&city.grid, &city.road, &city.transit, &route)
        {
            let mut optimized_transit_guard = data.optimized_transit.lock().unwrap();
            let optimized_transit = optimized_transit_guard.as_mut().unwrap();
            let mut optimized_route_ids = data.optimized_route_ids.lock().unwrap();

            // Update the optimized transit with the new route
            optimized_transit.routes.retain(|r| r.route_id != route_id);
            optimized_transit.routes.push(opt_route);

            // Track the optimized route ID
            if !optimized_route_ids.contains(&route_id) {
                optimized_route_ids.push(route_id.clone());
            }

            HttpResponse::Ok().json(serde_json::json!({
                "message": format!("Optimized route {}", route_id),
                "geojson": get_optimized_geojson(city, optimized_transit, &optimized_route_ids),
                "evaluation": eval
            }))
        } else {
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to optimize route {}", route_id)
            }))
        }
    } else {
        HttpResponse::NotFound().json(serde_json::json!({
            "error": format!("Route {} not found", route_id)
        }))
    }
}

#[post("/optimize-routes")]
async fn optimize_routes(
    route_ids: web::Json<RouteIds>,
    data: web::Data<AppState>,
) -> impl Responder {
    println!("Optimizing multiple routes: {:?}", route_ids.routes);

    // Access the original city (immutable)
    let city_guard = data.city.lock().unwrap();
    let city = match &*city_guard {
        Some(city) => city,
        None => {
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "City data not loaded"
            }));
        }
    };

    // Check if any routes exist
    if route_ids.routes.is_empty() {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "No route IDs provided"
        }));
    }

    let mut optimized_transit_guard = data.optimized_transit.lock().unwrap();
    let optimized_transit = optimized_transit_guard.as_mut().unwrap();
    let mut optimized_route_ids = data.optimized_route_ids.lock().unwrap();

    // Track successful optimizations and evaluations
    let mut success_count = 0;
    let mut all_evaluations = Vec::new();

    // Process each route ID
    for route_id in &route_ids.routes {
        // Find the route with the given ID from the original city data
        let original_route = city
            .transit
            .routes
            .iter()
            .find(|r| &r.route_id == route_id)
            .cloned();

        if let Some(route) = original_route {
            // Create ACO instance for this optimization
            let mut aco = ACO::init();

            if let Some((opt_route, eval)) =
                aco.optimize_route(&city.grid, &city.road, &city.transit, &route)
            {
                // Update the optimized transit with the new route
                optimized_transit.routes.retain(|r| r.route_id != *route_id);
                optimized_transit.routes.push(opt_route);

                // Track the optimized route ID
                if !optimized_route_ids.contains(route_id) {
                    optimized_route_ids.push(route_id.clone());
                }

                all_evaluations.push(eval);
                success_count += 1;
            }
        }
    }

    if success_count > 0 {
        HttpResponse::Ok().json(serde_json::json!({
            "message": format!("Optimized {} routes", success_count),
            "geojson": get_optimized_geojson(city, optimized_transit, &optimized_route_ids),
            "evaluation": all_evaluations
        }))
    } else {
        HttpResponse::NotFound().json(serde_json::json!({
            "error": "No routes were successfully optimized"
        }))
    }
}

#[get("/evaluate-route/{route_id}")]
async fn evaluate_route(route_id: web::Path<String>, data: web::Data<AppState>) -> impl Responder {
    let route_id = route_id.into_inner();
    println!("Evaluating route: {}", route_id);

    let city_guard = data.city.lock().unwrap();

    if let Some(city) = &*city_guard {
        let optimized_transit_guard = data.optimized_transit.lock().unwrap();
        let optimized_transit = optimized_transit_guard.as_ref().unwrap();
        let optimized_route_ids = data.optimized_route_ids.lock().unwrap();

        // Find the route with the given ID
        let route = city.transit.routes.iter().find(|r| r.route_id == route_id);

        if let Some(route) = route {
            let (ridership, avg_occupancy) =
                eval::ridership_over_route(&city.transit, &route, &city.grid);

            // Only evaluate the optimized route if it has been optimized
            if optimized_route_ids.contains(&route_id) {
                if let Some(opt_route) = optimized_transit
                    .routes
                    .iter()
                    .find(|r| r.route_id == route_id)
                {
                    let (opt_ridership, opt_avg_occupancy) =
                        eval::ridership_over_route(&optimized_transit, &opt_route, &city.grid);

                    return HttpResponse::Ok().json(serde_json::json!({
                        "route_id": route_id,
                        "ridership": ridership,
                        "opt_ridership": opt_ridership,
                        "average_occupancy": avg_occupancy,
                        "opt_average_occupancy": opt_avg_occupancy
                    }));
                }
            }

            // Return just the original route metrics if no optimized version exists
            return HttpResponse::Ok().json(serde_json::json!({
                "route_id": route_id,
                "ridership": ridership,
                "average_occupancy": avg_occupancy,
                "opt_ridership": null,
                "opt_average_occupancy": null
            }));
        } else {
            HttpResponse::NotFound().json(serde_json::json!({
                "error": format!("Route {} not found", route_id)
            }))
        }
    } else {
        HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "City data not loaded"
        }))
    }
}

#[get("/evaluate-coverage/{route_id}")]
async fn evaluate_coverage(
    route_id: web::Path<String>,
    data: web::Data<AppState>,
) -> impl Responder {
    let route_id = route_id.into_inner();
    println!("Evaluating coverage for route: {}", route_id);

    let city_guard = data.city.lock().unwrap();

    if let Some(city) = &*city_guard {
        let route = city.transit.routes.iter().find(|r| r.route_id == route_id);

        if let Some(route) = route {
            let coverage = eval::evaluate_coverage(&route.outbound_stops, &city.grid);

            return HttpResponse::Ok().json(serde_json::json!({
                "route_id": route_id,
                "coverage": coverage
            }));
        } else {
            HttpResponse::NotFound().json(serde_json::json!({
                "error": format!("Route {} not found", route_id)
            }))
        }
    } else {
        HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "City data not loaded"
        }))
    }
}

#[get("/grid")]
async fn get_grid(data: web::Data<AppState>) -> impl Responder {
    println!("Getting grid data");

    let city_guard = data.city.lock().unwrap();

    if let Some(city) = &*city_guard {
        // Create a simple array of zones with population and coordinates
        let zones: Vec<serde_json::Value> = city
            .grid
            .graph
            .node_indices()
            .map(|ni| {
                let zone = city.grid.get_zone(ni);
                serde_json::json!({
                    "POPULATION": zone.population,
                    "COORDINATES": match zone.polygon.centroid() {
                        Some(centroid) => [centroid.x(), centroid.y()],
                        None => [0.0, 0.0], // Default coordinates if centroid is None
                    }
                })
            })
            .collect();

        HttpResponse::Ok().json(zones)
    } else {
        HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "City data not loaded"
        }))
    }
}

#[post("/reset-optimizations")]
async fn reset_optimizations(data: web::Data<AppState>) -> impl Responder {
    println!("Resetting all route optimizations");

    let city_guard = data.city.lock().unwrap();
    if let Some(city) = &*city_guard {
        // Reset the optimized transit to original state
        {
            let mut optimized_transit_guard = data.optimized_transit.lock().unwrap();
            *optimized_transit_guard = Some(city.transit.clone());
        }

        // Clear the list of optimized route IDs
        {
            let mut optimized_route_ids = data.optimized_route_ids.lock().unwrap();
            optimized_route_ids.clear();
        }

        return HttpResponse::Ok().json(serde_json::json!({
            "message": "All route optimizations reset"
        }));
    }

    HttpResponse::InternalServerError().json(serde_json::json!({
        "error": "City data not loaded"
    }))
}

#[get("/get-optimizations")]
async fn get_optimizations(data: web::Data<AppState>) -> impl Responder {
    println!("Fetching optimized routes");

    // Get the list of optimized route IDs
    let optimized_route_ids = data.optimized_route_ids.lock().unwrap().clone();

    if optimized_route_ids.is_empty() {
        return HttpResponse::Ok().json(serde_json::json!({
            "message": "No routes have been optimized yet",
            "features": []
        }));
    }

    // Access the city data (for gtfs and road network)
    let city_guard = data.city.lock().unwrap();
    let optimized_transit_guard = data.optimized_transit.lock().unwrap();

    if let (Some(city), Some(optimized_transit)) = (&*city_guard, &*optimized_transit_guard) {
        HttpResponse::Ok().json(serde_json::json!({
            "message": format!("Found {} optimized routes", optimized_route_ids.len()),
            "routes": optimized_route_ids,
            "geojson": get_optimized_geojson(city, optimized_transit, &optimized_route_ids)
        }))
    } else {
        HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "City data not loaded"
        }))
    }
}

// WebSocket actor for live optimization
struct OptimizationWs {
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
    fn new(app_state: web::Data<AppState>, route_ids: Vec<String>) -> Self {
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
                let aco = aco2::ACO::init();

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
                            "converged_route_index": current_route_index
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
        
        println!("Sending WebSocket connection confirmation: {:?}", connection_msg);
        
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

#[derive(Deserialize)]
struct RouteIdParams {
    route_ids: String, // Comma-separated list of route IDs
}

#[get("/optimize-live")]
async fn optimize_live(
    req: HttpRequest,
    stream: web::Payload,
    query: web::Query<RouteIdParams>,
    data: web::Data<AppState>,
) -> Result<HttpResponse, Error> {
    // Parse comma-separated route IDs
    let route_ids: Vec<String> = query
        .route_ids
        .split(',')
        .map(|id| id.trim().to_string())
        .filter(|id| !id.is_empty())
        .collect();

    println!(
        "WebSocket connection request for optimize-live with routes {:?}",
        route_ids
    );

    if route_ids.is_empty() {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "No valid route IDs provided"
        })));
    }

    let ws = OptimizationWs::new(data.clone(), route_ids);
    ws::start(ws, &req, stream)
}

pub async fn start_server(
    city_name: &str,
    gtfs_path: &str,
    db_path: &str,
    host: &str,
    port: u16,
) -> std::io::Result<()> {
    let addr: SocketAddr = format!("{}:{}", host, port)
        .parse()
        .expect("Invalid address format");

    println!("Loading city data from {} and {}", gtfs_path, db_path);
    // Try loading the city data upfront
    let city_result = City::load_with_cached_transit(
        city_name, gtfs_path, db_path, true,  // set cache
        false, // don't invalidate cache
    );

    if city_result.is_err() {
        log::error!("Failed to load city data: {:?}", city_result.err());
        return Ok(());
    }

    // Initialize application state with the city and a copy of transit for optimizations
    let app_state = web::Data::new(AppState {
        optimized_transit: Mutex::new(city_result.as_ref().ok().map(|c| c.transit.clone())),
        optimized_route_ids: Mutex::new(Vec::new()),
        city: Mutex::new(city_result.ok()),
    });

    println!("Starting server on {}:{}", host, port);
    HttpServer::new(move || {
        App::new()
            .app_data(app_state.clone()) // Pass the state to all routes
            .service(get_data)
            .service(optimize_route)
            .service(optimize_routes)
            .service(evaluate_route)
            .service(evaluate_coverage) 
            .service(get_grid)
            .service(reset_optimizations)
            .service(optimize_live) 
            .service(get_optimizations)
    })
    .bind(addr)?
    .run()
    .await?;

    println!("Server started at {} on port {}.", host, port);
    Ok(())
}
