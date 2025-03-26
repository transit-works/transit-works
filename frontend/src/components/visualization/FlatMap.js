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
  const [carouselIndex, setCarouselIndex] = useState(0);
  const citiesPerView = 5;
  const popupRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const margin = 144;

  // Fetch cities data from the public folder
  useEffect(() => {
    fetch('/data/city_stats.json')
      .then((response) => response.json())
      .then((data) => setCities(data))
      .catch((error) => console.error('Error fetching city stats:', error));
  }, []);

  // Carousel navigation functions
  const nextSlide = () => {
    setCarouselIndex((prevIndex) => 
      (prevIndex + 1) % Math.ceil(cities.length / citiesPerView)
    );
  };

  const prevSlide = () => {
    setCarouselIndex((prevIndex) => 
      prevIndex === 0 ? Math.ceil(cities.length / citiesPerView) - 1 : prevIndex - 1
    );
  };

  // Add these scroll functions
  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -250, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 250, behavior: 'smooth' });
    }
  };

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

  // Get the current visible cities based on carousel index
  const visibleCities = useMemo(() => {
    const startIndex = carouselIndex * citiesPerView;
    return cities.slice(startIndex, startIndex + citiesPerView);
  }, [cities, carouselIndex, citiesPerView]);

  if (!world || cities.length === 0) return <div>Loading map...</div>;

  return (
    <div className="flex flex-col items-center">
      {/* City Selection Carousel with Scroll Arrows */}
      <div className="w-full mb-6 relative" style={{ width: `${width}px` }}>
        {/* Left Arrow */}
        <button 
          onClick={scrollLeft}
          className="absolute left-0 top-1/2 transform -translate-y-1/2 z-20 pointer-events-auto bg-zinc-800/70 hover:bg-red-600 w-8 h-8 rounded-full flex items-center justify-center text-white shadow-lg transition-all duration-300"
        >
          &#8249;
        </button>
        
        {/* Horizontally scrollable container */}
        <div 
          ref={scrollContainerRef}
          className="overflow-x-auto py-2 hide-scrollbar" 
          style={{ scrollBehavior: 'smooth' }}
        >
          <div className="flex gap-2 min-w-max px-10"> {/* Increased padding to make room for buttons */}
            {cities.map((city) => (
              <button
                key={city.name}
                onClick={() => handleCityClick(city)}
                className={`min-w-[100px] h-16 rounded-md flex flex-col items-center justify-between shadow-lg transition-all duration-300 ${
                  selectedCity?.name === city.name 
                    ? 'bg-accent text-white scale-105 ring-1 ring-white/30' 
                    : city.coming_soon
                      ? 'bg-zinc-900 text-gray-300 hover:bg-zinc-700' // Gray for coming soon cities
                      : 'bg-zinc-900 text-white hover:bg-zinc-700'
                } p-1.5`}
              >
                {/* City content remains the same */}
                <div className="flex items-center w-full justify-center">
                  {countryCodes[city.country] && (
                    <img
                      src={`https://flagcdn.com/24x18/${countryCodes[city.country]}.png`}
                      alt={`${city.country} flag`}
                      className="w-3 h-auto object-contain mr-1"
                    />
                  )}
                  <span className="font-medium text-xs truncate">{city.name}</span>
                </div>
                
                {/* Compact Transit Score or Coming Soon */}
                <div className="w-full mt-1">
                  {city.coming_soon ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-400">Coming Soon</span>
                      </div>
                      <div className="w-full h-1.5 bg-black rounded-full overflow-hidden mt-0.5">
                        <div 
                          className="h-full bg-gray-600"
                          style={{ width: '100%' }}
                        ></div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-xs">Transit:</span>
                        <span className="text-xs font-medium">{city.transitScore}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-black rounded-full overflow-hidden mt-0.5">
                        <div 
                          className={`h-full ${
                            selectedCity?.name === city.name 
                              ? 'bg-white' 
                              : 'bg-gradient-to-r from-rose-600 to-orange-600'
                          }`}
                          style={{ width: `${city.transitScore}%` }}
                        ></div>
                      </div>
                    </>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
        
        {/* Right Arrow */}
        <button 
          onClick={scrollRight}
          className="absolute right-0 top-1/2 transform -translate-y-1/2 z-20 pointer-events-auto bg-zinc-800/70 hover:bg-red-600 w-8 h-8 rounded-full flex items-center justify-center text-white shadow-lg transition-all duration-300"
        >
          &#8250;
        </button>
        
        {/* Fade effects for indicating more content */}
        <div className="absolute left-8 top-0 bottom-0 w-12 bg-gradient-to-r from-black to-transparent z-10 pointer-events-none"></div>
        <div className="absolute right-8 top-0 bottom-0 w-12 bg-gradient-to-l from-black to-transparent z-10 pointer-events-none"></div>
      </div>

      {/* Add this CSS to your global styles or as an inline style tag */}
      <style jsx>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>

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
                    fill={
                      selectedCity?.name === city.name 
                        ? colors.red 
                        : city.coming_soon 
                          ? '#555555' // Gray for coming soon cities
                          : colors.brown
                    }
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
            <Link 
              href="/city-select" 
              className="pointer-events-auto rounded bg-primary px-8 py-3 font-body text-text shadow-lg hover:bg-white hover:text-black cursor-pointer inline-block"
            >
              Browse All
            </Link>
            </div>

            {/* Popup with City Details */}
      {selectedCity && (
        <div
          ref={popupRef}
          className="fixed left-2/3 top-3/4 z-10 h-auto w-1/6 rounded-xl bg-zinc-900/90 p-6 shadow-2xl backdrop-blur-lg border border-zinc-700/50 transform -translate-y-1/2 flex flex-col justify-between transition-all duration-300 ease-in-out animate-fadeIn"
          style={{ 
            minHeight: "350px",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.7)"
          }}
        >
          {/* City Highlight Background */}
          <div className="absolute inset-0 rounded-xl overflow-hidden z-[-1]">
            <div className="absolute inset-0 bg-gradient-to-br from-red-900/20 to-zinc-900/30"></div>
          </div>

          {/* Close Button */}
          <button
            onClick={() => setSelectedCity(null)}
            className="absolute right-3 top-3 w-7 h-7 flex items-center justify-center rounded-full bg-zinc-800/80 hover:bg-red-600 text-zinc-300 hover:text-white transition-colors"
            aria-label="Close"
          >
            ×
          </button>

          <div className="space-y-4 relative">
            {/* Header with Flag and City Name */}
            <div className="flex items-center space-x-3 mb-4 pt-1">
              {countryCodes[selectedCity.country] && (
                <div className="p-1.5 bg-zinc-800/90 rounded-md shadow-inner">
                  <img
                    src={`https://flagcdn.com/24x18/${countryCodes[selectedCity.country]}.png`}
                    alt={`${selectedCity.country} flag`}
                    className="w-6 h-auto object-contain"
                  />
                </div>
              )}
              <div>
                <h3 className="text-2xl font-logo text-white tracking-wide">{selectedCity.name}</h3>
                <p className="text-zinc-400 text-xs">{selectedCity.country}</p>
              </div>
            </div>
            
            {/* City Stats */}
            <div className="space-y-2.5 bg-zinc-800/40 p-3.5 rounded-lg border border-zinc-700/30">
              <div className="grid grid-cols-2 gap-2">
                <p className="text-zinc-400 font-body text-xs flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1.5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                  </svg>
                  Population
                </p>
                <p className="text-white font-body text-xs text-right font-semibold">
                  {selectedCity.population.toLocaleString()}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <p className="text-zinc-400 font-body text-xs flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                  </svg>
                  Density
                </p>
                <p className="text-white font-body text-xs text-right font-semibold">
                  {selectedCity.population_density.toLocaleString()} ppl/km²
                </p>
              </div>
            </div>

            {/* Check if city is coming soon */}
            {selectedCity.coming_soon ? (
              <div className="space-y-3">
                <div className="bg-zinc-800/40 p-4 rounded-lg border border-zinc-700/30 text-center">
                  <div className="text-yellow-200 mb-2 flex justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="8" x2="12" y2="12"></line>
                      <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                  </div>
                  <h4 className="text-yellow-200 font-semibold text-base mb-1">Coming Soon</h4>
                  <p className="text-white/90 text-xs">
                    Transit and utilization data for {selectedCity.name} will be available in a future update.
                  </p>
                </div>
              </div>
            ) : (
              /* Progress Bars - More Compact Version - Only shown if not coming soon */
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-0.5">
                  <p className="text-zinc-400 text-xs font-medium">City Metrics</p>
                  <div className="h-px flex-grow mx-2 bg-zinc-700/50"></div>
                </div>
                
                {/* Transit Score - Compact Layout */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-zinc-400 text-xs font-body">Transit Score</span>
                    <span className="text-white text-xs font-semibold">{selectedCity.transitScore}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-zinc-800/80 rounded-sm overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-cyan-500 to-blue-600"
                      style={{ width: `${selectedCity.transitScore}%` }}
                    ></div>
                  </div>
                </div>
                
                {/* Economic Score - Compact Layout */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-zinc-400 text-xs font-body">Utilization Score</span>
                    <span className="text-white text-xs font-semibold">{selectedCity.economicScore}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-zinc-800/80 rounded-sm overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-accent-2 to-green-500"
                      style={{ width: `${selectedCity.economicScore}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action Button - Modified for coming soon cities */}
          <div className="w-full flex justify-end mt-5 pt-3 border-t border-zinc-700/50">
            {selectedCity.coming_soon ? (
              <button
                className="bg-zinc-700 px-3.5 py-1.5 rounded-md text-zinc-300 font-body text-xs cursor-not-allowed"
                disabled
              >
                Coming Soon
              </button>
            ) : (
              <Link href={`/cities/${selectedCity.name.toLowerCase().replace(/\s+/g, '-')}`} passHref>
                <button
                  className="bg-gradient-to-r from-rose-500 to-accent px-3.5 py-1.5 rounded-md text-white font-body text-xs shadow-md hover:from-white hover:to-white hover:text-black transition duration-300 ease-in-out transform hover:translate-y-[-1px] flex items-center gap-1.5 group"
                >
                  <span>View Details</span>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 transform group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
