/**
 * Returns the initial view state for the map based on the selected city
 * @param {string} city - The city to center the map on
 * @returns {Object} The initial view state object for the map
 */
export function getInitialViewState(city = 'toronto') {
  // Default to Toronto if no city specified
  const cityCoordinates = {
    toronto: {
      latitude: 43.6532,
      longitude: -79.3832,
      zoom: 12,
      bearing: 0,
      pitch: 30
    },
    ottawa: {
      latitude: 45.4215,
      longitude: -75.6972,
      zoom: 11,
      bearing: 0,
      pitch: 30
    },
    vancouver: {
      latitude: 49.2827,
      longitude: -123.1207,
      zoom: 12,
      bearing: 0,
      pitch: 30
    },
    montreal: {
      latitude: 45.5017,
      longitude: -73.5673,
      zoom: 11.5,
      bearing: 0,
      pitch: 30
    },
    // Add more cities as needed
  };

  return cityCoordinates[city.toLowerCase()] || cityCoordinates.toronto;
}

/**
 * Calculates the bounding box for a set of coordinates
 * @param {Array} coordinates - Array of [longitude, latitude] coordinates
 * @returns {Object} Bounding box with minLng, maxLng, minLat, maxLat
 */
export function getBoundingBox(coordinates) {
  if (!coordinates || coordinates.length === 0) {
    return null;
  }
  
  const bounds = coordinates.reduce(
    (acc, coord) => {
      return {
        minLng: Math.min(acc.minLng, coord[0]),
        maxLng: Math.max(acc.maxLng, coord[0]),
        minLat: Math.min(acc.minLat, coord[1]),
        maxLat: Math.max(acc.maxLat, coord[1]),
      };
    },
    {
      minLng: Infinity,
      maxLng: -Infinity,
      minLat: Infinity,
      maxLat: -Infinity,
    }
  );
  
  return bounds;
}

/**
 * Calculates viewport to fit all provided coordinates
 * @param {Array} coordinates - Array of [longitude, latitude] coordinates
 * @param {Object} options - Additional options like padding
 * @returns {Object} Viewport settings (longitude, latitude, zoom)
 */
export function getFitBoundsViewport(coordinates, options = { padding: 50 }) {
  const bounds = getBoundingBox(coordinates);
  if (!bounds) return null;
  
  const { minLng, maxLng, minLat, maxLat } = bounds;
  const width = window.innerWidth;
  const height = window.innerHeight;
  
  // Calculate the center point
  const longitude = (minLng + maxLng) / 2;
  const latitude = (minLat + maxLat) / 2;
  
  // Calculate zoom level
  const latDiff = Math.abs(maxLat - minLat);
  const lngDiff = Math.abs(maxLng - minLng);
  
  const maxDiff = Math.max(
    latDiff * (width / height),
    lngDiff
  );
  
  // The magic number 360 is for full world map, adjust as needed
  // Higher divisor = more zoomed in
  const zoom = Math.floor(Math.log2(360 / maxDiff)) - 1;
  
  return {
    longitude,
    latitude,
    zoom: Math.min(Math.max(zoom, 9), 15), // Clamp zoom between 9 and 15
    transitionDuration: 1000,
  };
}
