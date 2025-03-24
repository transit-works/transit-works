use crate::gtfs::geojson;
use crate::layers::city::City;
use crate::layers::transit_network::{TransitNetwork, TransitRoute};
use crate::opt::{aco2, eval};
use crate::server::opt_ws::OptimizationWs;

use actix_web::{get, post, web, App, Error, HttpRequest, HttpResponse, HttpServer, Responder};
use actix_web_actors::ws;
use geo::Centroid;
use petgraph::graph::NodeIndex;
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Mutex;

pub(crate) struct AppState {
    pub city: Mutex<Option<City>>,
    pub optimized_transit: Mutex<Option<TransitNetwork>>, // Stores optimized routes
    pub optimized_route_ids: Mutex<Vec<String>>,          // Tracks which routes have been optimized
    pub noop_route_ids: Mutex<Vec<String>>, // Tracks which routes which cannot be optimized
    pub cached_transfers: Mutex<Option<(Vec<String>, f64, HashMap<NodeIndex, f64>)>>, // Cache (route_ids, avg_transfers, zone_transfers)
    pub aco_params: Mutex<aco2::ACO>, // ACO parameters
}

#[derive(Deserialize)]
struct RouteIds {
    routes: Vec<String>,
}

pub(crate) fn get_optimized_geojson(
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

#[get("/get-noop-routes")]
async fn get_noop_route_ids(data: web::Data<AppState>) -> impl Responder {
    println!("Fetching routes that cannot be optimized");

    let noop_route_ids = data.noop_route_ids.lock().unwrap().clone();
    HttpResponse::Ok().json(serde_json::json!({
        "message": "Routes that cannot be optimized",
        "routes": noop_route_ids
    }))
}

#[post("/update-aco-params")]
async fn update_aco_params(
    params: web::Json<aco2::PartialACO>,
    data: web::Data<AppState>,
) -> impl Responder {
    println!("Updating ACO parameters");

    let mut aco_params = data.aco_params.lock().unwrap();
    aco_params.update_from_partial(params.into_inner());
    aco_params.print_stats();

    HttpResponse::Ok().json(serde_json::json!({
        "message": "ACO parameters updated"
    }))
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
        let params = data.aco_params.lock().unwrap().clone();
        if let Some((opt_route, eval)) = aco2::run_aco(params, &route, city) {
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
            data.noop_route_ids.lock().unwrap().push(route_id.clone());
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

    let routes = city
        .transit
        .routes
        .iter()
        .filter(|r| route_ids.routes.contains(&r.route_id))
        .collect::<Vec<&TransitRoute>>();

    let params = data.aco_params.lock().unwrap().clone();
    let results = aco2::run_aco_batch(params, &routes, city);

    // Track successful optimizations and evaluations
    let success_count = results.len();
    let mut all_evaluations = Vec::new();

    for (opt_route, eval) in results {
        // Track the optimized route ID
        if !optimized_route_ids.contains(&opt_route.route_id) {
            optimized_route_ids.push(opt_route.route_id.clone());
        }

        // Update the optimized transit with the new route
        optimized_transit
            .routes
            .retain(|r| r.route_id != opt_route.route_id);
        optimized_transit.routes.push(opt_route);

        all_evaluations.push(eval);
    }

    // determine failed routes
    for route_id in &route_ids.routes {
        if !optimized_route_ids.contains(route_id) {
            data.noop_route_ids.lock().unwrap().push(route_id.clone());
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

#[get("/avg-transfers")]
async fn get_avg_transfers(data: web::Data<AppState>) -> impl Responder {
    println!("Getting average transfers");

    let city_guard = data.city.lock().unwrap();
    let optimized_route_ids = data.optimized_route_ids.lock().unwrap().clone();

    if let Some(city) = &*city_guard {
        let mut cached_transfers_guard = data.cached_transfers.lock().unwrap();

        // Check if we have a valid cache
        if let Some((cached_route_ids, cached_avg, cached_zone_transfers)) =
            &*cached_transfers_guard
        {
            if *cached_route_ids == optimized_route_ids {
                println!("Using cached transfers data");

                // Convert cached zone transfers to JSON
                let zone_transfers_json: Vec<serde_json::Value> = cached_zone_transfers
                    .iter()
                    .map(|(ni, transfers)| {
                        let zone = city.grid.get_zone(*ni);
                        serde_json::json!({
                            "TRANSFERS": transfers,
                            "COORDINATES": match zone.polygon.centroid() {
                                Some(centroid) => [centroid.x(), centroid.y()],
                                None => [0.0, 0.0], // Default coordinates if centroid is None
                            }
                        })
                    })
                    .collect();

                return HttpResponse::Ok().json(serde_json::json!({
                    "average_transfers": cached_avg,
                    "zone_transfers": zone_transfers_json
                }));
            }
        }

        println!("Computing new transfers data");
        let optimized_transit_guard = data.optimized_transit.lock().unwrap();
        let optimized_transit = optimized_transit_guard.as_ref().unwrap();
        let (avg_transfers, zone_transfers) =
            eval::average_transfers(optimized_transit, &city.grid);

        println!("Average transfers: {}", avg_transfers);

        // Update cache
        *cached_transfers_guard = Some((
            optimized_route_ids.clone(),
            avg_transfers,
            zone_transfers.clone(),
        ));

        // Convert zone transfers to JSON
        let zone_transfers_json: Vec<serde_json::Value> = zone_transfers
            .iter()
            .map(|(ni, transfers)| {
                let zone = city.grid.get_zone(*ni);
                serde_json::json!({
                    "TRANSFERS": transfers,
                    "COORDINATES": match zone.polygon.centroid() {
                        Some(centroid) => [centroid.x(), centroid.y()],
                        None => [0.0, 0.0],
                    }
                })
            })
            .collect();

        HttpResponse::Ok().json(serde_json::json!({
            "average_transfers": avg_transfers,
            "zone_transfers": zone_transfers_json
        }))
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

        // Clear the list of noop route IDs
        {
            let mut noop_route_ids = data.noop_route_ids.lock().unwrap();
            noop_route_ids.clear();
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
        noop_route_ids: Mutex::new(Vec::new()),
        cached_transfers: Mutex::new(None),
        city: Mutex::new(city_result.ok()),
        aco_params: Mutex::new(aco2::ACO::init()),
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
            .service(get_avg_transfers)
            .service(get_noop_route_ids)
    })
    .bind(addr)?
    .run()
    .await?;

    println!("Server started at {} on port {}.", host, port);
    Ok(())
}
