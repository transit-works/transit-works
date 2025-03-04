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
import { FaBuilding, FaLayerGroup, FaPalette, FaFireAlt } from 'react-icons/fa';

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
  selectedRoute, 
  setSelectedRoute, 
  optimizedRoutesData,
  optimizedRoutes, 
  resetOptimization,
  useLiveOptimization,
  setUseLiveOptimization,
  isOptimizing,
  optimizationProgress,
  currentEvaluation,
  // Add onOptimize prop
  onOptimize,
  optimizationError
}) {
  const [popupInfo, setPopupInfo] = useState(null);
  const [busPosition, setBusPosition] = useState(null);
  const [mapStyle, setMapStyle] = useState(STYLE_REGULAR);
  const [panelOpen, setPanelOpen] = useState(true);
  const [showBusRoutes, setShowBusRoutes] = useState(true);
  const [show3DRoutes, setShow3DRoutes] = useState(false);
  const [useRandomColors, setUseRandomColors] = useState(false);
  const [routeColorMap, setRouteColorMap] = useState({});
  const [ridershipData, setRidershipData] = useState(null);
  const [showPopulationHeatmap, setShowPopulationHeatmap] = useState(false);
  const [populationData, setPopulationData] = useState(null);
  const mapRef = useRef(null);

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

  const onClick = (info) => {
    if (info && info.object) {
      const { type } = info.object.geometry;
      if (type !== 'Point') {
        const routeId = info.object.properties.route_id;
        setSelectedRoute((prevSelectedRoute) =>
          prevSelectedRoute === routeId ? null : routeId
        );
        
        // Fetch ridership data when a route is selected
        fetchRidershipData(routeId);
      }
      setPopupInfo({
        coordinates: info.coordinate,
        properties: info.object.properties,
        type,
      });
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

  const filteredFeatures = data.features.filter(feature => {
    if (feature.geometry.type === 'Point') return true;
    const routeId = feature.properties.route_id;
    if (optimizedRoutes.has(routeId)) return false;
    return true;
  });

  const selectedRouteObject = selectedRoute
    ? data.features.find((feature) => feature.properties.route_id === selectedRoute)
    : null;
  const filteredData = selectedRouteObject
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
      };
  
  const filteredOptimizedData = selectedRouteObject && optimizedRoutesData
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
    : optimizedRoutesData;

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
    let animationFrame;
    if (selectedRoute) {
      const routeFeature = optimizedRoutes.has(selectedRoute) 
        ? optimizedRoutesData.features.find(
            (feature) =>
              feature.properties.route_id === selectedRoute &&
              feature.geometry.type === 'LineString'
          )
        : data.features.find(
            (feature) =>
              feature.properties.route_id === selectedRoute &&
              feature.geometry.type === 'LineString'
          );
      if (routeFeature) {
        const routeCoordinates = routeFeature.geometry.coordinates;
        if (routeCoordinates.length < 2) {
          setBusPosition(null);
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
            setBusPosition(routeCoordinates[0]);
            travelled = 0;
            lastTimestamp = timestamp;
            animationFrame = requestAnimationFrame(animate);
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

          setBusPosition(interpolatedPosition);
          animationFrame = requestAnimationFrame(animate);
        };

        animationFrame = requestAnimationFrame(animate);
      }
    } else {
      setBusPosition(null);
    }
    return () => cancelAnimationFrame(animationFrame);
  }, [selectedRoute, data]);

  useEffect(() => {
    fetchPopulationData();
  }, []);

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
    
    // Route lines layer - will be hidden in 3D mode
    new GeoJsonLayer({
      id: `routes-layer-${useRandomColors ? 'random' : 'default'}`, // Add changing key to force re-render
      data: filteredData,
      stroked: true,
      filled: false,
      getLineColor: d => {
        const routeId = d.properties.route_id;
        if (useRandomColors) {
          // Use the pre-generated random color for this route
          return routeColorMap[routeId] || [200, 0, 80, 180]; // Fallback color
        }
        // Default color if random colors not enabled
        return [200, 0, 80, 180];
      },
      getLineWidth: 2,
      lineWidthMinPixels: 2,
      lineWidthScale: 10,
      pickable: true,
      autoHighlight: true,
      onClick, // Ensure onClick is properly attached
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

  if (busPosition) {
    // Determine bus height when in 3D mode
    let busHeight = 0;
    
    if (show3DRoutes && selectedRoute) {
      // Find the layer index of the selected route
      const selectedRouteIndex = filteredData.features
        .filter(feature => feature.geometry.type === 'LineString')
        .findIndex(feature => feature.properties.route_id === selectedRoute);
        
      if (selectedRouteIndex !== -1) {
        // Use the same height calculation as for the route layers
        busHeight = (selectedRouteIndex % 10) * 250;
      }
    }
    
    layers.push(
      new SimpleMeshLayer({
        id: 'bus',
        data: [{ position: [0, 0, busHeight] }], // Apply height here
        getPosition: d => d.position,
        coordinateSystem: COORDINATE_SYSTEM.METER_OFFSETS,
        coordinateOrigin: busPosition,
        mesh: busMesh,
        sizeScale: 8,
        modelMatrix: finalBusModelMatrix,
        getColor: [255, 255, 0, 240],
        pickable: false,
      })
    );
  }

  if (show3DRoutes) {
    // Get the same routes that would be shown in the GeoJsonLayer
    const routesToShow = filteredData.features.filter(feature => 
      feature.geometry.type === 'LineString'
    );
    
    // Define start and end colors for gradient
    const startColor = "#CC0050";
    const endColor = "#ffa826";
    
    const routeLayers = routesToShow.map((feature, index) => {
      const layerIndex = index % 10;
      const height = layerIndex * 250; // Height based on layer
      const routeId = feature.properties.route_id;
      
      // Determine color based on current mode
      let color;
      // Check if this route has been optimized (is in optimizedRoutes)
      if (optimizedRoutes && optimizedRoutes.has(routeId)) {
        color = [46, 204, 113, 200]; // Green color for optimized route
      } else if (useRandomColors) {
        // Use the pre-generated random color for this route
        color = routeColorMap[routeId] || [200, 0, 80, 180]; // Fallback color
      } else {
        // Use the original gradient logic
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

  const toggleMapStyle = () => {
    setMapStyle((prevStyle) => (prevStyle === STYLE_3D ? STYLE_REGULAR : STYLE_3D));
  };

  const toggleBusRoutes = () => {
    setShowBusRoutes(!showBusRoutes);
  };

  const toggle3DRoutes = () => {
    setShow3DRoutes(!show3DRoutes);
  };

  const toggleRandomColors = () => {
    if (!useRandomColors) {
      // Generate random colors for all routes when enabling
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
    }
    setUseRandomColors(!useRandomColors);
  };

  const togglePanel = () => {
    setPanelOpen(!panelOpen);
  };

  const togglePopulationHeatmap = () => {
    setShowPopulationHeatmap(!showPopulationHeatmap);
  };

  const renderPanel = () => {
    if (!panelOpen) return null;
    return (
      <div className="absolute bottom-12 right-0 w-72 bg-zinc-900/60 backdrop-blur-md text-white rounded-l-md shadow-lg p-4 z-10 transition-all duration-300">
        <h3 className="font-heading text-lg font-semibold pb-4">Route Optimization</h3>
        
        {/* Show optimized route indicator without reset button */}
        {selectedRoute && optimizedRoutes.has(selectedRoute) && (
          <div className="mb-3 py-2 px-3 bg-green-800/70 rounded-md">
            <span className="text-sm">Viewing optimized route</span>
          </div>
        )}
        
        {/* Add Reset All Optimizations button if there are any optimized routes */}
        {optimizedRoutes && optimizedRoutes.size > 0 && (
          <div className="mb-3 py-2 px-3 bg-zinc-800/70 rounded-md flex justify-between items-center">
            <span className="text-sm">{optimizedRoutes.size} optimized route{optimizedRoutes.size !== 1 ? 's' : ''}</span>
            <button 
              onClick={() => resetOptimization()}
              className="text-xs bg-zinc-700 hover:bg-zinc-600 px-2 py-1 rounded"
            >
              Reset All
            </button>
          </div>
        )}
        
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
        
        {/* Add Optimize Button */}
        <div className="mb-3">
          <button
            onClick={onOptimize}
            disabled={!selectedRoute || isOptimizing}
            className={`w-full py-2 px-4 rounded flex items-center justify-center gap-2 
              ${!selectedRoute || isOptimizing 
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
                Optimize
              </>
            )}
          </button>
        </div>
        
        {/* Show error message if optimization failed */}
        {optimizationError && (
          <div className="mb-3 text-xs text-red-500 text-center">
            {optimizationError}
          </div>
        )}
        
        {/* Optimization Progress Bar - Only show when optimizing */}
        {isOptimizing && useLiveOptimization && (
          <div className="mb-3">
            <div className="w-full bg-gray-700 rounded-full h-2.5 mb-1">
              <div 
                className="bg-accent h-2.5 rounded-full" 
                style={{ width: `${optimizationProgress}%` }}
              ></div>
            </div>
            {currentEvaluation && (
              <div className="text-xs text-right text-white/80">
                Score: {currentEvaluation.toFixed(2)}
              </div>
            )}
          </div>
        )}
        
      </div>
    );
  };

  return (
    <Map
      ref={mapRef}
      initialViewState={INITIAL_VIEW_STATE}
      mapStyle={mapStyle}
      onLoad={handleMapLoad}
    >
      <DeckGLOverlay layers={layers} />
      <NavigationControl position="top-right" />
      {renderFixedInfoPanel()}
      
      <button
        className={`absolute bottom-12 ${panelOpen ? 'right-72' : 'right-0'} w-8 h-12 bg-zinc-900/60 backdrop-blur-md text-white flex items-center justify-center rounded-l-md z-20 hover:bg-accent/80 hover:text-white focus:outline-none transition-all duration-300`}
        onClick={togglePanel}
        aria-label={panelOpen ? "Close panel" : "Open panel"}
      >
        {panelOpen ? '>' : '<'}
      </button>
      
      {renderPanel()}
    </Map>
  );
}

export default TransitMap;
