use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use geo_types::Point;
use rstar::{Envelope, PointDistance, RTree, RTreeObject, AABB};

use crate::gtfs::gtfs::Gtfs;
use crate::gtfs::structs::{Route, RouteType, Shape, Stop, StopTime, Trip};
use crate::layers::error::Error;

use super::road_network::RoadNetwork;

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

    pub fn from_gtfs(gtfs: &Gtfs) -> Result<TransitNetwork, Error> {
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
        for route in gtfs.routes.values() {
            let route_id = route.route_id.clone();
            let mut stops = Vec::new();
            let mut encountered_stops = HashSet::new();
            // Must check stop_times, and push each unique stop_id for this route
            // For routing, we do not care about times, they can be optimized separately
            if let Some(inbound_trip) = gtfs.trips.get(&route_id).unwrap().first() {
                let outbound_trip = gtfs
                    .trips
                    .get(&route_id)
                    .unwrap()
                    .iter()
                    .find(|trip| trip.direction_id != inbound_trip.direction_id);
                for trip in [Some(inbound_trip), outbound_trip] {
                    if let Some(trip) = trip {
                        for stop_times in trip.stop_times.iter() {
                            if !encountered_stops.contains(&stop_times.stop_id) {
                                let stop = gtfs.stops.get(&stop_times.stop_id).unwrap();
                                stops.push(Arc::clone(stops_map.get(&stop.stop_id).unwrap()));
                                encountered_stops.insert(stop_times.stop_id.clone());
                            }
                        }
                    }
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

                let src_trips = src_gtfs.trips.get(&route.route_id).unwrap();
                for src_trip in src_trips.iter() {
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
            route.stops.iter().for_each(|stop| {
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
