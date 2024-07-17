"use client"
import { useState, useEffect, useRef } from 'react';
import { Map, NavigationControl, Popup, useControl } from 'react-map-gl/maplibre';
import { GeoJsonLayer } from 'deck.gl';
import { MapboxOverlay as DeckOverlay } from '@deck.gl/mapbox';
import 'maplibre-gl/dist/maplibre-gl.css';

const INITIAL_VIEW_STATE = {
  latitude: 43.647667,
  longitude: -79.385611,
  zoom: 12,
  bearing: 0,
};

const MAP_STYLE = "/styles/dark_matter.json";

function DeckGLOverlay(props) {
  const overlay = useControl(() => new DeckOverlay(props));
  overlay.setProps(props);
  return null;
}

function MapView() {
  const [popupInfo, setPopupInfo] = useState(null);
  const [data, setData] = useState(null);
  const mapRef = useRef(null); // Reference to store the map instance

  useEffect(() => {
    // Fetch GeoJSON data asynchronously
    const fetchData = async () => {
      const response = await fetch('/data.geojson');
      const json = await response.json();
      setData(json);
    };
    fetchData();
  }, []);

  // Effect to initialize map after data is loaded
  useEffect(() => {
    if (!data) return; // Wait until data is fetched

    const map = mapRef.current.getMap(); // Access the MapLibre GL JS map instance

    // Run initialization code after data is loaded
    map.once('data', () => {
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
    });
  }, [data]); // Trigger when data changes

  const onClick = (info) => {
    if (info && info.object) {
      setPopupInfo({
        coordinates: info.coordinate,
        properties: info.object.properties
      });
    }
  };

  const renderPopup = () => (
      popupInfo && (
          <Popup
              tipSize={5}
              anchor="top"
              longitude={popupInfo.coordinates[0]}
              latitude={popupInfo.coordinates[1]}
              closeOnClick={false}
              onClose={() => setPopupInfo(null)}
              style={{ zIndex: 10 }}
          >
            <div>
              <h4>Route Information</h4>
              <p>{JSON.stringify(popupInfo.properties)}</p>
            </div>
          </Popup>
      )
  );

  const layers = [
    new GeoJsonLayer({
      id: 'data',
      data,
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
      beforeId: 'watername_ocean' // In interleaved mode, render the layer under map labels
    })
  ];

  return (
      <Map
          ref={mapRef} // Assign the map instance to ref
          initialViewState={INITIAL_VIEW_STATE}
          mapStyle={MAP_STYLE}
      >
        <DeckGLOverlay layers={layers} />
        <NavigationControl position="top-right" />
        {renderPopup()}
      </Map>
  );
}

export default MapView;
