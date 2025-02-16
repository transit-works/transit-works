use serde::{Deserialize, Serialize};

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
    pub fn print_stats(&self) {
        println!("City: {}", self.name);
        self.gtfs.print_stats();
        self.grid.print_stats();
        self.road.print_stats();
        self.transit.print_stats();
    }

    pub fn load(
        name: &str,
        gtfs_path: &str,
        db_path: &str,
        set_cache: bool,
        invalidate_cache: bool,
    ) -> Result<City, Error> {
        let cache_file = format!("{}/{}.cached", CITY_CACHE_DIR, name);
        if invalidate_cache {
            log::debug!("Invalidating cache, deleting file {}", cache_file);
            std::fs::remove_file(&cache_file).ok();
        }

        if let Ok(city) = City::load_cached(name) {
            log::debug!("Cache found for city: {}", name);
            Ok(city)
        } else {
            log::debug!("Cache not found for city: {}", name);
            let gtfs = Gtfs::from_path(gtfs_path)?;
            let grid = GridNetwork::load(db_path)?;
            let road = RoadNetwork::load(db_path)?;
            let transit = TransitNetwork::from_gtfs(&gtfs, &road)?;

            let city = City {
                name: name.to_string(),
                gtfs,
                grid,
                road,
                transit,
            };

            if set_cache {
                log::debug!("Setting cache for city: {}", name);
                std::fs::create_dir_all(CITY_CACHE_DIR)?;
                bincode::serialize_into(std::fs::File::create(cache_file)?, &city)?;
            }

            Ok(city)
        }
    }

    fn load_cached(name: &str) -> Result<City, Error> {
        let cache_file = format!("{}/{}.cached", CITY_CACHE_DIR, name);
        if std::path::Path::new(&cache_file).exists() {
            let city: City = bincode::deserialize_from(std::fs::File::open(cache_file)?)?;
            Ok(city)
        } else {
            Err(Error::CacheNotFound)
        }
    }
}
