use core::f64;
use std::sync::Arc;

use crate::layers::{
    grid::GridNetwork,
    road_network::RoadNetwork,
    transit_network::{TransitNetwork, TransitStop},
};

use super::consts;

/// Evaluate the ridership of a route at each stop
/// 
/// # Arguments
/// - `route_stops`: Vector of transit stops along the route
/// - `od`: Origin-Destination matrix data
/// 
/// # Returns
/// - Tuple of: 
///   - Vector of ridership at each stop
///   - Average ridership per stop
/// 
/// # Notes
/// - Ridership is calculated by summing the demand between zones for all pairs of stops
/// - Ridership is distributed equally over all stops in the same zone
/// - TODO: Distribute ridership over other nearby routes if they service the same zone-to-zone demand
pub fn ridership_over_route(
    route_stops: &Vec<Arc<TransitStop>>,
    od: &GridNetwork,
) -> (Vec<f64>, f64) {
    let mut ridership = vec![];
    let mut total_ridership = 0.0;
    let mut zone_prev_outer = None;
    for i in 0..route_stops.len() {
        let stop = &route_stops[i];
        let (x, y) = (stop.geom.x(), stop.geom.y());
        let zone = od.find_nearest_zone(x, y).unwrap();
        if zone_prev_outer == Some(zone) {
            // track duplicate zones for stops, and skip them
            ridership.push(f64::NAN);
            continue;
        }
        let mut zone_prev = None;
        let mut net_at_stop = 0.0;
        // TODO divide demand by frequency
        // TODO distribute ridership over other nearby routes and stops
        for j in 0..i {
            // riders leaving at stop i
            let (x1, y1) = (route_stops[j].geom.x(), route_stops[j].geom.y());
            let zone_curr = od.find_nearest_zone(x1, y1).unwrap();
            // avoid double counting the same zone, assume the total demand from that zone
            // is distribued over all the stops in that zone from the route
            if zone_prev == Some(zone_curr) {
                continue;
            }
            zone_prev = Some(zone_curr);
            let demand = od.demand_between_zones(zone, zone_curr);
            net_at_stop -= demand;
        }
        for j in i + 1..route_stops.len() {
            // riders boarding at stop i
            let (x2, y2) = (route_stops[j].geom.x(), route_stops[j].geom.y());
            let zone_curr = od.find_nearest_zone(x2, y2).unwrap();
            if zone_prev == Some(zone_curr) {
                continue;
            }
            zone_prev = Some(zone_curr);
            let demand = od.demand_between_zones(zone, zone_curr);
            net_at_stop += demand;
        }
        zone_prev_outer = Some(zone);
        total_ridership += net_at_stop;
        ridership.push(total_ridership);
    }
    // for all NAN entries in a row, distribe the last non-NAN value over them
    // assume that the demand is equally distribued over all the stops in the same zone
    let mut last_non_nan = 0.0;
    let mut count_nan = 0;
    for i in 0..ridership.len() {
        if ridership[i].is_nan() {
            count_nan += 1;
        } else {
            if count_nan > 0 {
                let distribute = last_non_nan / (count_nan as f64);
                for j in 0..count_nan {
                    ridership[i - j - 1] = distribute;
                }
                count_nan = 0;
            }
            last_non_nan = ridership[i];
        }
    }
    let average_ridership = ridership.iter().sum::<f64>() / ridership.len() as f64;
    (ridership, average_ridership / consts::BUS_CAPACITY as f64)
}

pub fn evaluate_transit_network(
    transit: &TransitNetwork,
    road: &RoadNetwork,
    od: &GridNetwork,
) -> f64 {
    f64::NAN
}
