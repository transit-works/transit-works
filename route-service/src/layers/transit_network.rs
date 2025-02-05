use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use geo_types::Point;
use rstar::{Envelope, PointDistance, RTree, RTreeObject, AABB};

use crate::gtfs::gtfs::Gtfs;
use crate::gtfs::structs::{Route, RouteType, Shape, Stop, StopTime, Trip};
use crate::layers::error::Error;

use super::geo_util;
use super::road_network::RoadNetwork;

// Layer 3 - Data structure describing the transit network
pub struct TransitNetwork {
    /// Set of all the transit routes in the network
    pub routes: Vec<TransitRoute>,
    /// RTrees of all the transit stops for spatial queries
    /// `inbound_stops` are stops that are part of the inbound direction of a route
    pub inbound_stops: RTree<RTreeNode>,
    /// `outbound_stops` are stops that are part of the outbound direction of a route
    pub outbound_stops: RTree<RTreeNode>,
}

impl TransitNetwork {
    pub fn print_stats(&self) {
        println!("Transit network:");
        println!("  Routes: {}", self.routes.len());
        println!("  Inbound stops: {}", self.inbound_stops.size());
        println!("  Outbound stops: {}", self.outbound_stops.size());
    }

    /// Build a transit network from GTFS data
    ///
    /// # Parameters
    /// - `gtfs`: The GTFS data
    ///
    /// # Returns
    /// A transit network
    ///
    /// For each routes, extracts the longest INBOUND and OUTBOUND trips
    /// and classifies stops from these trips as INBOUND or OUTBOUND depending on their
    /// geodesic bearing. Stops are stored in an RTree for spatial queries.
    pub fn from_gtfs(gtfs: &Gtfs) -> Result<TransitNetwork, Error> {
        let mut routes = Vec::new();
        let mut inbound_stops = RTree::new();
        let mut outbound_stops = RTree::new();
        let mut stops_map = HashMap::new();
        for route in gtfs.routes.values() {
            let route_id = route.route_id.clone();
            let (trip1, trip2) = match pick_inbound_outbound_trips(&route_id, gtfs) {
                Some(trips) => trips,
                None => continue,
            };
            // Get the longest trip in each direction
            routes.push(TransitRoute {
                route_id: route_id,
                route_type: route.route_type,
                inbound_stops: vec![],
                outbound_stops: vec![],
            });
            for trip in [trip1, trip2] {
                // Classify route as "outbound" or "inbound"
                let (insert_stops, insert_stops_tree) = if trip_is_outbound(trip) {
                    (
                        &mut routes.last_mut().unwrap().outbound_stops,
                        &mut outbound_stops,
                    )
                } else {
                    (
                        &mut routes.last_mut().unwrap().inbound_stops,
                        &mut inbound_stops,
                    )
                };
                // Extract the sequence of stops from the trip
                let mut encountered_stops = HashSet::new();
                for stop_times in trip.stop_times.iter() {
                    // Skip duplicate stops
                    if encountered_stops.contains(&stop_times.stop_id) {
                        continue;
                    }
                    // Allocate or return existing transit stop
                    let stop = {
                        if let Some(existing_stop) = stops_map.get(&stop_times.stop_id) {
                            // Return reference if stop exists
                            Arc::clone(existing_stop)
                        } else {
                            // Create a new stop and insert to rtree
                            let new_stop = Arc::new(TransitStop {
                                stop_id: stop_times.stop_id.clone(),
                                geom: Point::new(
                                    stop_times.stop.stop_lon.unwrap_or_default(),
                                    stop_times.stop.stop_lat.unwrap_or_default(),
                                ),
                            });
                            stops_map.insert(stop_times.stop_id.clone(), Arc::clone(&new_stop));
                            let rtree_node = RTreeNode {
                                envelope: compute_envelope(&new_stop.geom),
                                stop: Arc::clone(&new_stop),
                            };
                            insert_stops_tree.insert(rtree_node);
                            new_stop
                        }
                    };
                    insert_stops.push(stop);
                    encountered_stops.insert(stop_times.stop_id.clone());
                }
            }
        }
        Ok(TransitNetwork {
            routes: routes,
            inbound_stops: inbound_stops,
            outbound_stops: outbound_stops,
        })
    }

