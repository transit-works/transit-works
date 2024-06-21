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
        style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
        center: [-79.385611, 43.647667],
        zoom: 12,
        maxZoom: 18,
      });

      // add data
      map.on('load', () => {
        map.addSource('lines', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: {
                  color: '#ff536b'
                },
                geometry: {
                  type: 'LineString',
                  coordinates: [
                    [-79.365532, 43.645133],
                    [-79.376856, 43.641191],
                    [-79.377455, 43.642114],
                    [-79.380692, 43.640982],
                    [-79.382308, 43.644929]
                  ]
                }
              }
            ]
          }
        });

        // Add layer
        map.addLayer({
          id: 'lines',
          type: 'line',
          source: 'lines',
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
          paint: {
            'line-color': ['get', 'color'], // Get color from data
            'line-width': 2,
          },
        });
      });

      // Clean up on unmount
      return () => map.remove();
    }
    return null;
  }, []);

  return <div ref={mapContainerRef} style={{ width: '100%', height: '650px' }} />;
}

export default Map;

