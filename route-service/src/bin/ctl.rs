use std::time::Instant;

use clap::Parser;

use route_service::gtfs::geojson;
use route_service::gtfs::gtfs::Gtfs;
use route_service::layers::city::City;
use route_service::layers::{road_network::RoadNetwork, transit_network::TransitNetwork};
use route_service::opt::aco2::{run_aco_batch, run_aco_network, ACO};

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// City name to load (e.g., toronto, sanfrancisco)
    #[arg(long)]
    city: String,

    /// Path to GTFS data base directory
    #[clap(
        long,
        default_value = "/Users/jeevanopel/workspace/transit-works/scripts/city_data"
    )]
    gtfs_base_path: String,

    /// Path to database base directory
    #[clap(
        long,
        default_value = "/Users/jeevanopel/workspace/transit-works/scripts/city_db"
    )]
    db_base_path: String,

    /// Output directory for results
    #[arg(long, default_value = "./ctl_output")]
    output_dir: String,

    /// Optional suffix for output files
    #[arg(long)]
    suffix: Option<String>,

    /// Whether to optimize the entire network
    #[arg(long)]
    optimize_network: bool,

    /// Specific route IDs to optimize (comma separated)
    #[arg(long)]
    routes: Option<String>,

    /// Whether to output geojson files
    #[arg(long, default_value_t = true)]
    output_geojson: bool,

    /// Whether to save optimized network to cache
    #[arg(long, default_value_t = true)]
    save_cache: bool,

    /// Fix evaluations in cached transit networks
    #[arg(long)]
    fix_evals: bool,
}

// Fix evaluations for transit networks in the cache
fn fix_evals(city: &City) -> Result<(), Box<dyn std::error::Error>> {
    println!("Fixing evaluations for cached transit networks");

    // Fix evaluations for regular transit network
    let start = Instant::now();
    println!("Fixing evaluations for transit network");
    let mut transit = city.transit.clone();

    // Calculate all route evals first
    let route_evals: Vec<_> = transit
        .routes
        .iter()
        .map(|route| {
            route_service::opt::eval::TransitRouteEvals::for_route(&transit, route, &city.grid)
        })
        .collect();

    // Then update the routes with their evaluations
    for (route, eval) in transit.routes.iter_mut().zip(route_evals) {
        route.evals = Some(eval);
    }

    transit.evals = Some(route_service::opt::eval::TransitNetworkEvals::for_network(
        &transit, &city.grid,
    ));
    println!(
        "  Finished fixing transit network evaluations in {:?}",
        start.elapsed()
    );

    // Save updated transit network
    City::save_transit_to_cache(&city.name, &transit)?;
    println!("  Saved updated transit network to cache");

    // Check for optimized transit network and fix if it exists
    if let Ok(mut opt_transit) = City::load_opt_transit_from_cache(&city.name) {
        let start = Instant::now();
        println!("Fixing evaluations for optimized transit network");

        // Calculate all route evals first
        let route_evals: Vec<_> = opt_transit
            .network
            .routes
            .iter()
            .map(|route| {
                if opt_transit.optimized_routes.contains(&route.route_id) {
                    route_service::opt::eval::TransitRouteEvals::for_route(
                        &opt_transit.network,
                        route,
                        &city.grid,
                    )
                } else {
                    route_service::opt::eval::TransitRouteEvals::for_route(
                        &transit, route, &city.grid,
                    )
                }
            })
            .collect();

        // Then update the routes with their evaluations
        for (route, eval) in opt_transit.network.routes.iter_mut().zip(route_evals) {
            route.evals = Some(eval);
        }

        // update the original routes too

        opt_transit.network.evals =
            Some(route_service::opt::eval::TransitNetworkEvals::for_network(
                &opt_transit.network,
                &city.grid,
            ));
        println!(
            "  Finished fixing optimized transit network evaluations in {:?}",
            start.elapsed()
        );

        // Save updated optimized transit network
        City::save_opt_transit_to_cache(&city.name, &opt_transit)?;
        println!("  Saved updated optimized transit network to cache");
    } else {
        println!("  No optimized transit network found in cache");
    }

    Ok(())
}

