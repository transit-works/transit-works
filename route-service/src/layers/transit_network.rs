use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use geo_types::Point;
use rstar::{Envelope, PointDistance, RTree, RTreeObject, AABB};

use crate::gtfs::gtfs::Gtfs;
use crate::gtfs::structs::RouteType;
use crate::layers::error::Error;

// Layer 3 - Data structure describing the transit network
pub struct TransitNetwork {
    /// Set of all the transit routes in the network
    pub routes: Vec<TransitRoute>,
    /// RTree of all the transit stops for spatial queries
    pub stops: RTree<RTreeNode>,
}

impl TransitNetwork {
    pub fn print_stats(&self) {
        println!("Transit network:");
        println!("  Routes: {}", self.routes.len());
        println!("  Stops: {}", self.stops.size());
    }

    // Remove a stop from a given route
    // Cleanup the stop from RTree if no longer referenced
    pub fn remove_stop(&mut self, stop: Arc<TransitStop>, route: &mut TransitRoute) {
        // Remove the stop from the given route
        route
            .stops
            .retain(|route_stop| !Arc::ptr_eq(route_stop, &stop));

        // Remove the stop from the RTree if it is no longer referenced
        let still_referenced = self.routes.iter().any(|route| {
            route
                .stops
                .iter()
                .any(|route_stop| Arc::ptr_eq(route_stop, &stop))
        });
        if !still_referenced {
            self.stops.remove(&RTreeNode {
                envelope: compute_envelope(&stop.geom),
                stop: Arc::clone(&stop),
            });
        }
    }

    // Add a stop at a node on the road network
    // Reuse existing stop if it already exists
    pub fn add_stop(&mut self, stop: Arc<TransitStop>, route: &mut TransitRoute) {
        // Check if the stop already exists in the network
        let existing_stop = self
            .stops
            .nearest_neighbor_iter(&stop.geom.x_y().into())
            .find(|node| Arc::ptr_eq(&node.stop, &stop));

        // If the stop does not exist, add it to the RTree
        if existing_stop.is_none() {
            self.stops.insert(RTreeNode {
                envelope: compute_envelope(&stop.geom),
                stop: Arc::clone(&stop),
            });
        }

        // Add the stop to the route
        route.stops.push(Arc::clone(&stop));
    }

    pub fn from_gtfs(gtfs: Gtfs) -> Result<TransitNetwork, Error> {
        let mut stops = RTree::new();
        let mut stops_map = HashMap::new();
        for stop in gtfs.stops.values() {
            let transit_stop = Arc::new(TransitStop {
                stop_id: stop.stop_id.clone(),
                geom: Point::new(
                    stop.stop_lon.unwrap_or_default(),
                    stop.stop_lat.unwrap_or_default(),
                ),
            });
            stops.insert(RTreeNode {
                envelope: compute_envelope(&transit_stop.geom),
                stop: Arc::clone(&transit_stop),
            });
            stops_map.insert(stop.stop_id.clone(), Arc::clone(&transit_stop));
        }
        let mut routes = Vec::new();
        for trip in gtfs.trips.values() {
            let route_id = trip.route_id.clone();
            let route = gtfs.routes.get(&route_id).unwrap();
            let mut stops = Vec::new();
            let mut encountered_stops = HashSet::new();
            // Must check stop_times, and push each unique stop_id for this route
            // For routing, we do not care about times, they can be optimized separately
            for stop_time in trip.stop_times.iter() {
                if !encountered_stops.contains(&stop_time.stop_id) {
                    let stop = gtfs.stops.get(&stop_time.stop_id).unwrap();
                    stops.push(Arc::clone(stops_map.get(&stop.stop_id).unwrap()));
                    encountered_stops.insert(stop_time.stop_id.clone());
                }
            }
            routes.push(TransitRoute {
                route_id: route_id,
                route_type: route.route_type,
                stops: stops,
            });
        }
        Ok(TransitNetwork {
            routes: routes,
            stops: stops,
        })
    }
}

#[derive(PartialEq, Clone)]
pub struct TransitRoute {
    pub route_id: String,
    pub route_type: RouteType,
    pub stops: Vec<Arc<TransitStop>>,
}

#[derive(PartialEq, Clone)]
pub struct TransitStop {
    pub stop_id: String,
    pub geom: Point,
}

#[derive(PartialEq, Clone)]
pub struct RTreeNode {
    pub envelope: AABB<[f64; 2]>,
    pub stop: Arc<TransitStop>,
}

impl PointDistance for RTreeNode {
    fn distance_2(&self, point: &<Self::Envelope as Envelope>::Point) -> f64 {
        self.envelope.distance_2(point)
    }
}

impl RTreeObject for RTreeNode {
    type Envelope = AABB<[f64; 2]>;
    fn envelope(&self) -> Self::Envelope {
        self.envelope
    }
}

fn compute_envelope(point: &Point<f64>) -> AABB<[f64; 2]> {
    return AABB::from_point(point.x_y().into());
}
