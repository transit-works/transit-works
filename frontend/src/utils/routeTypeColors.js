/**
 * Centralized definition of route type colors used throughout the application.
 * Each type corresponds to GTFS route_type values.
 */

// RGB array format for deck.gl layers
export const routeTypeColorsArray = {
  0: [250, 0, 80, 220],         // Tram/Streetcar/Light rail
  1: [250, 192, 94, 220],       // Subway/Metro
  2: [132, 66, 245, 220],       // Rail
  3: [220, 220, 220, 220],      // Bus
  4: [179, 99, 5, 220],         // Ferry
  5: [229, 26, 255, 220],       // Cable car
  6: [0, 154, 152, 220],        // Gondola
  7: [243, 169, 187, 220],      // Funicular
  default: [200, 0, 80, 220]    // Default
};

// CSS-friendly RGB format for UI components
export const routeTypeColorsRGB = {
  0: 'rgb(250, 0, 80)',        // Tram/Streetcar/Light rail
  1: 'rgb(250, 192, 94)',      // Subway/Metro
  2: 'rgb(132, 66, 245)',      // Rail
  3: 'rgb(220, 220, 220)',     // Bus
  4: 'rgb(179, 99, 5)',        // Ferry
  5: 'rgb(229, 26, 255)',      // Cable car
  6: 'rgb(0, 154, 152)',      // Gondola
  7: 'rgb(243, 169, 187)',     // Funicular
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