import { useMemo } from 'react';
import { GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers';
import { HeatmapLayer } from '@deck.gl/aggregation-layers';
import { SimpleMeshLayer } from '@deck.gl/mesh-layers';
import { COORDINATE_SYSTEM } from '@deck.gl/core';
import { PathLayer } from '@deck.gl/layers';
import { Matrix4 } from 'math.gl';
import lerpColor from '../../../utils/colorUtils';

// Define route type colors
const routeTypeColors = {
  0: [255, 140, 0, 220],       // Tram/Streetcar/Light rail - Orange
  1: [120, 20, 140, 220],      // Subway/Metro - Deep purple
  2: [184, 28, 198, 220],      // Rail - Magenta
  3: [200, 0, 80, 220],        // Bus - Original reddish color
  4: [96, 0, 128, 220],        // Ferry - Deep purple
  5: [175, 138, 0, 220],       // Cable car - Gold/amber
  6: [227, 55, 105, 220],      // Gondola - Coral pink
  7: [168, 0, 84, 220],        // Funicular - Raspberry
  default: [200, 0, 80, 220]   // Default - same as bus
};

export default function useMapLayers({
  filteredData,
  filteredOptimizedData,
  busPositions,
  show3DRoutes,
  mapStyle,
  routeColorMap,
  multiSelectMode,
  effectiveSelectedRoutes,
  useRandomColors,
  optimizedRoutes,
  showPopulationHeatmap,
  populationData,
  onClick,
  busMesh,
  busScale
}) {
  const layers = [];
  
  // Add stop points layer
  layers.push(
    new GeoJsonLayer({
      id: 'stops-layer',
      data: filteredData,
      stroked: true,
      filled: true,
      getFillColor: d => {
        // For stops, use the same color logic as routes
        if (d.properties.route_type) {
          const routeId = d.properties.route_id;
          
          // In multi-select mode, highlight selected routes' stops
          if (multiSelectMode && effectiveSelectedRoutes.has(routeId)) {
            return [30, 144, 255, 220]; // Blue for selected routes in multi-select
          }
          
          // Use random colors if that option is selected
          if (useRandomColors) {
            return routeColorMap[routeId] || [200, 0, 80, 180];
          }
          
          // Color by route type - ensure we parse as a number
          const routeType = parseInt(d.properties.route_type, 10);
          
          // Use the same centralized colors
          return routeTypeColors[routeType] || routeTypeColors.default;
        }
        
        // Default color for stops without route type information
        return [200, 0, 80, 180];
      },
      pointRadiusMinPixels: 2,
      getRadius: 10,
      pickable: true,
      autoHighlight: true,
      onClick,
      beforeId: 'watername_ocean',
      parameters: {
        depthTest: mapStyle === '/styles/dark_matter_3d.json',
        depthMask: true
      },
      // Only render Point geometries
      getFilterValue: (feature) => (feature.geometry.type === 'Point' ? 1 : 0),
      filterRange: [0.9, 1] // Strict filter threshold
    })
  );
  
  // Add routes layer
  layers.push(
    new GeoJsonLayer({
      id: `routes-layer-${useRandomColors ? 'random' : 'default'}`,
      data: filteredData,
      stroked: true,
      filled: false,
      getLineColor: d => {
        const routeId = d.properties.route_id;
        
        // In multi-select mode, highlight selected routes
        if (multiSelectMode && effectiveSelectedRoutes.has(routeId)) {
          return [30, 144, 255, 220]; // Blue for selected routes in multi-select
        }
        
        // Use random colors if that option is selected
        if (useRandomColors) {
          return routeColorMap[routeId] || [200, 0, 80, 180]; // Random or fallback color
        }
        
        // Color by route type - ensure we parse as a number
        const routeType = parseInt(d.properties.route_type, 10);
        
        // Use centralized color definitions
        return routeTypeColors[routeType] || routeTypeColors.default;
      },
      getLineWidth: d => {
        const routeId = d.properties.route_id;
        // Make selected routes slightly wider in multi-select mode
        return (multiSelectMode && effectiveSelectedRoutes.has(routeId)) ? 3 : 2;
      },
      lineWidthMinPixels: 2,
      lineWidthScale: 10,
      pickable: true,
      autoHighlight: true,
      onClick,
      beforeId: 'watername_ocean',
      parameters: {
        depthTest: mapStyle === '/styles/dark_matter_3d.json',
        depthMask: true
      },
      visible: !show3DRoutes,
      getFilterValue: (feature) => (feature.geometry.type === 'LineString' ? 1 : 0),
      filterRange: [0.9, 1]
    })
  );
  
  // Add optimized routes layer
  if (filteredOptimizedData) {
    layers.push(
      new GeoJsonLayer({
        id: `optimized-routes`,
        data: filteredOptimizedData,
        stroked: true,
        filled: false,
        getLineColor: [46, 204, 113, 200], // Green color for optimized routes
        getLineWidth: 3, // Slightly wider than regular routes
        lineWidthMinPixels: 3,
        lineWidthScale: 10,
        pickable: true,
        autoHighlight: true,
        onClick,
        beforeId: 'watername_ocean',
        parameters: {
          depthTest: mapStyle === '/styles/dark_matter_3d.json',
          depthMask: true
        },
        visible: !show3DRoutes, // Hide when in 3D mode
        // Only render LineString geometries
        getFilterValue: (feature) => (feature.geometry.type === 'LineString' ? 1 : 0),
        filterRange: [0.9, 1]
      })
    );
  }
  
  // Add bus layers
  if (busPositions.size > 0 && busMesh) {
    const finalBusModelMatrix = new Matrix4().rotateX(Math.PI / 2).scale(busScale || [8, 4, 8]);
    
    // Create a bus for each selected route
    Array.from(busPositions.entries()).forEach(([routeId, position]) => {
      // Determine bus height when in 3D mode
      let busHeight = 0;
      
      if (show3DRoutes) {
        // Find the layer index of the route
        const routeIndex = filteredData.features
          .filter(feature => feature.geometry.type === 'LineString')
          .findIndex(feature => feature.properties.route_id === routeId);
          
        if (routeIndex !== -1) {
          // Use the same height calculation as for the route layers
          busHeight = (routeIndex % 10) * 250;
        }
      }
      
      layers.push(
        new SimpleMeshLayer({
          id: `bus-${routeId}`,
          data: [{ position: [0, 0, busHeight] }],
          getPosition: d => d.position,
          coordinateSystem: COORDINATE_SYSTEM.METER_OFFSETS,
          coordinateOrigin: position,
          mesh: busMesh,
          sizeScale: 8,
          modelMatrix: finalBusModelMatrix,
          getColor: [255, 255, 20, 240],
          pickable: false,
        })
      );
    });
  }
  
  // Add 3D route layers if enabled
  if (show3DRoutes) {
    // Get all routes when in multi-select mode, not just filtered ones
    const routesToShow = multiSelectMode 
      ? filteredData.features.filter(feature => 
          feature.geometry.type === 'LineString' && !optimizedRoutes.has(feature.properties.route_id)
        )
      : filteredData.features.filter(feature => 
          feature.geometry.type === 'LineString'
        );
    
    // Define start and end colors for gradient
    const startColor = "#CC0050";
    const endColor = "#ffa826";
    
    const routeLayers = routesToShow.map((feature, index) => {
      const layerIndex = index % 10;
      const height = layerIndex * 250; // Height based on layer
      const routeId = feature.properties.route_id;
      
      // Determine color based on current mode, adding multi-select highlighting
      let color;
      
      // Multi-select mode - highlight selected routes with blue
      if (multiSelectMode && effectiveSelectedRoutes.has(routeId)) {
        color = [30, 144, 255, 220]; // Blue for selected routes (changed from orange)
      }
      // Check if optimized 
      else if (optimizedRoutes && optimizedRoutes.has(routeId)) {
        color = [46, 204, 113, 200]; // Green color for optimized route
      } 
      // Random colors mode
      else if (useRandomColors) {
        color = routeColorMap[routeId] || [200, 0, 80, 180]; // Fallback color
      } 
      // Default gradient
      else {
        const gradientPosition = layerIndex / 9; // 0 to 1 position in gradient
        const rgbColor = lerpColor(startColor, endColor, gradientPosition);
        color = [...rgbColor, 180];
      }
      
      // Create modified data with z-coordinate added
      const modifiedData = {
        ...feature,
        geometry: {
          ...feature.geometry,
          coordinates: feature.geometry.coordinates.map(coord => 
            [...coord, height]
          )
        }
      };
      
      return new PathLayer({
        id: `route-${feature.properties.route_id}`,
        data: [modifiedData],
        getPath: d => d.geometry.coordinates,
        getWidth: 4,
        getColor: color,
        widthUnits: 'pixels',
        pickable: true,
        autoHighlight: true,
        onClick: (info) => onClick(info)
      });
    });
    
    layers.push(...routeLayers);
  }
  
  // Add population heatmap if enabled
  if (showPopulationHeatmap && populationData) {
    layers.push(
      new HeatmapLayer({
        id: 'population-heatmap',
        data: populationData,
        getPosition: d => d.COORDINATES,
        getWeight: d => d.POPULATION,
        radiusPixels: 275,
        intensity: 1.2,
        threshold: 0.05,
        opacity: 0.6,
        visible: showPopulationHeatmap,
      })
    );
  }
  
  return layers;
}