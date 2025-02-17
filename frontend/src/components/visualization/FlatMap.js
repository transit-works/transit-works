import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Mercator } from '@visx/geo';
import * as topojson from 'topojson-client';

export const background = '#060606';

export default function FlatMap({ events = false }) {
  const [world, setWorld] = useState(null);
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  const [selectedCity, setSelectedCity] = useState(null);
  const popupRef = useRef(null);

  const margin = 144;

  const highlightedCountries = useMemo(
    () => [
      'Canada',
      'United States',
      'Singapore',
      'United Kingdom',
      'Spain',
      'Germany',
      'Netherlands',
    ],
    [],
  );

  const colors = {
    brown: '#d1b99e',
    red: '#ca2848',
    grey: '#393939',
    hover: '#090909',
    chipActive: '#ca2848',
    chipDefault: '#393939',
  };

  const cityCoordinates = useMemo(
    () => [
      { name: 'Toronto', coordinates: [-79.3832, 43.6532], country: 'Canada' },
      { name: 'Vancouver', coordinates: [-123.1216, 49.2827], country: 'Canada' },
      { name: 'New York', coordinates: [-74.006, 40.7128], country: 'United States' },
      { name: 'San Francisco', coordinates: [-122.4194, 37.7749], country: 'United States' },
      { name: 'Austin', coordinates: [-97.7431, 30.2672], country: 'United States' },
      { name: 'Singapore', coordinates: [103.8198, 1.3521], country: 'Singapore' },
      { name: 'London', coordinates: [-0.1278, 51.5074], country: 'United Kingdom' },
      { name: 'Berlin', coordinates: [13.405, 52.52], country: 'Germany' },
      { name: 'Amsterdam', coordinates: [4.9041, 52.3676], country: 'Netherlands' },
      { name: 'Madrid', coordinates: [-3.7038, 40.4168], country: 'Spain' },
    ],
    [],
  );

  // Fetch world topology data
  useEffect(() => {
    fetch('/data/world_topo.json')
      .then((response) => response.json())
      .then((topology) => {
        const worldData = topojson.feature(topology, topology.objects.units);
        setWorld(worldData);
      })
      .catch((error) => console.error('Error fetching topology data:', error));
  }, []);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth - margin * 2,
        height: window.innerHeight / 1.2,
      });
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        setSelectedCity(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const { width, height } = dimensions;
  const scale = useMemo(() => (width / 630) * 100, [width]);
  const centerX = useMemo(() => width / 2, [width]);
  const centerY = useMemo(() => (height * 1.2) / 2, [height]);

  const handleCityClick = useCallback((city) => setSelectedCity(city), []);

  if (!world) return <div>Loading map...</div>;

  return (
    <div className="flex flex-col items-center">
      {/* Chips */}
      <div className="mb-4 flex flex-wrap justify-center gap-2 px-6">
        {cityCoordinates.map((city) => (
          <button
            key={city.name}
            onClick={() => handleCityClick(city)}
            className={`rounded-full px-4 py-2 shadow-lg ${
              selectedCity?.name === city.name ? 'bg-red-600 text-white' : 'bg-zinc-800 text-white'
            } hover:bg-gray-600`}
          >
            {city.name}
          </button>
        ))}
      </div>

      {/* Map */}
      <svg width={width} height={height} className="pointer-events-none m-36 mt-0">
        <rect x={0} y={0} width={width} height={height} fill={background} rx={14} />
        <Mercator data={world.features} scale={scale} translate={[centerX, centerY + 50]}>
          {(mercator) => (
            <g>
              {mercator.features.map(({ feature, path }, i) => (
                <path
                  key={feature.properties.name}
                  d={path || ''}
                  fill={
                    highlightedCountries.includes(feature.properties.name)
                      ? colors.red
                      : colors.grey
                  }
                  stroke={background}
                  strokeWidth={0.5}
                />
              ))}
              {cityCoordinates.map((city) => {
                const [x, y] = mercator.projection(city.coordinates) || [];
                return (
                  <circle
                    key={city.name}
                    cx={x}
                    cy={y}
                    r={6}
                    fill={selectedCity?.name === city.name ? colors.red : colors.brown}
                    stroke="#000000"
                    strokeWidth={1}
                    onClick={() => handleCityClick(city)}
                    className="pointer-events-auto cursor-pointer"
                  />
                );
              })}
            </g>
          )}
        </Mercator>
      </svg>

      {/* Browse button */}
      <div className="mt-4 flex justify-center">
        <button
          onClick={() => alert('Browse functionality coming soon!')}
          className="pointer-events-auto rounded bg-primary px-8 py-3 font-body text-text shadow-lg hover:bg-white hover:text-black"
        >
          Browse All
        </button>
      </div>

      {/* Popup */}
      {selectedCity && (
        <div
          ref={popupRef}
          className="fixed left-2/3 top-1/2 z-10 h-1/3 w-1/6 rounded-lg bg-background-dk bg-opacity-30 p-5 shadow-lg backdrop-blur-lg"
        >
          <button
            onClick={() => setSelectedCity(null)}
            className="absolute right-2 top-2 text-lg font-bold text-white"
          >
            &times;
          </button>
          <h3 className="text-xl font-semibold">{selectedCity.name}</h3>
          <p>Country: {selectedCity.country}</p>
          <p>Latitude: {selectedCity.coordinates[1]}</p>
          <p>Longitude: {selectedCity.coordinates[0]}</p>
        </div>
      )}
    </div>
  );
}
