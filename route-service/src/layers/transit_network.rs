use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use geo::{Distance, Haversine, Length, LineString};
use geo_types::Point;
use petgraph::graph::NodeIndex;
use rstar::{Envelope, PointDistance, RTree, RTreeObject, AABB};
use serde::{Deserialize, Serialize};

use crate::gtfs::gtfs::Gtfs;
use crate::gtfs::structs::{Route, RouteType, Shape, Stop, StopTime, Trip};
use crate::layers::error::Error;

use super::geo_util;
use super::road_network::RoadNetwork;

// Layer 3 - Data structure describing the transit network
#[derive(Clone, Deserialize, Serialize)]
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
    pub fn from_gtfs(gtfs: &Gtfs, road: &RoadNetwork) -> Result<TransitNetwork, Error> {
        let mut routes = Vec::new();
        let mut inbound_stops_tree = RTree::new();
        let mut outbound_stops_tree = RTree::new();
        let mut stops_map = HashMap::new();
        for route in gtfs.routes.values() {
            // Get the longest trip in each direction
            let (trip1, trip2) = match pick_inbound_outbound_trips(&route.route_id, gtfs) {
                Some(trips) => trips,
                None => continue,
            };
            let mut inbound_stops = vec![];
            let mut outbound_stops = vec![];
            for trip in [trip1, trip2] {
                let stop_to_osmid = map_transit_stops_to_osmid(trip, road);
                // Classify route as "outbound" or "inbound"
                let (insert_stops, insert_stops_tree) = if trip_is_outbound(trip) {
                    (&mut outbound_stops, &mut outbound_stops_tree)
                } else {
                    (&mut inbound_stops, &mut inbound_stops_tree)
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
                                osmid: stop_to_osmid.get(&stop_times.stop_id).cloned(),
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
            // Classify route type
            let route_type = if route.route_type == RouteType::Bus
                && (is_intercity(trip1, road) || is_intercity(trip2, road))
            {
                log::debug!("Classifying route {} as an intercity bus", route.route_id);
                TransitRouteType::IntercityBus
            } else {
                route.route_type.into()
            };
            // Add the route to the transit network
            routes.push(TransitRoute {
                route_id: route.route_id.clone(),
                route_type: route_type,
                inbound_stops: inbound_stops,
                outbound_stops: outbound_stops,
            });
        }
        Ok(TransitNetwork {
            routes: routes,
            inbound_stops: inbound_stops_tree,
            outbound_stops: outbound_stops_tree,
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
            if route.route_type != TransitRouteType::Bus {
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
                    let (_, path) = ps.road_distance(stop, road);
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

/// Map transit stops to road network node index
///
/// # Parameters
/// - `trip`: The trip to map
/// - `road`: The road network
///
/// # Returns
/// A hashmap mapping stop IDs to road network node indices
fn map_transit_stops_to_osmid(trip: &Trip, road: &RoadNetwork) -> HashMap<String, u64> {
    let mut stop_to_node = HashMap::new();
    //let mut stop_to_node_tmp = HashMap::new();
    // initialize the first stop
    let first_stop = &trip.stop_times.first().unwrap().stop;
    let first_node = road.find_nearest_node(
        first_stop.stop_lon.unwrap_or_default(),
        first_stop.stop_lat.unwrap_or_default(),
    );
    stop_to_node.insert(first_stop.stop_id.clone(), first_node.unwrap());
    // initialize last stop
    let last_stop = &trip.stop_times.last().unwrap().stop;
    let last_node = road.find_nearest_node(
        last_stop.stop_lon.unwrap_or_default(),
        last_stop.stop_lat.unwrap_or_default(),
    );
    stop_to_node.insert(last_stop.stop_id.clone(), last_node.unwrap());
    // iterate over pairs of stops and determine the appropriate nearest nodes by the most linear path
    for stop_time in trip.stop_times.windows(3) {
        let (s1, s2, s3) = (
            stop_time[0].stop.clone(),
            stop_time[1].stop.clone(),
            stop_time[2].stop.clone(),
        );
        let (s1_x, s1_y) = (
            s1.stop_lon.unwrap_or_default(),
            s1.stop_lat.unwrap_or_default(),
        );
        let (s2_x, s2_y) = (
            s2.stop_lon.unwrap_or_default(),
            s2.stop_lat.unwrap_or_default(),
        );
        let (s3_x, s3_y) = (
            s3.stop_lon.unwrap_or_default(),
            s3.stop_lat.unwrap_or_default(),
        );
        let (n1, n2, n3) = (
            *stop_to_node
                .get(&s1.stop_id)
                //.unwrap_or_else(|| stop_to_node_tmp.get(&s1.stop_id).unwrap()),
                .unwrap(),
            road.find_nearest_node(s2_x, s2_y).unwrap(),
            road.find_nearest_node(s3_x, s3_y).unwrap(),
        );
        let dist1_2 = road.get_road_distance(n1, n2).0;
        let dist2_3 = road.get_road_distance(n2, n3).0;
        let line1_2 = geo_util::haversine(s1_x, s1_y, s2_x, s2_y);
        let line2_3 = geo_util::haversine(s2_x, s2_y, s3_x, s3_y);
        let nl1_2 = dist1_2 / line1_2;
        let nl2_3 = dist2_3 / line2_3;
        //if nl1_2 < 1.1 && nl2_3 < 1.1 {
        // good enough
        stop_to_node.insert(s2.stop_id.clone(), n2);
        // } else {
        //     // need to maybe move s2 and s3
        //     let c2 = road.find_nearest_nodes(s2_x, s2_y, 50.0);
        //     let c3 = road.find_nearest_nodes(s3_x, s3_y, 50.0);
        //     let mut best_nl = f64::INFINITY;
        //     let mut best_n2 = n2;
        //     let mut best_n3 = n3;
        //     for n2 in &c2 {
        //         for n3 in &c3 {
        //             let dist1_2 = road.get_road_distance(n1, *n2).0;
        //             let dist2_3 = road.get_road_distance(*n2, *n3).0;
        //             let line1_2 = geo_util::haversine(s1_x, s1_y, s2_x, s2_y);
        //             let line2_3 = geo_util::haversine(s2_x, s2_y, s3_x, s3_y);
        //             let nl1_2 = dist1_2 / line1_2;
        //             let nl2_3 = dist2_3 / line2_3;
        //             if nl1_2 < 1.1 && nl2_3 < 1.1 {
        //                 best_n2 = *n2;
        //                 best_n3 = *n3;
        //                 best_nl = (nl1_2 + nl2_3) / 2.0;
        //                 break;
        //             } else if (nl1_2 + nl2_3) / 2.0 < best_nl {
        //                 best_n2 = *n2;
        //                 best_n3 = *n3;
        //                 best_nl = (nl1_2 + nl2_3) / 2.0;
        //             }
        //         }
        //         if best_nl < 1.1 {
        //             break;
        //         }
        //     }
        // if the nonlinearity is really bad with s2, but s1 and s3 are linear
        // then maybe something is wrong with the road network
        //     if best_nl > 2.0
        //         && road.get_road_distance(n1, best_n3).0
        //             / geo_util::haversine(s1_x, s1_y, s3_x, s3_y)
        //             < 1.05
        //     {
        //         // if 1->2->3 is pretty much a straight line, maybe skip 2
        //         let line1_3 = LineString::from(vec![(s1_x, s1_y), (s2_x, s2_y), (s3_x, s3_y)]);
        //         let dist123 = line1_3.length::<Haversine>();
        //         let dist1_3 = geo_util::haversine(s1_x, s1_y, s3_x, s3_y);
        //         let nl123 = dist123 / dist1_3;
        //         if nl123 < 1.01 {
        //             // just pretend s2 doesn't exist, map to s1
        //             stop_to_node_tmp.insert(s2.stop_id.clone(), n1);
        //             continue;
        //         }
        //     }
        //     // best we can do
        //     stop_to_node.insert(s2.stop_id.clone(), best_n2);
        // }
    }
    // get osmid for each node index
    stop_to_node
        .iter()
        .map(|(stop_id, node_index)| {
            (
                stop_id.to_string(),
                road.get_osmid_by_node_index(*node_index),
            )
        })
        .collect()
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

#[derive(PartialEq, Clone, Deserialize, Serialize)]
pub struct TransitRoute {
    pub route_id: String,
    pub route_type: TransitRouteType,
    pub inbound_stops: Vec<Arc<TransitStop>>,
    pub outbound_stops: Vec<Arc<TransitStop>>,
}

#[derive(PartialEq, Clone, Deserialize, Serialize)]
pub enum TransitRouteType {
    Tram,
    Subway,
    Rail,
    Bus,
    Ferry,
    CableTram,
    AerialLift,
    Funicular,
    Trolleybus,
    Monorail,
    IntercityBus,
}

impl From<RouteType> for TransitRouteType {
    fn from(route_type: RouteType) -> Self {
        match route_type {
            RouteType::Tram => TransitRouteType::Tram,
            RouteType::Subway => TransitRouteType::Subway,
            RouteType::Rail => TransitRouteType::Rail,
            RouteType::Bus => TransitRouteType::Bus,
            RouteType::Ferry => TransitRouteType::Ferry,
            RouteType::CableTram => TransitRouteType::CableTram,
            RouteType::AerialLift => TransitRouteType::AerialLift,
            RouteType::Funicular => TransitRouteType::Funicular,
            RouteType::Trolleybus => TransitRouteType::Trolleybus,
            RouteType::Monorail => TransitRouteType::Monorail,
        }
    }
}

/// Classify intercity bus routes
///
/// # Parameters
/// - `trip`: The trip to check
/// - `road`: The road network
///
/// # Returns
/// `true` if the trip is intercity (has stops >500.0m from known road network), `false` otherwise
fn is_intercity(trip: &Trip, road: &RoadNetwork) -> bool {
    for stop in trip.stop_times.iter().map(|st| &st.stop) {
        let (sx, sy) = (
            stop.stop_lon.unwrap_or_default(),
            stop.stop_lat.unwrap_or_default(),
        );
        let nidx = road.find_nearest_node(sx, sy).unwrap();
        let node = road.get_node(nidx);
        let (nx, ny) = (node.geom.x(), node.geom.y());
        if geo_util::haversine(sx, sy, nx, ny) > 500.0 {
            return true;
        }
    }
    false
}

#[derive(PartialEq, Clone, Deserialize, Serialize)]
pub struct TransitStop {
    pub stop_id: String,
    pub geom: Point,
    osmid: Option<u64>, // nearby road network osmid, if one exists
}

impl TransitStop {
    fn get_node_index(&self, road: &RoadNetwork) -> Option<NodeIndex> {
        if let Some(osmid) = self.osmid {
            road.get_node_index_by_osmid(osmid)
        } else {
            None
        }
    }

    pub fn road_distance(&self, other: &TransitStop, road: &RoadNetwork) -> (f64, Vec<NodeIndex>) {
        if let (Some(n1), Some(n2)) = (self.get_node_index(road), other.get_node_index(road)) {
            // If stops have an appropriate road node mapping, then use the road distance
            road.get_road_distance(n1, n2)
        } else {
            // otherwise use the straight line distance
            (Haversine::distance(self.geom, other.geom), vec![])
        }
    }
}

#[derive(PartialEq, Clone, Deserialize, Serialize)]
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