    /// Convert the transit network to GTFS format
    ///
    /// # Parameters
    /// - `src_gtfs`: The original GTFS data
    /// - `road`: The road network
    ///
    /// # Returns
    /// A GTFS object representing the transit network
    /// Currently only outputs the OUTBOUND trip of each route.
    /// TODO: Support inbound and outbound trips, display separate on frontend + geojson
    pub fn to_gtfs(&self, src_gtfs: &Gtfs, road: &RoadNetwork) -> Gtfs {
        let mut stops: HashMap<String, Arc<Stop>> = HashMap::new();
        let mut trips: HashMap<String, Vec<Trip>> = HashMap::new();
        let mut routes: HashMap<String, Route> = HashMap::new();
        let mut shapes: HashMap<String, Vec<Shape>> = HashMap::new();
        for route in self.routes.iter() {
            if route.route_type != RouteType::Bus {
                // TODO this block is not getting all the shapes somehow, some stops are not part of the route
                // Copy non-bus routes / trips / shapes / stops as is
                let src_route = src_gtfs.routes.get(&route.route_id).unwrap();
                routes.insert(src_route.route_id.clone(), (*src_route).clone());
                let trip = {
                    let (trip1, trip2) =
                        pick_inbound_outbound_trips(&route.route_id, src_gtfs).unwrap();
                    if trip_is_outbound(trip1) {
                        trip1
                    } else {
                        trip2
                    }
                };
                for src_trip in [trip] {
                    trips
                        .entry(route.route_id.clone())
                        .or_insert_with(Vec::new)
                        .push((*src_trip).clone());
                    if let Some(src_shape_id) = &src_trip.shape_id {
                        let src_shape = src_gtfs.shapes.get(src_shape_id).unwrap();
                        shapes.insert(src_shape_id.clone(), src_shape.clone());
                    }
                    for src_stop_time in src_trip.stop_times.iter() {
                        let src_stop = src_gtfs.stops.get(&src_stop_time.stop_id).unwrap();
                        stops.insert(src_stop.stop_id.clone(), src_stop.clone());
                    }
                }
                continue;
            }
            let route_id = route.route_id.clone();
            let mut shape = Vec::new();
            let mut stop_times = Vec::new();
            let mut stop_sequence = 0;
            let mut prev_stop: Option<&Arc<TransitStop>> = None;
            let mut shape_pt_sequence = 0;
            route.outbound_stops.iter().for_each(|stop| {
                let stop_id = stop.stop_id.clone();
                let gtfs_stop: Arc<Stop> = if !stops.contains_key(&stop_id) {
                    let src_stop = src_gtfs.stops.get(&stop_id).unwrap();
                    stops.insert(stop_id.clone(), src_stop.clone());
                    src_stop.clone()
                } else {
                    stops.get(&stop_id).unwrap().clone()
                };
                // This probably needs to be fixed
                stop_times.push(StopTime {
                    trip_id: route_id.clone(),
                    stop_id: stop_id.clone(),
                    stop_sequence: stop_sequence,
                    stop: gtfs_stop.clone(),
                    ..StopTime::default()
                });
                // The trip points to a shape
                if let Some(ps) = prev_stop {
                    let (_, path) = road.get_road_distance(
                        ps.geom.x(),
                        ps.geom.y(),
                        stop.geom.x(),
                        stop.geom.y(),
                    );
                    for node_index in path.iter() {
                        let node = road.get_node(*node_index);
                        shape.push(Shape {
                            shape_id: route_id.clone(),
                            shape_pt_lat: node.geom.y(),
                            shape_pt_lon: node.geom.x(),
                            shape_pt_sequence: shape_pt_sequence,
                            ..Shape::default()
                        });
                        shape_pt_sequence += 1;
                    }
                }
                stop_sequence += 1;
                prev_stop = Some(stop);
            });
            // TODO eventually can have many trips...
            trips.insert(
                route_id.clone(),
                vec![Trip {
                    route_id: route_id.clone(),
                    trip_id: route_id.clone(),
                    shape_id: Some(route_id.clone()),
                    stop_times: stop_times,
                    ..Trip::default()
                }],
            );
            let src_route = src_gtfs.routes.get(&route_id).unwrap();
            routes.insert(
                route_id.clone(),
                Route {
                    route_id: route_id.clone(),
                    route_short_name: src_route.route_short_name.clone(),
                    route_long_name: src_route.route_long_name.clone(),
                    route_desc: src_route.route_desc.clone(),
                    route_type: src_route.route_type,
                    route_url: src_route.route_url.clone(),
                    ..Route::default()
                },
            );
            shapes.insert(route_id.clone(), shape);
        }

        Gtfs {
            stops: stops,
            trips: trips,
            routes: routes,
            shapes: shapes,
            ..Gtfs::default()
        }
    }
}

/// Pick the longest trip in each direction
///
/// # Parameters
/// - `route_id`: The route to pick the trips from
/// - `gtfs`: The GTFS data
///
/// # Returns
/// A tuple containing the longest trip in each direction
/// or None if 2 trips in different directions were not found.
fn pick_inbound_outbound_trips<'a>(
    route_id: &String,
    gtfs: &'a Gtfs,
) -> Option<(&'a Trip, &'a Trip)> {
    // Get the longest trip in each direction
    let trip1 = gtfs
        .trips
        .get(route_id)
        .unwrap()
        .iter()
        .filter(|trip| trip.direction_id == Some(0))
        .max_by_key(|trip| trip.stop_times.len());
    let trip2 = gtfs
        .trips
        .get(route_id)
        .unwrap()
        .iter()
        .filter(|trip| trip.direction_id == Some(1))
        .max_by_key(|trip| trip.stop_times.len());
    if let (Some(trip1), Some(trip2)) = (trip1, trip2) {
        // Ensure that the trips are in different directions
        assert_ne!(
            trip_is_outbound(trip1),
            trip_is_outbound(trip2),
            "The trips must be in different directions"
        );
        Some((trip1, trip2))
    } else {
        // If there are no trips in one direction, return None
        None
    }
}

/// Check if the trip is outbound
///
/// # Parameters
/// - `trip`: The trip to check
///
/// # Returns
/// `true` if the trip is outbound, `false` otherwise
/// Outbound is defined as trips that have a northerly or
/// easterly geodesic bearing
fn trip_is_outbound(trip: &Trip) -> bool {
    let (first, last) = (
        trip.stop_times.first().unwrap().stop.clone(),
        trip.stop_times.last().unwrap().stop.clone(),
    );
    let (a, b) = (
        Point::new(
            first.stop_lon.unwrap_or_default(),
            first.stop_lat.unwrap_or_default(),
        ),
        Point::new(
            last.stop_lon.unwrap_or_default(),
            last.stop_lat.unwrap_or_default(),
        ),
    );
    geo_util::is_outbound(a, b)
}

#[derive(PartialEq, Clone)]
pub struct TransitRoute {
    pub route_id: String,
    pub route_type: RouteType,
    pub inbound_stops: Vec<Arc<TransitStop>>,
    pub outbound_stops: Vec<Arc<TransitStop>>,
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
