import { useMemo } from 'react';
import { GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers';
import { HeatmapLayer } from '@deck.gl/aggregation-layers';
import { SimpleMeshLayer } from '@deck.gl/mesh-layers';
import { COORDINATE_SYSTEM } from '@deck.gl/core';
import { PathLayer } from '@deck.gl/layers';
import { Matrix4 } from 'math.gl';
import lerpColor from '../../../utils/colorUtils';
import { routeTypeColorsArray } from '../../../utils/routeTypeColors';

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
  noopRoutes,
  showPopulationHeatmap,
  populationData,
  onClick,
  busMesh,
  busScale,
  colorByRouteType,
  showCoverageHeatmap,
  coverageData,
  resetFlag = false,
  layerVersion = 0,
}) {
  // Define colors
  const NOOP_COLOR = [255, 140, 0, 200]; // Orange for noop routes
  const DEFAULT_BUS_COLOR = [220, 0, 80, 180]; // More visible red for buses
  const DEFAULT_OTHER_COLOR = [100, 100, 100, 255]; // Grey for other transit types
  
  // Memoize processed data to avoid recalculation on every render
  const processedData = useMemo(() => {
    // Create a stop-to-route index for faster lookups
    const stopToRouteMap = new Map();
    
    // Build the index first
    filteredData.features.forEach(feature => {
      if (feature.geometry.type === 'LineString' && feature.properties.route_stops) {
        feature.properties.route_stops.forEach(stopId => {
          if (!stopToRouteMap.has(stopId)) {
            stopToRouteMap.set(stopId, []);
          }
          stopToRouteMap.get(stopId).push(feature);
        });
      }
    });
    
    // Now use the index for lookups
    return {
      ...filteredData,
      features: filteredData.features.map(feature => {
        if (feature.geometry.type === 'Point' && !feature.properties.route_type) {
          const stopId = feature.properties.stop_id;
          const relatedRoutes = stopToRouteMap.get(stopId) || [];
          
          if (relatedRoutes.length > 0) {
            // Just use the first related route (or implement more complex logic if needed)
            const relatedRoute = relatedRoutes[0];
            return {
              ...feature,
              properties: {
                ...feature.properties,
                route_type: relatedRoute.properties.route_type,
                route_id: relatedRoute.properties.route_id
              }
            };
          }
        }
        return feature;
      })
    };
  }, [filteredData]);
  
  // Memoize noop routes data
  const noopRoutesData = useMemo(() => {
    if (!noopRoutes || noopRoutes.size === 0) return null;
    
    return {
      ...filteredData,
      features: filteredData.features.filter(feature => 
        feature.geometry.type === 'LineString' && 
        noopRoutes.has(feature.properties.route_id)
      )
    };
  }, [filteredData, noopRoutes]);
  
  // Memoize the non-noop routes
  const nonNoopRoutesData = useMemo(() => {
    if (!noopRoutes || noopRoutes.size === 0) return processedData;
    
    return {
      ...processedData,
      features: processedData.features.filter(feature => 
        !(feature.geometry.type === 'LineString' && 
          noopRoutes.has(feature.properties.route_id))
      )
    };
  }, [processedData, noopRoutes]);
  
  // Pre-compute route color mapping once, not for each feature
  const getRouteColor = useMemo(() => {
    const colorMap = new Map();
    
    // Populate the map with all known route colors
    processedData.features.forEach(feature => {
      if (feature.geometry.type === 'LineString') {
        const routeId = feature.properties.route_id;
        const routeType = parseInt(feature.properties.route_type, 10);
        
        if (!colorMap.has(routeId)) {
          if (noopRoutes && noopRoutes.has(routeId)) {
            colorMap.set(routeId, NOOP_COLOR);
          } else if (useRandomColors) {
            colorMap.set(routeId, routeColorMap[routeId] || [200, 0, 80, 180]);
          } else if (colorByRouteType) {
            colorMap.set(routeId, routeTypeColorsArray[routeType] || routeTypeColorsArray.default);
          } else {
            colorMap.set(routeId, routeType === 3 ? DEFAULT_BUS_COLOR : DEFAULT_OTHER_COLOR);
          }
        }
      }
    });
    
    return colorMap;
  }, [processedData, noopRoutes, useRandomColors, colorByRouteType, routeColorMap]);
  
  // Memoize the complete layers array
  return useMemo(() => {
    const layers = [];
    
    // Add stop points layer
    layers.push(
      new GeoJsonLayer({
        id: 'stops-layer',
        data: processedData,
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
            
            // If colorByRouteType is true, use the route type colors
            if (colorByRouteType) {
              return routeTypeColorsArray[routeType] || routeTypeColorsArray.default;
            } else {
              // Otherwise use simple red for buses (type 3), grey for others
              return routeType === 3 ? DEFAULT_BUS_COLOR : DEFAULT_OTHER_COLOR;
            }
          }
          
          // Default color for stops without route type information - match bus color
          return DEFAULT_BUS_COLOR;
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
    
    // Add main routes layer (excluding noop routes)
    layers.push(
      new GeoJsonLayer({
        id: `routes-layer-${useRandomColors ? 'random' : (colorByRouteType ? 'typecolor' : 'default')}-${layerVersion || 0}`,
        data: nonNoopRoutesData,
        stroked: true,
        filled: false,
        getLineColor: d => {
          const routeId = d.properties.route_id;
          
          // When reset flag is true, never use noop colors
          if (resetFlag) {
            // Skip noop route coloring and go straight to default colors
            if (useRandomColors) {
              return routeColorMap[routeId] || [200, 0, 80, 180];
            }
            
            const routeType = parseInt(d.properties.route_type, 10);
            if (colorByRouteType) {
              return routeTypeColorsArray[routeType] || routeTypeColorsArray.default;
            } else {
              return routeType === 3 ? DEFAULT_BUS_COLOR : DEFAULT_OTHER_COLOR;
            }
          }
          
          // Normal color logic for non-reset mode
          if (multiSelectMode && effectiveSelectedRoutes.has(routeId)) {
            return [30, 144, 255, 220];
          }
          
          // REMOVE the noop route coloring from here since they're in a separate layer
          
          // Use random colors if that option is selected
          if (useRandomColors) {
            return routeColorMap[routeId] || [200, 0, 80, 180]; // Random or fallback color
          }
          
          // Parse route type as a number
          const routeType = parseInt(d.properties.route_type, 10);
          
          // If colorByRouteType is true, use the route type color array
          if (colorByRouteType) {
            return routeTypeColorsArray[routeType] || routeTypeColorsArray.default;
          } else {
            // Otherwise use simple red for buses (type 3), grey for others
            return routeType === 3 ? DEFAULT_BUS_COLOR : DEFAULT_OTHER_COLOR;
          }
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
    
    // Add noop routes layer only if needed
    if (noopRoutesData) {
      layers.push(
        new GeoJsonLayer({
          id: `noop-routes-layer-${noopRoutes.size}-${layerVersion || 0}`,
          data: noopRoutesData,
          stroked: true,
          filled: false,
          getLineColor: NOOP_COLOR, // Always orange for noop routes
          getLineWidth: d => {
            // Cache routeId and selection check for performance
            const routeId = d.properties.route_id;
            const isSelected = multiSelectMode && effectiveSelectedRoutes.has(routeId);
            return isSelected ? 6 : 4;
          },
          lineWidthMinPixels: 2,
          lineWidthScale: 5,
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
    }
    
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
          const routeIndex = processedData.features
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
        ? processedData.features.filter(feature => 
            feature.geometry.type === 'LineString' && !optimizedRoutes.has(feature.properties.route_id)
          )
        : processedData.features.filter(feature => 
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
        // Check if this is a noop route
        else if (noopRoutes && noopRoutes.has(routeId)) {
          color = NOOP_COLOR; // Orange for noop routes
        }
        // Check if optimized 
        else if (optimizedRoutes && optimizedRoutes.has(routeId)) {
          color = [46, 204, 113, 200]; // Green color for optimized route
        } 
        // Random colors mode
        else if (useRandomColors) {
          color = routeColorMap[routeId] || [200, 0, 80, 180]; // Fallback color
        } 
        // Color by route type
        else if (colorByRouteType) {
          const routeType = parseInt(feature.properties.route_type, 10);
          color = [...(routeTypeColorsArray[routeType] || routeTypeColorsArray.default)];
        }
        // Default mode - red for buses, grey for others
        else {
          const routeType = parseInt(feature.properties.route_type, 10);
          color = routeType === 3 ? DEFAULT_BUS_COLOR : DEFAULT_OTHER_COLOR;
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

    if (showCoverageHeatmap) {
      layers.push(
        new HeatmapLayer({
          id: 'coverage-heatmap',
          data: coverageData,
          getPosition: d => d.COORDINATES,
          getWeight: d => d.TRANSFERS,
          radiusPixels: 275,
          intensity: 1.2,
          threshold: 0.05,
          opacity: 0.6,
          colorRange: [
            [51, 153, 255],   // Light blue
            [0, 102, 204],    // Medium blue
            [0, 51, 153],     // Dark blue
          ],
          visible: showCoverageHeatmap,
        })
      );
    }
    
    return layers;
  }, [
    processedData, 
    nonNoopRoutesData,
    noopRoutesData,
    noopRoutes, 
    show3DRoutes,
    mapStyle,
    routeColorMap,
    multiSelectMode,
    effectiveSelectedRoutes,
    useRandomColors,
    optimizedRoutes,
    colorByRouteType,
    // ...other dependencies
  ]);
}