'use client';

import { useState, useRef, useEffect } from 'react';
import { Map, NavigationControl, Popup, useControl } from 'react-map-gl/maplibre';
import { GeoJsonLayer } from 'deck.gl';
import { SimpleMeshLayer } from '@deck.gl/mesh-layers';
import { MapboxOverlay as DeckOverlay } from '@deck.gl/mapbox';
import { CylinderGeometry } from '@luma.gl/engine';
import { Matrix4 } from 'math.gl';
import { COORDINATE_SYSTEM } from '@deck.gl/core';
import 'maplibre-gl/dist/maplibre-gl.css';
import './Map.css';
import { PathLayer } from '@deck.gl/layers';
import { HeatmapLayer } from '@deck.gl/aggregation-layers';
import lerpColor from '../../utils/colorUtils';
import RidershipChart from '../../components/visualization/RidershipChart';

const INITIAL_VIEW_STATE = {
  latitude: 43.647667,
  longitude: -79.385611,
  zoom: 12,
  bearing: 0,
};

const STYLE_3D = '/styles/dark_matter_3d.json';
const STYLE_REGULAR = '/styles/dark_matter.json';

// Create the overlay for Deck.gl layers.
function DeckGLOverlay(props) {
  const overlay = useControl(() => new DeckOverlay(props));
  overlay.setProps(props);
  return null;
}

// Create a bus mesh using CylinderGeometry.
const busMesh = new CylinderGeometry({
  radius: 0.5,
  height: 1,
  nradial: 32,
  topCap: true,
  bottomCap: true,
});

const busScale = [8, 4, 8];

