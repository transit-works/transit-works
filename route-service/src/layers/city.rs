use serde::{Deserialize, Serialize};
use std::time::Instant;

use crate::gtfs::gtfs::Gtfs;

use super::{
    error::Error, grid::GridNetwork, road_network::RoadNetwork, transit_network::TransitNetwork,
};

const CITY_CACHE_DIR: &str = "city_cache";

/// Struct representing a city with its GTFS, grid, road and transit networks.
#[derive(Serialize, Deserialize)]
pub struct City {
    pub name: String,
    pub gtfs: Gtfs,
    pub grid: GridNetwork,
    pub road: RoadNetwork,
    pub transit: TransitNetwork,
}

impl City {
    /// Prints statistics about the city's data structures
    pub fn print_stats(&self) {
        println!("City: {}", self.name);
        self.gtfs.print_stats();
        self.grid.print_stats();
        self.road.print_stats();
        self.transit.print_stats();
    }

    /// Load a city from disk or generate from source data
    ///
    /// # Parameters
    /// - `name`: The name of the city
    /// - `gtfs_path`: The path to the GTFS data
    /// - `db_path`: The path to the database
    /// - `set_cache`: Whether to cache the city if not found
    /// - `invalidate_cache`: Whether to invalidate the city cache
    ///
    /// # Returns
    /// A fully loaded city with all components
    pub fn load(
        name: &str,
        gtfs_path: &str,
        db_path: &str,
        set_cache: bool,
        invalidate_cache: bool,
    ) -> Result<City, Error> {
        let start = Instant::now();
        let cache_file = format!("{}/{}.cached", CITY_CACHE_DIR, name);
        if invalidate_cache {
            log::debug!("Invalidating cache, deleting file {}", cache_file);
            std::fs::remove_file(&cache_file).ok();
        }

        if let Ok(city) = City::load_cached(name) {
            log::debug!(
                "Cache found for city: {} (loaded in {}ms)",
                name,
                start.elapsed().as_millis()
            );
            Ok(city)
        } else {
            log::debug!("Cache not found for city: {}", name);

            let gtfs_start = Instant::now();
            let gtfs = Gtfs::from_path(gtfs_path)?;
            log::debug!("GTFS loaded in {}ms", gtfs_start.elapsed().as_millis());

            let grid_start = Instant::now();
            let grid = GridNetwork::load(db_path)?;
            log::debug!(
                "Grid network loaded in {}ms",
                grid_start.elapsed().as_millis()
            );

            let road_start = Instant::now();
            let road = RoadNetwork::load(db_path)?;
            log::debug!(
                "Road network loaded in {}ms",
                road_start.elapsed().as_millis()
            );

            let transit_start = Instant::now();
            let transit = TransitNetwork::from_gtfs(&gtfs, &road)?;
            log::debug!(
                "Transit network built in {}ms",
                transit_start.elapsed().as_millis()
            );

            let city = City {
                name: name.to_string(),
                gtfs,
                grid,
                road,
                transit,
            };

            if set_cache {
                let cache_start = Instant::now();
                log::debug!("Setting cache for city: {}", name);
                std::fs::create_dir_all(CITY_CACHE_DIR)?;
                bincode::serialize_into(std::fs::File::create(cache_file)?, &city)?;
                log::debug!("City cached in {}ms", cache_start.elapsed().as_millis());
            }

            log::debug!(
                "City {} fully loaded in {}ms",
                name,
                start.elapsed().as_millis()
            );
            Ok(city)
        }
    }

    /// Load a city from cache
    ///
    /// # Parameters
    /// - `name`: The name of the city to load
    ///
    /// # Returns
    /// The cached city or an error if not found
    fn load_cached(name: &str) -> Result<City, Error> {
        let start = Instant::now();
        let cache_file = format!("{}/{}.cached", CITY_CACHE_DIR, name);
        if std::path::Path::new(&cache_file).exists() {
            let city: City = bincode::deserialize_from(std::fs::File::open(cache_file)?)?;
            log::debug!(
                "Cached city {} loaded in {}ms",
                name,
                start.elapsed().as_millis()
            );
            Ok(city)
        } else {
            Err(Error::CacheNotFound)
        }
    }