fn main() {
    env_logger::init();
    let args = Args::parse();

    // Construct the paths for GTFS and DB
    let gtfs_path = format!("{}/{}/gtfs", args.gtfs_base_path, args.city);
    let db_path = format!("{}/{}.db", args.db_base_path, args.city);

    // Create output directory if it doesn't exist
    std::fs::create_dir_all(&args.output_dir).unwrap_or_else(|e| {
        eprintln!("Error creating output directory: {}", e);
    });

    println!(
        "Loading city: {} from {} and {}",
        args.city, gtfs_path, db_path
    );
    let city = City::load_with_cached_transit(&args.city, &gtfs_path, &db_path, true, false)
        .unwrap_or_else(|e| {
            eprintln!("Failed to load city: {}", e);
            std::process::exit(1);
        });

    // Handle fixing evaluations if requested
    if args.fix_evals {
        if let Err(e) = fix_evals(&city) {
            eprintln!("Failed to fix evaluations: {}", e);
            std::process::exit(1);
        }
        return;
    }

    // Initialize ACO parameters
    println!("Initializing ACO");
    let aco = ACO::init();
    aco.print_stats();

    // Define file name suffix
    let suffix = args.suffix.unwrap_or_else(|| "".to_string());

    // Output GTFS as geojson if requested
    if args.output_geojson {
        output_geojson(
            &city.gtfs,
            &format!("{}/gtfs{}.geojson", args.output_dir, suffix),
        );
        output_routes_geojson(
            &city.transit,
            &city.gtfs,
            &city.road,
            &format!("{}/before{}.geojson", args.output_dir, suffix),
        );
    }

    // Optimize specific routes if requested
    if let Some(route_ids) = args.routes {
        let route_ids: Vec<String> = route_ids.split(',').map(|s| s.trim().to_string()).collect();
        if !route_ids.is_empty() {
            println!("Optimizing specific routes: {:?}", route_ids);

            let target_routes = city
                .transit
                .routes
                .iter()
                .filter(|r| route_ids.contains(&r.route_id))
                .collect::<Vec<_>>();

            if target_routes.is_empty() {
                println!("No matching routes found for the provided IDs");
            } else {
                println!("Found {} matching routes", target_routes.len());
                println!("Running ACO on selected routes");

                let start = Instant::now();
                // Create a mutable copy of the transit network
                let mut new_transit = city.transit.clone();
                let optimized_route_ids =
                    run_aco_batch(aco.clone(), &target_routes, &city, &mut new_transit);
                println!("  ACO finished in {:?}", start.elapsed());

                // Create the OptimizedTransitNetwork structure
                let optimized_network = route_service::opt::aco2::OptimizedTransitNetwork {
                    network: new_transit,
                    optimized_routes: optimized_route_ids.clone(),
                };

                // Save to cache if requested
                if args.save_cache {
                    println!("Saving optimized network to cache");
                    if let Err(e) = City::save_opt_transit_to_cache(&args.city, &optimized_network)
                    {
                        eprintln!("Failed to save optimized network to cache: {}", e);
                    }
                }

                // Output geojson if requested
                if args.output_geojson {
                    let solution_path =
                        format!("{}/routes_solution{}.geojson", args.output_dir, suffix);
                    output_routes_geojson(
                        &optimized_network.network,
                        &city.gtfs,
                        &city.road,
                        &solution_path,
                    );
                    println!("Optimized routes saved to {}", solution_path);
                }

                println!("Optimized routes: {:?}", optimized_route_ids);
            }
        }
    } else if args.optimize_network {
        println!("Optimizing entire network");

        let start = Instant::now();
        let optimized_network = run_aco_network(aco.clone(), &city, &city.transit);
        // for i in 2..6 {
        //     println!("Iteration {}/{}", i, 5);
        //     run_aco_network(aco.clone(), &city, &optimized_network.network);
        // }
        println!("  Network optimization finished in {:?}", start.elapsed());

        // Save to cache if requested
        if args.save_cache {
            println!("Saving optimized network to cache");
            if let Err(e) = City::save_opt_transit_to_cache(&args.city, &optimized_network) {
                eprintln!("Failed to save optimized network to cache: {}", e);
            }
        }

        // Output geojson if requested
        if args.output_geojson {
            let solution_path = format!("{}/network_solution{}.geojson", args.output_dir, suffix);
            output_routes_geojson(
                &optimized_network.network,
                &city.gtfs,
                &city.road,
                &solution_path,
            );
            println!("Optimized network saved to {}", solution_path);
        }

        println!(
            "Optimized {} routes in the network",
            optimized_network.optimized_routes.len()
        );
    }
}

// Convert TransitNetwork to GeoJSON
// GTFS is an intermediate format
fn output_routes_geojson(
    transit: &TransitNetwork,
    src_gtfs: &Gtfs,
    road: &RoadNetwork,
    path: &str,
) {
    println!(
        "Writing {} routes as geojson to path: {}",
        transit.routes.len(),
        path
    );
    println!("  Converting GTFS to GeoJSON");
    let start = Instant::now();
    let gtfs = transit.to_gtfs(src_gtfs, road);
    println!("  Converted GTFS to GeoJSON in {:?}", start.elapsed());
    gtfs.print_stats();
    output_geojson(&gtfs, path)
}

// Output GTFS as GeoJSON
fn output_geojson(gtfs: &Gtfs, path: &str) {
    println!("Writing GTFS as geojson to path: {}", path);
    let start = Instant::now();
    let features = geojson::get_all_features(&gtfs);
    println!("  There are {} features", features.len());
    let geojson = geojson::convert_to_geojson(&features);
    println!("  Generated GeoJSON in {:?}", start.elapsed());
    std::fs::write(path, serde_json::to_string_pretty(&geojson).unwrap()).unwrap();
    println!("  Wrote GeoJSON");
}
