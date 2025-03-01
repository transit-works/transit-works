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

const INITIAL_VIEW_STATE = {
  latitude: 43.647667,
  longitude: -79.385611,
  zoom: 12,
  bearing: 0,
};

const MAP_STYLE = '/styles/dark_matter.json';

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
  bottomCap: true
});

const busScale = [8, 4, 8];

function TransitMap({ data, selectedRoute, setSelectedRoute }) {
  const [popupInfo, setPopupInfo] = useState(null);
  const [busPosition, setBusPosition] = useState(null);
  const mapRef = useRef(null);

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

  // Toggle route selection when clicking on any non-Point feature.
  const onClick = (info) => {
    if (info && info.object) {
      const { type } = info.object.geometry;
      if (type !== 'Point') {
        setSelectedRoute((prevSelectedRoute) =>
          prevSelectedRoute === info.object.properties.route_id
            ? null
            : info.object.properties.route_id
        );
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
        <div>
          <p className="text-wrap text-background">
            {popupInfo.type === 'Point' ? (
              <div>
                <h4 className="text-center text-2xl text-background">Stop Information</h4>
                <p>
                  <b>ID:</b> {popupInfo.properties.stop_id}
                </p>
                <p>
                  <b>Name: </b>
                  {popupInfo.properties.stop_name}
                </p>
              </div>
            ) : (
              <div>
                <h4 className="text-center text-2xl text-background">Route Information</h4>
                <p>
                  <b>Route ID: </b>
                  {popupInfo.properties.route_id}
                </p>
                <p>
                  <b>Name: </b>
                  {popupInfo.properties.route_long_name}
                </p>
                <p>
                  <b>Route type: </b>
                  {popupInfo.properties.route_type}
                </p>
              </div>
            )}
          </p>
        </div>
      </Popup>
    );

  // Filter the data so that when a route is selected, we display its route and stops.
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

  // Get distance between two coordinates
  function getDistance(coord1, coord2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 6371000; // Earth's radius in meters
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

  // Animate the bus along the route using constant speed interpolation.
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

        // Precompute cumulative distances along the route (for consecutive points only).
        const cumulativeDistances = [];
        let totalDistance = 0;
        const numPoints = routeCoordinates.length;
        for (let i = 0; i < numPoints - 1; i++) {
          cumulativeDistances.push(totalDistance);
          totalDistance += getDistance(routeCoordinates[i], routeCoordinates[i + 1]);
        }
        cumulativeDistances.push(totalDistance);

        const speed = 0.1; // meters per millisecond
        let travelled = 0;
        let lastTimestamp;

        const animate = (timestamp) => {
          if (!lastTimestamp) lastTimestamp = timestamp;
          const delta = timestamp - lastTimestamp;
          lastTimestamp = timestamp;
          travelled += speed * delta;

          if (travelled >= totalDistance) {
            // Finished traversing route: reset to starting position and restart animation.
            setBusPosition(routeCoordinates[0]);
            travelled = 0;
            lastTimestamp = timestamp;
            animationFrame = requestAnimationFrame(animate);
            return;
          }

          // Find the segment where the travelled distance falls.
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
    new GeoJsonLayer({
      id: 'data',
      data: filteredData,
      stroked: true,
      filled: true,
      getLineColor: [200, 0, 80, 180],
      getLineWidth: 2,
      lineWidthMinPixels: 2,
      lineWidthScale: 10,
      getFillColor: [200, 0, 80, 180],
      pointRadiusMinPixels: 2,
      getRadius: 10,
      pickable: true,
      autoHighlight: true,
      onClick,
      beforeId: 'watername_ocean',
    }),
  ];

  // Render the bus as a 3D mesh using meter offsets.
  if (busPosition) {
    layers.push(
      new SimpleMeshLayer({
        id: 'bus',
        data: [{}], // dummy data; the mesh is drawn at the origin of the offset coordinate system
        getPosition: () => [0, 0, 0],
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

  return (
    <Map
      ref={mapRef}
      initialViewState={INITIAL_VIEW_STATE}
      mapStyle={MAP_STYLE}
      onLoad={handleMapLoad}
    >
      <DeckGLOverlay layers={layers} />
      <NavigationControl position="top-right" />
      {renderPopup()}
    </Map>
  );
}

export default TransitMap;