function TransitMap({ 
  data, 
  selectedRoute: propsSelectedRoute, 
  setSelectedRoute: propsSetSelectedRoute, 
  selectedRoutes,
  setSelectedRoutes,
  optimizedRoutesData,
  optimizedRoutes, 
  resetOptimization,
  useLiveOptimization,
  setUseLiveOptimization,
  isOptimizing,
  optimizationProgress,
  currentEvaluation,
  onOptimize,
  optimizationError,
  mapStyle,
  show3DRoutes,
  useRandomColors,
  showPopulationHeatmap,
  multiSelectMode,
  setMultiSelectMode,
}) {
  // Add the missing mapRef
  const mapRef = useRef(null);
  
  // Keep other internal state that doesn't need to be shared
  const [popupInfo, setPopupInfo] = useState(null);
  const [busPositions, setBusPositions] = useState(new window.Map());
  // Keep other state variables
  const [panelOpen, setPanelOpen] = useState(true);
  const [routeColorMap, setRouteColorMap] = useState({});
  const [ridershipData, setRidershipData] = useState(null);
  const [populationData, setPopulationData] = useState(null);
  
  // Add local state for selectedRoute if not provided in props
  const [localSelectedRoute, setLocalSelectedRoute] = useState(null);
  
  // Use either the prop or local state
  const selectedRoute = propsSelectedRoute || localSelectedRoute;
  const setSelectedRoute = propsSetSelectedRoute || setLocalSelectedRoute;
  
  // If selectedRoutes is not provided, create a local version
  const [localSelectedRoutes, setLocalSelectedRoutes] = useState(new Set());
  const effectiveSelectedRoutes = selectedRoutes || localSelectedRoutes;
  const effectiveSetSelectedRoutes = setSelectedRoutes || setLocalSelectedRoutes;

  // Add these new state variables at the top of your component
  const [showOptimizedBanner, setShowOptimizedBanner] = useState(false);
  const [collapsedBanner, setCollapsedBanner] = useState(false);
  let bannerTimeout = useRef(null);

  // Add a state to track hover
  const [bannerHovered, setBannerHovered] = useState(false);

  // Add new state for parameters popup
  const [showParametersPopup, setShowParametersPopup] = useState(false);

  const fetchRidershipData = async (routeId) => {
    if (!routeId) return;
    
    try {
      // Call the backend route evaluation endpoint
      const response = await fetch(`http://localhost:8080/evaluate-route/${routeId}`);
      
      if (!response.ok) {
        throw new Error(`API returned status: ${response.status}`);
      }
      
      const data = await response.json();
      setRidershipData(data.ridership);
    } catch (error) {
      console.error('Error fetching ridership data:', error);
      setRidershipData(null);
    }
  };

  const fetchPopulationData = async () => {
    try {
      // Call the backend endpoint
      const response = await fetch('http://localhost:8080/grid');
      
      if (!response.ok) {
        throw new Error(`API returned status: ${response.status}`);
      }
      
      const data = await response.json();
      setPopulationData(data);
    } catch (error) {
      console.error('Error fetching population data:', error);
      setPopulationData(null);
    }
  };

  const handleMapLoad = () => {
    const map = mapRef.current.getMap();
    requestAnimationFrame(() => {
      map.once('idle', () => {
        document.body.classList.add('ready');
      });
      map.easeTo({
        pitch: 45,
        bearing: -10,
        duration: 2000,
        zoom: map.getZoom() + 0.1,
      });
    });
  };

  // Update onClick to handle multi-select mode
  const onClick = (info) => {
    if (info && info.object) {
      const { type } = info.object.geometry;
      if (type !== 'Point') {
        const routeId = info.object.properties.route_id;
        
        if (multiSelectMode) {
          // In multi-select mode, toggle the route in the selection set
          effectiveSetSelectedRoutes(prevSelectedRoutes => {
            const newSelectedRoutes = new Set(prevSelectedRoutes);
            if (newSelectedRoutes.has(routeId)) {
              newSelectedRoutes.delete(routeId);
            } else {
              newSelectedRoutes.add(routeId);
            }
            return newSelectedRoutes;
          });
          
          // Keep the last clicked route as the "selectedRoute" for compatibility
          setSelectedRoute(routeId);
          
          // Fetch ridership data when a route is selected
          fetchRidershipData(routeId);
          
          // Don't show popup in multi-select mode for routes
          return;
        } else {
          // Regular single selection mode
          setSelectedRoute((prevSelectedRoute) =>
            prevSelectedRoute === routeId ? null : routeId
          );
          
          // Clear the multi-select set if we're not in multi-select mode
          effectiveSetSelectedRoutes(new Set());
          
          // Fetch ridership data when a route is selected
          fetchRidershipData(routeId);
        }
      }
      
      // Only set popup info if not in multi-select mode or if it's a stop
      if (!multiSelectMode || type === 'Point') {
        setPopupInfo({
          coordinates: info.coordinate,
          properties: info.object.properties,
          type,
        });
      }
    }
  };

  const renderFixedInfoPanel = () =>
    popupInfo && (
      <div className="absolute w-1/6 top-3 right-3 z-10 bg-background-light/70 backdrop-blur-lg text-white rounded-2xl shadow-lg border border-zinc-800 max-w-xs overflow-hidden">
        <div className="p-4 bg-background-dk/40">
          {popupInfo.type === 'Point' ? (
            <div>
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-xl font-heading">Stop Information</h4>
                <button 
                  onClick={() => setPopupInfo(null)}
                  className="text-zinc-400 hover:text-white"
                  aria-label="Close"
                >
                  <span className="text-lg">×</span>
                </button>
              </div>
              <div className="text-[0.8rem] text-accent">
                <p>
                  <span className="font-semibold">ID:</span> {popupInfo.properties.stop_id}
                </p>
                <p>
                  <span className="font-semibold">Name:</span> {popupInfo.properties.stop_name}
                </p>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-xl font-heading">Route Information</h4>
                <button 
                  onClick={() => setPopupInfo(null)}
                  className="text-zinc-400 hover:text-white"
                  aria-label="Close"
                >
                  <span className="text-lg">×</span>
                </button>
              </div>
              <div className="text-[0.8rem] text-accent">
                <p>
                  <span className="font-semibold">Route ID:</span> {popupInfo.properties.route_id}
                </p>
                <p>
                  <span className="font-semibold">Name:</span> {popupInfo.properties.route_long_name}
                </p>
              </div>
              <p className='mt-2'>
                <span className="font-semibold">Average Ridership By Stop</span>
              </p>
              <RidershipChart 
                routeId={popupInfo.properties.route_id} 
                data={ridershipData || []} 
                width={200}
              />
            </div>
          )}
        </div>
      </div>
    );

// Update this section to handle multi-select mode differently
  const filteredFeatures = data.features.filter(feature => {
    if (feature.geometry.type === 'Point') return true;
    const routeId = feature.properties.route_id;
    if (optimizedRoutes.has(routeId)) return false;
    return true;
  });

  // Modify this section to keep all routes visible in multi-select mode
  const selectedRouteObject = selectedRoute
    ? data.features.find((feature) => feature.properties.route_id === selectedRoute)
    : null;
  
  const filteredData = multiSelectMode
    ? {
        ...data,
        features: filteredFeatures, // Show all routes in multi-select mode
      }
    : (selectedRouteObject
      ? {
          ...data,
          features: data.features.filter(
            (feature) =>
              feature.properties.route_id === selectedRoute ||
              (feature.properties.stop_id &&
                selectedRouteObject.properties.route_stops &&
                selectedRouteObject.properties.route_stops.includes(feature.properties.stop_id))
          ),
        }
      : {
          ...data,
          features: filteredFeatures,
        });
  
  const filteredOptimizedData = 
    // When in multi-select mode, show all optimized routes
    multiSelectMode 
    ? optimizedRoutesData 
    : (
      // In single-select mode, show only the selected route if it exists
      selectedRouteObject && optimizedRoutesData
        ? {
            ...optimizedRoutesData,
            features: optimizedRoutesData.features.filter(
              (feature) =>
                feature.properties.route_id === selectedRoute ||
                (feature.properties.stop_id &&
                  selectedRouteObject.properties.route_stops &&
                  selectedRouteObject.properties.route_stops.includes(feature.properties.stop_id))
            ),
          }
        : optimizedRoutesData
    );

  function getDistance(coord1, coord2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(coord2[1] - coord1[1]);
    const dLon = toRad(coord2[0] - coord1[0]);
    const lat1 = toRad(coord1[1]);
    const lat2 = toRad(coord2[1]);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  useEffect(() => {
    let animationFrames = new window.Map();
    
    // Determine which routes to animate - all selected routes in multi-select mode
    const routesToAnimate = multiSelectMode 
      ? Array.from(effectiveSelectedRoutes) 
      : (selectedRoute ? [selectedRoute] : []);
      
    // Clean up any buses for routes no longer selected
    setBusPositions(prev => {
      const newPositions = new window.Map(prev);
      Array.from(prev.keys()).forEach(routeId => {
        if (!routesToAnimate.includes(routeId)) {
          newPositions.delete(routeId);
        }
      });
      return newPositions;
    });
    
    // Start animation for each route
    routesToAnimate.forEach(routeId => {
      const routeFeature = optimizedRoutes.has(routeId) 
        ? optimizedRoutesData.features.find(
            feature =>
              feature.properties.route_id === routeId &&
              feature.geometry.type === 'LineString'
          )
        : data.features.find(
            feature =>
              feature.properties.route_id === routeId &&
              feature.geometry.type === 'LineString'
          );
          
      if (routeFeature) {
        const routeCoordinates = routeFeature.geometry.coordinates;
        if (routeCoordinates.length < 2) {
          // Skip routes with insufficient coordinates
          return;
        }

        const cumulativeDistances = [];
        let totalDistance = 0;
        const numPoints = routeCoordinates.length;
        for (let i = 0; i < numPoints - 1; i++) {
          cumulativeDistances.push(totalDistance);
          totalDistance += getDistance(routeCoordinates[i], routeCoordinates[i + 1]);
        }
        cumulativeDistances.push(totalDistance);

        const speed = 0.1;
        let travelled = 0;
        let lastTimestamp;

        const animate = (timestamp) => {
          if (!lastTimestamp) lastTimestamp = timestamp;
          const delta = timestamp - lastTimestamp;
          lastTimestamp = timestamp;
          travelled += speed * delta;

          if (travelled >= totalDistance) {
            setBusPositions(prev => {
              const newPositions = new window.Map(prev);
              newPositions.set(routeId, routeCoordinates[0]);
              return newPositions;
            });
            travelled = 0;
            lastTimestamp = timestamp;
            animationFrames.set(routeId, requestAnimationFrame(animate));
            return;
          }

          let segmentIndex = 0;
          while (
            segmentIndex < cumulativeDistances.length - 1 &&
            cumulativeDistances[segmentIndex + 1] <= travelled
          ) {
            segmentIndex++;
          }
          const segmentStart = cumulativeDistances[segmentIndex];
          const segmentEnd = cumulativeDistances[segmentIndex + 1];
          const segmentDistance = segmentEnd - segmentStart;
          const segmentProgress = (travelled - segmentStart) / segmentDistance;

          const currentPos = routeCoordinates[segmentIndex];
          const nextPos = routeCoordinates[segmentIndex + 1];
          const interpolatedPosition = [
            currentPos[0] + segmentProgress * (nextPos[0] - currentPos[0]),
            currentPos[1] + segmentProgress * (nextPos[1] - currentPos[1]),
          ];

          // Update this route's bus position
          setBusPositions(prev => {
            const newPositions = new window.Map(prev);
            newPositions.set(routeId, interpolatedPosition);
            return newPositions;
          });
          
          animationFrames.set(routeId, requestAnimationFrame(animate));
        };

        animationFrames.set(routeId, requestAnimationFrame(animate));
      }
    });

    return () => {
      // Cancel all animation frames when cleaning up
      animationFrames.forEach(frameId => cancelAnimationFrame(frameId));
    };
  }, [effectiveSelectedRoutes, selectedRoute, multiSelectMode, data, optimizedRoutes, optimizedRoutesData]);

  useEffect(() => {
    fetchPopulationData();
  }, []);

  // Add this effect to handle banner display and collapse
  useEffect(() => {
    // Clear any existing timeouts
    if (bannerTimeout.current) {
      clearTimeout(bannerTimeout.current);
    }
    
    if (selectedRoute && optimizedRoutes.has(selectedRoute)) {
      setShowOptimizedBanner(true);
      setCollapsedBanner(false);
      
      // After 3 seconds, collapse the banner
      bannerTimeout.current = setTimeout(() => {
        setCollapsedBanner(true);
      }, 3000);
    } else {
      setShowOptimizedBanner(false);
    }
    
    return () => {
      if (bannerTimeout.current) {
        clearTimeout(bannerTimeout.current);
      }
    };
  }, [selectedRoute, optimizedRoutes]);

  const finalBusModelMatrix = new Matrix4().rotateX(Math.PI / 2).scale(busScale);

  const layers = [
    // Split into two layers - one for points (stops) and one for lines (routes)
    new GeoJsonLayer({
      id: 'stops-layer',
      data: filteredData,
      stroked: true,
      filled: true,
      getFillColor: [200, 0, 80, 180],
      pointRadiusMinPixels: 2,
      getRadius: 10,
      pickable: true,
      autoHighlight: true,
      onClick,
      beforeId: 'watername_ocean',
      parameters: {
        depthTest: mapStyle === STYLE_3D,
        depthMask: true
      },
      // Only render Point geometries
      getFilterValue: (feature) => (feature.geometry.type === 'Point' ? 1 : 0),
      filterRange: [0.9, 1] // Strict filter threshold
    }),
    
    // Route lines layer - update the getLineColor function to highlight selected routes
    new GeoJsonLayer({
      id: `routes-layer-${useRandomColors ? 'random' : 'default'}`,
      data: filteredData,
      stroked: true,
      filled: false,
      getLineColor: d => {
        const routeId = d.properties.route_id;
        
        // In multi-select mode, highlight selected routes
        if (multiSelectMode && effectiveSelectedRoutes.has(routeId)) {
          return [30, 144, 255, 220]; // Blue for selected routes in multi-select (changed from orange)
        }
        
        // Otherwise use normal coloring logic
        if (useRandomColors) {
          return routeColorMap[routeId] || [200, 0, 80, 180]; // Random or fallback color
        }
        
        // Default color
        return [200, 0, 80, 180];
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
        depthTest: mapStyle === STYLE_3D,
        depthMask: true
      },
      visible: !show3DRoutes,
      getFilterValue: (feature) => (feature.geometry.type === 'LineString' ? 1 : 0),
      filterRange: [0.9, 1]
    }),
    
    // Add the optimized routes layers
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
        depthTest: mapStyle === STYLE_3D,
        depthMask: true
      },
      visible: !show3DRoutes, // Hide when in 3D mode
      // Only render LineString geometries
      getFilterValue: (feature) => (feature.geometry.type === 'LineString' ? 1 : 0),
      filterRange: [0.9, 1]
    }),
  ];

  // Update the bus layer section
  if (busPositions.size > 0) {
    // Create a bus for each selected route
    Array.from(busPositions.entries()).forEach(([routeId, position]) => {
      // Determine bus height when in 3D mode
      let busHeight = 0;
      
      if (show3DRoutes) {
        // Find the layer index of the route
        const routeIndex = data.features
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
          getColor: [255, 255, 0, 240],
          pickable: false,
        })
      );
    });
  }

  if (show3DRoutes) {
    // Get all routes when in multi-select mode, not just filtered ones
    const routesToShow = multiSelectMode 
      ? data.features.filter(feature => 
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
        onClick: (info) => {
          if (info && info.object) {
            const routeId = feature.properties.route_id;
            setSelectedRoute((prevSelectedRoute) =>
              prevSelectedRoute === routeId ? null : routeId
            );
            
            // Fetch ridership data
            fetchRidershipData(routeId);
            
            setPopupInfo({
              coordinates: info.coordinate,
              properties: feature.properties,
              type: 'LineString'
            });
          }
        }
      });
    });
    
    layers.push(...routeLayers);
  }

  if (showPopulationHeatmap) {
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

  const toggleRandomColors = () => {
    // Remove the if (!useRandomColors) condition
    // Always generate random colors when this function is called
    const newColorMap = {};
    filteredData.features
      .filter(feature => feature.geometry.type === 'LineString')
      .forEach(feature => {
        const routeId = feature.properties.route_id;
        // Generate vibrant, distinguishable colors
        newColorMap[routeId] = [
          Math.floor(Math.random() * 156) + 100, // R: 100-255
          Math.floor(Math.random() * 156) + 100, // G: 100-255
          Math.floor(Math.random() * 156) + 100, // B: 100-255
          180 // Alpha
        ];
      });
    setRouteColorMap(newColorMap);
  };

  useEffect(() => {
    if (useRandomColors) {
      toggleRandomColors();
    }
  }, [useRandomColors]);

  const togglePanel = () => {
    setPanelOpen(!panelOpen);
  };

  // Update renderPanel to include multi-select toggle
  const renderPanel = () => {
    if (!panelOpen) return null;
    return (
      <div className="absolute bottom-12 right-0 w-72 bg-zinc-900/60 backdrop-blur-md text-white rounded-l-md shadow-lg p-4 z-10 transition-all duration-300">
        <h3 className="font-heading text-lg font-semibold pb-4">Route Optimization</h3>
        
        {/* Always show the optimized routes counter box */}
        <div className="mb-3 py-2 px-3 bg-zinc-800/70 rounded-md flex justify-between items-center">
          <span className="text-sm">
            {optimizedRoutes.size > 0 
              ? `${optimizedRoutes.size} optimized route${optimizedRoutes.size !== 1 ? 's' : ''}`
              : "No optimized routes"
            }
          </span>
          {optimizedRoutes.size > 0 && (
            <button 
              onClick={() => resetOptimization()}
              className="text-xs bg-zinc-700 hover:bg-zinc-600 px-2 py-1 rounded"
            >
              Reset All
            </button>
          )}
        </div>
        
        {/* Multi-Route Selection Toggle */}
        <div className="mb-3 py-2 px-3 bg-zinc-800/70 rounded-md flex justify-between items-center">
          <span className="text-sm">Multi-Route Selection</span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              checked={multiSelectMode} 
              onChange={() => setMultiSelectMode(!multiSelectMode)} 
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent"></div>
          </label>
        </div>
        
        {/* Live Optimization Toggle */}
        <div className="mb-3 py-2 px-3 bg-zinc-800/70 rounded-md flex justify-between items-center">
          <span className="text-sm">Live Optimization</span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              checked={useLiveOptimization} 
              onChange={() => setUseLiveOptimization(!useLiveOptimization)} 
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent"></div>
          </label>
        </div>
        
        {/* Optimize Button - Updated for multi-route selection */}
        <div className="mb-3">
          <button
            onClick={() => {
              if (multiSelectMode && effectiveSelectedRoutes.size > 0) {
                // Optimize all selected routes
                onOptimize(Array.from(effectiveSelectedRoutes));
              } else if (selectedRoute) {
                // Optimize single route
                onOptimize();
              }
            }}
            disabled={
              (multiSelectMode && effectiveSelectedRoutes.size === 0) || 
              (!multiSelectMode && !selectedRoute) || 
              isOptimizing
            }
            className={`w-full py-2 px-4 rounded flex items-center justify-center gap-2 
              ${(multiSelectMode && effectiveSelectedRoutes.size === 0) || (!multiSelectMode && !selectedRoute) || isOptimizing
                ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed' 
                : 'bg-accent hover:bg-accent/90 text-white'}`}
          >
            {isOptimizing ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Optimizing...
              </>
            ) : (
              <>
                <img src="/assets/icons/speed.png" alt="Speed" className="w-5 h-5" />
                Optimize {multiSelectMode && effectiveSelectedRoutes.size > 0 ? `(${effectiveSelectedRoutes.size} routes)` : ''}
              </>
            )}
          </button>
        </div>
        
        {/* New Configure Parameters Button */}
        <div className="mt-5 pt-3 border-t border-zinc-700">
          <button
            onClick={() => setShowParametersPopup(true)}
            className="w-full py-2 px-4 rounded flex items-center justify-center gap-2 bg-zinc-700 hover:bg-zinc-600 text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
            Configure Parameters
          </button>
        </div>
      </div>
    );
  };

  // Modify the renderOptimizedBanner function
  const renderOptimizedBanner = () => {
    if (!showOptimizedBanner) return null;
    
    return (
      <div 
        className={`fixed top-4 left-[calc(20%+16px)] z-30 flex items-center transition-all duration-300 ease-in-out ${
          collapsedBanner && !bannerHovered
            ? 'bg-green-600 rounded-full w-8 h-8 overflow-hidden shadow-lg shadow-green-800/20' 
            : 'bg-green-800/90 backdrop-blur-sm rounded-lg shadow-lg pr-4 pl-3 py-2'
        }`}
        onMouseEnter={() => setBannerHovered(true)}
        onMouseLeave={() => setBannerHovered(false)}
      >
        {collapsedBanner && !bannerHovered ? (
          <div className="flex items-center justify-center w-full h-full text-white">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="bg-green-500 rounded-full p-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-white" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <span className="text-white text-sm font-medium">Viewing optimized route</span>
              <span className="text-white/70 text-xs ml-2">Route {selectedRoute}</span>
            </div>
          </div>
        )}
      </div>
    );
  };
  
  const renderParametersPopup = () => {
    if (!showParametersPopup) return null;
    
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="bg-zinc-900/60 backdrop-blur-md text-white w-[600px] max-w-[90vw] rounded-lg shadow-xl border border-zinc-700">
          <div className="flex items-center justify-between border-b border-zinc-800/70 px-6 py-4">
            <h3 className="text-xl font-heading">Optimization Parameters</h3>
            <button 
              onClick={() => setShowParametersPopup(false)} 
              className="text-zinc-400 hover:text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div className="p-6">
            {/* Placeholder content - this will be filled in later */}
            <p className="text-zinc-300">Parameter configuration options will appear here.</p>
          </div>
          
          <div className="border-t border-zinc-800/70 px-6 py-4 flex justify-end">
            <button 
              onClick={() => setShowParametersPopup(false)}
              className="bg-zinc-700/80 hover:bg-zinc-600 text-white py-2 px-4 rounded mr-2"
            >
              Cancel
            </button>
            <button 
              className="bg-accent hover:bg-accent/90 text-white py-2 px-4 rounded"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <Map
        ref={mapRef}
        initialViewState={INITIAL_VIEW_STATE}
        mapStyle={mapStyle}
        onLoad={handleMapLoad}
      >
        <DeckGLOverlay layers={layers} />
        <NavigationControl position="top-right" />
        {renderFixedInfoPanel()}
        {renderOptimizedBanner()}
        
        <button
          className={`absolute bottom-12 ${panelOpen ? 'right-72' : 'right-0'} w-8 h-12 bg-zinc-900/60 backdrop-blur-md text-white flex items-center justify-center rounded-l-md z-20 hover:bg-accent/80 hover:text-white focus:outline-none transition-all duration-300`}
          onClick={togglePanel}
          aria-label={panelOpen ? "Close panel" : "Open panel"}
        >
          {panelOpen ? '>' : '<'}
        </button>
        
        {renderPanel()}
      </Map>
      
      {/* Add the parameters popup */}
      {renderParametersPopup()}
    </>
  );
}

export default TransitMap;
