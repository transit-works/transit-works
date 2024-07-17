"use client";

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

function Map() {
  const mapContainerRef = useRef(null);

  useEffect(() => {
    if (mapContainerRef.current) {
      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: '/styles/dark_matter.json',
        center: [-79.385611, 43.647667],
        zoom: 12,
        maxZoom: 18,
      });

      // add data
      map.on('load', async () => {
        const response = await fetch('/data.geojson');
        const geojsonData = await response.json();

        map.addSource('data', {
          type: 'geojson',
          data: geojsonData,
        });

        map.addLayer({
          id: 'lines-layer',
          type: 'line',
          source: 'data',
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
          paint: {
            'line-color': '#55ff63', // Line color (red)
            'line-width': 1, // Line width
          },
        });

        // Add layer
        map.addLayer({
          id: 'stops-layer',
          type: 'circle',
          source: 'data',
          filter: ['==', '$type', 'Point'], // Filter to show only Point features
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              7,
              0.5,
              12, // Zoom level where the points start becoming visible
              1, // Circle radius at zoom level 12 (smaller)
              17, // Zoom level where the points are fully visible
              5, // Circle radius at zoom level 17 (larger)
            ],
            'circle-color': '#55ff63', // Circle color (e.g., green)
            'circle-stroke-width': 0, // Border width
            'circle-stroke-color': '#ffffff' // Border color (e.g., white)
          },
        });
      });

      map.on('click', 'stops-layer', (e) => {
        const {features} = e;

        if (!features.length) {
          return;
        }

        const feature = features[0];

        // Create a popup
        const data_popup = new maplibregl.Popup()
            .setLngLat(feature.geometry.coordinates)
            .setHTML(`<strong>Stop Properties:</strong><br>${JSON.stringify(feature.properties, null, 2)}`)
            .addTo(map);
      });

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


      // Clean up on unmount
      return () => map.remove();
    }
    return null;
  }, []);

  return <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />;
}

export default Map;

