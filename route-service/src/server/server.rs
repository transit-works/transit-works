use crate::gtfs::geojson;
use crate::layers::city::City;
use crate::opt::aco::ACO;
use crate::opt::eval;
use crate::server::cors::cors_middleware; // Import the CORS middleware

use actix_web::{get, post, web, App, HttpResponse, HttpServer, Responder};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::Mutex;

// Application state that is shared across all endpoints
struct AppState {
    city: Mutex<Option<City>>,
    gtfs_path: String,
    db_path: String,
}

#[derive(Deserialize)]
struct RouteIds {
    routes: Vec<String>,
}

#[derive(Serialize)]
struct GridResponse {
    message: String,
}

#[get("/get-data")]
async fn get_data(data: web::Data<AppState>) -> impl Responder {
    println!("Fetching network data");

    // Try to access the city from the shared state
    let city_guard = data.city.lock().unwrap();

    if let Some(city) = &*city_guard {
        let features = geojson::get_all_features(&city.transit.to_gtfs(&city.gtfs, &city.road));
        println!("There are {} features", features.len());
        let geojson = geojson::convert_to_geojson(&features);
        println!("Generated GeoJSON");
        HttpResponse::Ok().json(geojson)
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

    let mut city_guard = data.city.lock().unwrap();

    if let Some(city) = &mut *city_guard {
        // Find the route with the given ID
        let route = city.transit.routes.iter().find(|r| r.route_id == route_id);

        if let Some(route) = route {
            // Create ACO instance on demand for this optimization
            let mut aco = ACO::init();

            if let Some((opt_route, eval)) = aco.optimize_route(&city.grid, &city.road, &city.transit, route) {
                // Update the route with the optimized version
                city.transit.routes.retain(|r| r.route_id != route_id);
                city.transit.routes.push(opt_route);

                HttpResponse::Ok().json(serde_json::json!({
                    "message": format!("Optimized route {}", route_id),
                    "geojson": geojson::convert_to_geojson(&geojson::get_all_features(&city.transit.to_gtfs(&city.gtfs, &city.road))),
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
    } else {
        HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "City data not loaded"
        }))
    }
}

#[post("/optimize-routes")]
async fn optimize_routes(
    route_ids: web::Json<RouteIds>,
    data: web::Data<AppState>,
) -> impl Responder {
    println!("Optimizing multiple routes: {:?}", route_ids.routes);

    let mut city_guard = data.city.lock().unwrap();

    if let Some(city) = &mut *city_guard {
        // Create ACO instance on demand for this optimization
        let mut aco = ACO::init();

        // TODO: Implement multi-route optimization
        HttpResponse::Ok().json(serde_json::json!({
            "message": "Multiple route optimization in progress",
            "routes": route_ids.routes
        }))
    } else {
        HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "City data not loaded"
        }))
    }
}

#[get("/evaluate-route/{route_id}")]
async fn evaluate_route(route_id: web::Path<String>, data: web::Data<AppState>) -> impl Responder {
    let route_id = route_id.into_inner();
    println!("Evaluating route: {}", route_id);

    let city_guard = data.city.lock().unwrap();

    if let Some(city) = &*city_guard {
        // Find the route with the given ID
        let route = city.transit.routes.iter().find(|r| r.route_id == route_id);

        if let Some(route) = route {
            let (ridership, avg_occupancy) = eval::ridership_over_route(&route.outbound_stops, &city.grid);
            HttpResponse::Ok().json(serde_json::json!({
                "route_id": route_id,
                "ridership": ridership,
                "average_occupancy": avg_occupancy
            }))
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
        // Extract grid network information
        let city_grid_info = eval::get_city_grid_info(&city.grid);

        HttpResponse::Ok().json(city_grid_info)
    } else {
        HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "City data not loaded"
        }))
    }
}

#[post("/reset-optimizations")]
async fn reset_optimizations(data: web::Data<AppState>) -> impl Responder {
    println!("Resetting all route optimizations");

    let mut city_guard = data.city.lock().unwrap();
    
    if let Some(city) = &mut *city_guard {
        // Load only the transit network from cache
        match City::load_transit_from_cache("toronto") {
            Ok(fresh_transit) => {
                // Replace just the transit part of the city
                city.transit = fresh_transit;
                
                return HttpResponse::Ok().json(serde_json::json!({
                    "message": "All route optimizations reset"
                }));
            }
            Err(e) => {
                return HttpResponse::InternalServerError().json(serde_json::json!({
                    "error": format!("Failed to reload transit data: {}", e)
                }));
            }
        }
    }
    
    HttpResponse::InternalServerError().json(serde_json::json!({
        "error": "City data not loaded"
    }))
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

    // Initialize application state with the city and paths for reloading
    let app_state = web::Data::new(AppState {
        city: Mutex::new(city_result.ok()),
        gtfs_path: gtfs_path.to_string(),
        db_path: db_path.to_string(),
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
            .service(reset_optimizations) // Add the new endpoint
    })
    .bind(addr)?
    .run()
    .await?;

    println!("Server started at {} on port {}.", host, port);
    Ok(())
}
