/**
 * Centralized definition of route type colors used throughout the application.
 * Each type corresponds to GTFS route_type values.
 */

// RGB array format for deck.gl layers
export const routeTypeColorsArray = {
  0: [132, 66, 245, 220],    // Tram/Streetcar/Light rail - Purple
  1: [250, 192, 94, 220],    // Subway/Metro - Yellow
  2: [184, 28, 198, 220],    // Rail - Magenta
  3: [200, 0, 80, 220],      // Bus - Original reddish color
  4: [96, 0, 128, 220],      // Ferry - Deep purple
  5: [175, 138, 0, 220],     // Cable car - Gold/amber
  6: [227, 55, 105, 220],    // Gondola - Coral pink
  7: [168, 0, 84, 220],      // Funicular - Raspberry
  default: [200, 0, 80, 220] // Default - same as bus
};

// CSS-friendly RGB format for UI components
export const routeTypeColorsRGB = {
  0: 'rgb(132, 66, 245)',      // Tram/Streetcar/Light rail
  1: 'rgb(250, 192, 94)',      // Subway/Metro
  2: 'rgb(184, 28, 198)',      // Rail
  3: 'rgb(200, 0, 80)',        // Bus
  4: 'rgb(96, 0, 128)',        // Ferry
  5: 'rgb(175, 138, 0)',       // Cable car
  6: 'rgb(227, 55, 105)',      // Gondola
  7: 'rgb(168, 0, 84)',        // Funicular
  default: 'rgb(200, 0, 80)'   // Default
};

// Human-readable names for each route type
export const routeTypeNames = {
  0: 'Tram/Streetcar',
  1: 'Subway/Metro',
  2: 'Rail',
  3: 'Bus',
  4: 'Ferry',
  5: 'Cable Car',
  6: 'Gondola',
  7: 'Funicular',
  default: 'Unknown'
};

// Combined data for easy access
export const routeTypeData = Object.entries(routeTypeColorsRGB).map(([type, color]) => ({
  type: isNaN(parseInt(type, 10)) ? 'default' : parseInt(type, 10),
  name: routeTypeNames[type],
  color: color
}));