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

function TransitMap({ data, selectedRoute, setSelectedRoute, isOptimized, optimizedRoutes, resetOptimization }) {
  const [popupInfo, setPopupInfo] = useState(null);
  const [busPosition, setBusPosition] = useState(null);
  const [mapStyle, setMapStyle] = useState(STYLE_REGULAR);
  const [panelOpen, setPanelOpen] = useState(true);
  const [showBusRoutes, setShowBusRoutes] = useState(true);
  const [show3DRoutes, setShow3DRoutes] = useState(false);
  const [useRandomColors, setUseRandomColors] = useState(false);
  const [routeColorMap, setRouteColorMap] = useState({});
  const [ridershipData, setRidershipData] = useState(null);
  const mapRef = useRef(null);

  const fetchRidershipData = async (routeId) => {
    try {
      //TODO: Replace with backend call
      const response = await fetch('/default.json');
      const data = await response.json();
      setRidershipData(data);
    } catch (error) {
      console.error('Error fetching ridership data:', error);
      setRidershipData(null);
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

  const renderPopup = () =>
    popupInfo && (
      <Popup
        tipSize={3}
        anchor="top"
        longitude={popupInfo.coordinates[0]}
        latitude={popupInfo.coordinates[1]}
        closeOnClick={false}
        onClose={() => setPopupInfo(null)}
        style={{ zIndex: 10 }}
      >
        <div className="p-2">
          {popupInfo.type === 'Point' ? (
            <div>
              <h4 className="text-center text-xl font-heading mb-2">Stop Information</h4>
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
            <div className="w-60">
              <h4 className="text-center text-xl font-heading mb-2 mr-6">Route Information</h4>
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
      </Popup>
    );

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
    : data;

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
      const routeFeature = data.features.find(
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
        
        // Check if this route has been optimized (is in optimizedRoutes)
        if (optimizedRoutes && optimizedRoutes.has(routeId)) {
          return [46, 204, 113, 200]; // Green color for optimized routes
        }
        
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
    })
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

  const renderPanel = () => {
    if (!panelOpen) return null;
    return (
      <div className="absolute bottom-12 right-0 w-72 bg-zinc-900/60 backdrop-blur-md text-white rounded-l-md shadow-lg p-4 z-10 transition-all duration-300">
        <h3 className="font-heading text-lg font-semibold pb-4">Map Options</h3>
        
        {/* Show optimized route indicator without reset button */}
        {isOptimized && selectedRoute && optimizedRoutes.has(selectedRoute) && (
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
        
        <div className="flex flex-col gap-2">
          <div className="flex flex-row">
            <div className="relative w-1/2 mx-1 group">
              <button
                className={`w-full h-10 ${mapStyle === STYLE_3D ? 'bg-primary' : 'bg-zinc-900'} hover:bg-white hover:text-black backdrop-blur-sm text-white rounded-full flex items-center px-2 py-1 font-medium text-[0.8rem] justify-center focus:outline-none border border-zinc-600`}
                onClick={toggleMapStyle}
                aria-label="Toggle map style"
              >
                {mapStyle === STYLE_3D ? '3D Buildings' : '2D Buildings'}
              </button>
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-max px-2 py-1 bg-black/70 backdrop-blur-sm text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200">
                Toggle Between 3D and 2D buildings
              </div>
            </div>
            
            <div className="relative w-1/2 mx-1 group">
              <button
                className={`w-full h-10 ${show3DRoutes ? 'bg-primary' : 'bg-zinc-900'} hover:bg-white hover:text-black backdrop-blur-sm text-white rounded-full flex items-center px-2 py-1 font-medium text-[0.8rem] justify-center focus:outline-none border border-zinc-600`}
                onClick={toggle3DRoutes}
                aria-label="Toggle route visualization"
              >
                {show3DRoutes ? 'Layered Routes' : 'Flat Routes'}
              </button>
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-max px-2 py-1 bg-black/70 backdrop-blur-sm text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200">
                Toggle between flat and layered route visualization
              </div>
            </div>
          </div>
          
          <div className="flex flex-row">
            <div className="relative w-full mx-1 group">
              <button
                className={`w-full h-10 ${useRandomColors ? 'bg-accent' : 'bg-zinc-900'} hover:bg-white hover:text-black backdrop-blur-sm text-white rounded-full flex items-center px-2 py-1 font-medium text-[0.8rem] justify-center focus:outline-none border border-zinc-600`}
                onClick={toggleRandomColors}
                aria-label="Toggle random route colors"
              >
                {useRandomColors ? 'Random Colors' : 'Gradient Colors'}
              </button>
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-max px-2 py-1 bg-black/70 backdrop-blur-sm text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200">
                Toggle between random and gradient route colors
              </div>
            </div>
          </div>
        </div>
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
      {renderPopup()}
      
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