    /// Load a city with TransitNetwork from cache and other attributes loaded normally
    ///
    /// # Parameters
    /// - `name`: The name of the city
    /// - `gtfs_path`: The path to the GTFS data
    /// - `db_path`: The path to the database
    /// - `set_transit_cache`: Whether to cache the TransitNetwork if not found
    /// - `invalidate_transit_cache`: Whether to invalidate the TransitNetwork cache
    ///
    /// # Returns
    /// A city with TransitNetwork loaded from cache if available
    pub fn load_with_cached_transit(
        name: &str,
        gtfs_path: &str,
        db_path: &str,
        set_transit_cache: bool,
        invalidate_transit_cache: bool,
    ) -> Result<City, Error> {
        let start = Instant::now();
        let transit_cache_file = format!("{}/{}_transit.cached", CITY_CACHE_DIR, name);

        if invalidate_transit_cache {
            log::debug!(
                "Invalidating transit cache, deleting file {}",
                transit_cache_file
            );
            std::fs::remove_file(&transit_cache_file).ok();
        }

        // Load GTFS, grid, and road networks normally
        log::debug!("Loading GTFS from {}", gtfs_path);
        let gtfs_start = Instant::now();
        let gtfs = Gtfs::from_path(gtfs_path)?;
        log::debug!("GTFS loaded in {}ms", gtfs_start.elapsed().as_millis());

        log::debug!("Loading grid network from {}", db_path);
        let grid_start = Instant::now();
        let grid = GridNetwork::load(db_path)?;
        log::debug!(
            "Grid network loaded in {}ms",
            grid_start.elapsed().as_millis()
        );

        log::debug!("Loading road network from {}", db_path);
        let road_start = Instant::now();
        let road = RoadNetwork::load(db_path)?;
        log::debug!(
            "Road network loaded in {}ms",
            road_start.elapsed().as_millis()
        );

        // Try to load TransitNetwork from cache
        let transit_start = Instant::now();
        let transit = if std::path::Path::new(&transit_cache_file).exists() {
            log::debug!("Loading transit network from cache");
            let transit = bincode::deserialize_from(std::fs::File::open(transit_cache_file)?)?;
            log::debug!(
                "Transit network loaded from cache in {}ms",
                transit_start.elapsed().as_millis()
            );
            transit
        } else {
            log::debug!("Building transit network from GTFS");
            let build_start = Instant::now();
            let transit = TransitNetwork::from_gtfs(&gtfs, &road)?;
            log::debug!(
                "Transit network built in {}ms",
                build_start.elapsed().as_millis()
            );

            if set_transit_cache {
                let cache_start = Instant::now();
                log::debug!("Caching transit network to {}", transit_cache_file);
                std::fs::create_dir_all(CITY_CACHE_DIR)?;
                bincode::serialize_into(std::fs::File::create(transit_cache_file)?, &transit)?;
                log::debug!(
                    "Transit network cached in {}ms",
                    cache_start.elapsed().as_millis()
                );
            }
            transit
        };

        let city = City {
            name: name.to_string(),
            gtfs,
            grid,
            road,
            transit,
        };

        log::debug!(
            "City {} loaded with cached transit in {}ms",
            name,
            start.elapsed().as_millis()
        );
        Ok(city)
    }

    /// Load transit network from cache
    pub fn load_transit_from_cache(
        city_name: &str,
    ) -> Result<TransitNetwork, Error> {
        let transit_cache_file = format!("{}/{}_transit.cached", CITY_CACHE_DIR, city_name);

        if std::path::Path::new(&transit_cache_file).exists() {
            log::debug!("Loading transit network from cache");
            let transit = bincode::deserialize_from(std::fs::File::open(transit_cache_file)?)?;
            Ok(transit)
        } else {
            Err(Error::CacheNotFound)
        }
    }
}
