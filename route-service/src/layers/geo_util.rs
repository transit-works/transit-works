const LATITUDE_DEGREE_METERS: f64 = 110574.0;
const LONGITUDE_DEGREE_METERS: f64 = 111320.0;

/// Computes the square radius around a given latitude and longitude.
///
/// # Parameters
/// - `lat`: Latitude in WGS84 coordinates.
/// - `lon`: Longitude in WGS84 coordinates.
/// - `radius`: Radius in meters.
///
/// # Returns
/// The square radius in unit distance after the conversion.
pub fn compute_square_radius(lat: f64, lon: f64, radius: f64) -> f64 {
    let lat_radius = radius / LATITUDE_DEGREE_METERS;
    let lon_radius = radius / (LONGITUDE_DEGREE_METERS * lat.to_radians().cos());
    lat_radius.max(lon_radius)
}

/// Computes the envelope around a given latitude and longitude.
///
/// # Parameters
/// - `lat`: Latitude in WGS84 coordinates.
/// - `lon`: Longitude in WGS84 coordinates.
/// - `radius`: Radius in meters.
///
/// # Returns
/// A tuple containing the minimum latitude, minimum longitude, maximum latitude, and maximum longitude.
pub fn compute_envelope(lat: f64, lon: f64, radius: f64) -> (f64, f64, f64, f64) {
    let lat_radius = radius / LATITUDE_DEGREE_METERS;
    let lon_radius = radius / (LONGITUDE_DEGREE_METERS * lat.to_radians().cos());
    (
        lat - lat_radius,
        lon - lon_radius,
        lat + lat_radius,
        lon + lon_radius,
    )
}
