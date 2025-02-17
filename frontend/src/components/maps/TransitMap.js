'use client';

import { useState, useRef, useEffect } from 'react';
import { Map, NavigationControl, Popup, useControl } from 'react-map-gl/maplibre';
import { GeoJsonLayer } from 'deck.gl';
import { MapboxOverlay as DeckOverlay } from '@deck.gl/mapbox';
import 'maplibre-gl/dist/maplibre-gl.css';
import './Map.css';

const INITIAL_VIEW_STATE = {
  latitude: 43.647667,
  longitude: -79.385611,
  zoom: 12,
  bearing: 0,
};

const MAP_STYLE = '/styles/dark_matter.json';

function DeckGLOverlay(props) {
  const overlay = useControl(() => new DeckOverlay(props));
  overlay.setProps(props);
  return null;
}

function TransitMap({ data, selectedRoute, setSelectedRoute }) {
  const [popupInfo, setPopupInfo] = useState(null);
  const mapRef = useRef(null); // Reference to store the map instance

  const handleMapLoad = () => {
    const map = mapRef.current.getMap(); // Access the MapLibre GL JS map instance

    // Run initialization code after data is loaded
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
        setSelectedRoute((prevSelectedRoute) =>
          prevSelectedRoute === info.object.properties.route_id
            ? null
            : info.object.properties.route_id,
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

  // Display the selectedd route and its stops
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
              selectedRouteObject.properties.route_stops.includes(feature.properties.stop_id)),
        ),
      }
    : data;

  const layers = [
    new GeoJsonLayer({
      id: 'data',
      data: filteredData,
      // Styles
      stroked: true,
      filled: true,
      getLineColor: [200, 0, 80, 180],
      getLineWidth: 2,
      lineWidthMinPixels: 2,
      lineWidthScale: 10,
      getFillColor: [200, 0, 80, 180],
      pointRadiusMinPixels: 2,
      getRadius: 10,
      // Interactive props
      pickable: true,
      autoHighlight: true,
      onClick,
      beforeId: 'watername_ocean', // In interleaved mode, render the layer under map labels
    }),
  ];

  return (
    <Map
      ref={mapRef} // Assign the map instance to ref
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
