use crate::gtfs::geojson;
use crate::layers::city::City;
use crate::layers::transit_network::{TransitNetwork, TransitRoute};
use crate::opt::aco::ACO;
use crate::opt::{aco2, eval};
use crate::server::cors::cors_middleware;

use actix::prelude::*;
use actix_web::{get, post, web, App, Error, HttpRequest, HttpResponse, HttpServer, Responder};
use actix_web_actors::ws;
use geo::Centroid;
use route_service::opt::{self, aco};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::net::SocketAddr;
use std::sync::Mutex;
use std::time::{Duration, Instant};

// Updated application state with immutable city and mutable optimized transit
struct AppState {
    city: Mutex<Option<City>>, // Immutable after initialization
    optimized_transit: Mutex<Option<TransitNetwork>>, // Stores optimized routes
    optimized_route_ids: Mutex<Vec<String>>, // Tracks which routes have been optimized
}

#[derive(Deserialize)]
struct RouteIds {
    routes: Vec<String>,
}

#[derive(Serialize)]
struct GridResponse {
    message: String,
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
                eval::ridership_over_route(&route.outbound_stops, &city.grid);
            
            // Only evaluate the optimized route if it has been optimized
            if optimized_route_ids.contains(&route_id) {
                if let Some(opt_route) = optimized_transit.routes.iter().find(|r| r.route_id == route_id) {
                    let (opt_ridership, opt_avg_occupancy) =
                        eval::ridership_over_route(&opt_route.outbound_stops, &city.grid);
                    
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
}

impl OptimizationWs {
    fn new(app_state: web::Data<AppState>, route_ids: Vec<String>) -> Self {
        Self {
            app_state,
            route_ids,
            iterations_done: 0,
            total_iterations: 10, // 10 iterations as specified
            heartbeat: Instant::now(),
        }
    }

    fn run_optimization_iteration(&mut self, ctx: &mut ws::WebsocketContext<Self>) {
        let route_ids = self.route_ids.clone();
        println!(
            "Running optimization iteration {} for routes {:?}",
            self.iterations_done + 1,
            route_ids
        );

        // Check if we've completed all iterations
        if self.iterations_done >= self.total_iterations {
            println!("Completed all iterations for routes {:?}", route_ids);
            ctx.close(None);
            return;
        }

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

            // Optimize each route in the list
            for route_id in &route_ids {
                // Find the route to optimize
                let route = optimized_transit
                    .routes
                    .iter()
                    .find(|r| r.route_id == *route_id)
                    .cloned();

                if let Some(route) = route {
                    // Create ACO instance for this optimization iteration
                    let aco = aco2::ACO::init();

                    match aco2::run_aco(aco, &route, &city) {
                        Some((opt_route, eval)) => {
                            // Update the route in optimized_transit for next iteration
                            optimized_transit.routes.retain(|r| r.route_id != *route_id);
                            optimized_transit.routes.push(opt_route);

                            // Ensure route ID is in the optimized list
                            if !optimized_route_ids_guard.contains(route_id) {
                                optimized_route_ids_guard.push(route_id.clone());
                            }

                            all_evaluations.push((route_id.clone(), eval));
                            optimized_count += 1;
                        }
                        None => {
                            println!("Failed to optimize route {}", route_id);
                            // Continue with other routes even if one fails
                        }
                    }
                } else {
                    println!("Route {} not found", route_id);
                    // Continue with other routes
                }
            }

            // Send a combined update for all routes
            if optimized_count > 0 {
                let response = serde_json::json!({
                    "message": format!("Optimized {} routes (iteration {}/{})", 
                                     optimized_count, self.iterations_done + 1, self.total_iterations),
                    "geojson": get_optimized_geojson(city, optimized_transit, &optimized_route_ids_guard),
                    "evaluation": all_evaluations,
                    "iteration": self.iterations_done + 1,
                    "total_iterations": self.total_iterations,
                    "optimized_routes": optimized_count
                });

                // Send the update via WebSocket
                ctx.text(serde_json::to_string(&response).unwrap());

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
                let error_msg = format!("Failed to optimize any routes in {:?}", route_ids);
                println!("{}", error_msg);
                ctx.text(
                    serde_json::to_string(&serde_json::json!({
                        "error": error_msg
                    }))
                    .unwrap(),
                );
                ctx.close(None);
            }
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
        ctx.run_interval(Duration::from_secs(5), |act, ctx| {
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
        println!("WebSocket connection started for routes {:?}", self.route_ids);
        self.heartbeat(ctx);
        self.run_optimization_iteration(ctx);
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
                // We don't expect text messages from client
                self.heartbeat = Instant::now();
            }
            Ok(ws::Message::Binary(_)) => {
                // We don't handle binary messages
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

// Define a struct for the query parameters
#[derive(Deserialize)]
struct RouteIdParams {
    route_ids: String, // Comma-separated list of route IDs
}

// Single unified endpoint for live route optimization - replaces both previous endpoints
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
        "toronto", gtfs_path, db_path, true,  // set cache
        false, // don't invalidate cache
    );

    // Initialize application state with the city and a copy of transit for optimizations
    let app_state = web::Data::new(AppState {
        optimized_transit: Mutex::new(city_result.as_ref().ok().map(|c| c.transit.clone())),
        optimized_route_ids: Mutex::new(Vec::new()),
        city: Mutex::new(city_result.ok()),
    });

    println!("Starting server on {}:{}", host, port);
    HttpServer::new(move || {
        App::new()
            .wrap(cors_middleware()) // Apply CORS middleware to all routes
            .app_data(app_state.clone()) // Pass the state to all routes
            .service(get_data)
            .service(optimize_route)
            .service(optimize_routes)
            .service(evaluate_route)
            .service(get_grid)
            .service(reset_optimizations)
            .service(optimize_live)  // Replace the previous WebSocket endpoints with this unified one
            .service(get_optimizations)
    })
    .bind(addr)?
    .run()
    .await?;

    println!("Server started at {} on port {}.", host, port);
    Ok(())
}
