use geo::{Bearing, Distance, Geodesic, Haversine, Point};
use rstar::{Envelope, AABB};

const LATITUDE_DEGREE_METERS: f64 = 110574.0;
const LONGITUDE_DEGREE_METERS: f64 = 111320.0;

/// Computes the envelope around a given latitude and longitude.
///
/// # Parameters
/// - `lat`: Latitude in WGS84 coordinates.
/// - `lon`: Longitude in WGS84 coordinates.
/// - `radius`: Radius in meters.
///
/// # Returns
/// An axis-aligned bounding box (AABB) representing the envelope around the given latitude and longitude.
pub fn compute_envelope(lat: f64, lon: f64, radius: f64) -> AABB<[f64; 2]> {
    let lat_radius = radius / LATITUDE_DEGREE_METERS;
    let lon_radius = radius / (LONGITUDE_DEGREE_METERS * lat.to_radians().cos());
    AABB::from_corners(
        [lon - lon_radius, lat - lat_radius],
        [lon + lon_radius, lat + lat_radius],
    )
}

/// Computes the envelope in the direction of a target point, with the lat and lon on the edge of the envelope.
///
/// # Parameters
/// - `lat`: Latitude in WGS84 coordinates.
/// - `lon`: Longitude in WGS84 coordinates.
/// - `targ_lat`: Latitude of the target point in WGS84 coordinates.
/// - `targ_lon`: Longitude of the target point in WGS84 coordinates.
/// - `radius`: Radius in meters.
///
/// # Returns
/// An axis-aligned bounding box (AABB) from the given latitude and longitude to the target latitude and longitude.
/// The envelope has a width of `radius` meters and is oriented towards the target point.
pub fn compute_envelope_rect(
    lat: f64,
    lon: f64,
    targ_lat: f64,
    targ_lon: f64,
    radius: f64,
) -> AABB<[f64; 2]> {
    let lat_radius = radius / LATITUDE_DEGREE_METERS;
    let lon_radius = radius / (LONGITUDE_DEGREE_METERS * lat.to_radians().cos());
    let min_lat = lat.min(targ_lat) - lat_radius;
    let min_lon = lon.min(targ_lon) - lon_radius;
    let max_lat = lat.max(targ_lat) + lat_radius;
    let max_lon = lon.max(targ_lon) + lon_radius;
    AABB::from_corners([min_lon, min_lat], [max_lon, max_lat])
}

/// Determines if the bearing from point `a` to point `b` is north-easterly.
///
/// # Parameters
/// - `a`: Starting point.
/// - `b`: Destination point.
///
/// # Returns
/// `true` if the bearing is between 0 and 135 degrees or between 315 and 360 degrees, indicating a north-easterly direction.
pub fn is_outbound(a: Point, b: Point) -> bool {
    let bearing = Geodesic::bearing(a, b);
    let normalized_bearing = (bearing + 360.0) % 360.0;
    match normalized_bearing {
        0.0..=135.0 => true,
        315.0..=360.0 => true,
        _ => false,
    }
}

pub fn haversine(x1: f64, y1: f64, x2: f64, y2: f64) -> f64 {
    Haversine::distance(Point::new(x1, y1), Point::new(x2, y2))
}
