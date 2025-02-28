import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Mercator } from '@visx/geo';
import countryCodes from './FlagData';
import ProgressBar from './ProgressBar';
import * as topojson from 'topojson-client';
import Link from 'next/link';
import ImageButton from '@/components/common/ImageButton';

export const background = '#060606';

export default function FlatMap({ events = false }) {
  const [world, setWorld] = useState(null);
  const [cities, setCities] = useState([]);
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [selectedCity, setSelectedCity] = useState(null);
  const popupRef = useRef(null);
  const margin = 144;

  // Fetch cities data from the public folder
  useEffect(() => {
    fetch('/data/city_stats.json')
      .then((response) => response.json())
      .then((data) => setCities(data))
      .catch((error) => console.error('Error fetching city stats:', error));
  }, []);

  // Dynamically extract highlighted countries from the fetched city data
  const highlightedCountries = useMemo(() => {
    return [...new Set(cities.map((city) => city.country))];
  }, [cities]);

  const colors = {
    brown: '#d1b99e',
    red: '#ca2848',
    grey: '#393939',
    hover: '#090909',
    chipActive: '#ca2848',
    chipDefault: '#393939',
  };

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

  if (!world || cities.length === 0) return <div>Loading map...</div>;

  return (
    <div className="flex flex-col items-center">
      {/* City Selection Chips */}
      <div className="mb-4 flex flex-wrap justify-center gap-2 px-6">
        {cities.map((city) => (
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
              {mercator.features.map(({ feature, path }) => (
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
              {cities.map((city) => {
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

      {/* Browse Button */}
      <div className="mt-4 flex justify-center">
        <button
          onClick={() => alert('Browse functionality coming soon!')}
          className="pointer-events-auto rounded bg-primary px-8 py-3 font-body text-text shadow-lg hover:bg-white hover:text-black"
        >
          Browse All
        </button>
      </div>

      {/* Popup with City Details */}
      {selectedCity && (
        <div
          ref={popupRef}
          className="fixed left-2/3 top-1/2 z-10 h-2/5 w-1/6 rounded-lg bg-background-dk bg-opacity-30 p-5 pt-2 shadow-lg backdrop-blur-lg flex flex-col justify-between"
        >
          <div>
            {/* Close Button */}
            <button
              onClick={() => setSelectedCity(null)}
              className="absolute right-2 top-2 text-lg font-bold text-white transition duration-300 ease-in-out transform hover:text-accent-1 hover:scale-105"
            >
              &times;
            </button>

          <div className="flex items-center mb-2 mt-6">
            {countryCodes[selectedCity.country] && (
              <img
                src={`https://flagcdn.com/24x18/${countryCodes[selectedCity.country]}.png`}
                  alt={`${selectedCity.country} flag`}
                  className="w-5 h-auto object-contain mr-2"
                />
              )}
              <h3 className="text-xl font-logo text-white">{selectedCity.name}</h3>
            </div>
            <p className="text-accent font-body text-[0.8rem]">
              Population: {selectedCity.population.toLocaleString()}
            </p>
            <p className="text-accent font-body text-[0.8rem]">
              Density: {selectedCity.population_density.toLocaleString()} ppl/km²
            </p>

            <div className="mt-2">
              <ProgressBar
                percentage={selectedCity.transitScore}
                name="Transit Score"
                startColor="#00bfff"
                endColor="#0080ff"
              />
            </div>
            <div className="mt-0">
              <ProgressBar
                percentage={selectedCity.economicScore}
                name="Economic Score"
                startColor="#7fff2aff"
                endColor="#00d400ff"
              />
            </div>
          </div>

          {/* Arrow Button at the Bottom */}
          <div className="w-full flex justify-end mt-3">
            <Link href="/" passHref>
              <button
                className="bg-white mr-2 px-3 py-1 rounded-xl text-black font-body text-[0.8rem] transition duration-300 ease-in-out transform hover:bg-accent hover:text-white hover:scale-105">
                Map &gt;
              </button>
            </Link>
          </div>
        </div>
      )}


    </div>
  );
}
