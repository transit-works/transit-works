'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo, Suspense } from 'react';
import countryCodes from '@/components/visualization/FlagData';
import ProgressBar from '@/components/visualization/ProgressBar';
import * as topojson from 'topojson-client';
import Link from 'next/link';
import Globe from 'react-globe.gl';
import * as THREE from 'three';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center">
          <div className="bg-red-500/20 p-6 rounded-lg text-white">
            <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
            <p>{this.state.error?.message || "Unknown error"}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function LoadingIndicator() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="bg-zinc-900/60 p-6 rounded-lg">
        <h2 className="text-xl font-bold text-white mb-2">Loading Globe...</h2>
        <div className="w-24 h-1 bg-gray-700">
          <div className="h-full bg-white animate-pulse"></div>
        </div>
      </div>
    </div>
  );
}

export default function CountrySelectPage() {
  const globeRef = useRef();
  const popupRef = useRef(null);
  const [mounted, setMounted] = useState(false);
  const [world, setWorld] = useState({ features: [] });
  const [cities, setCities] = useState([]);
  const [selectedCity, setSelectedCity] = useState(null);
  const [error, setError] = useState(null);
  const [dimensions, setDimensions] = useState({
    width: 800,
    height: 600,
  });
  const [autoRotate, setAutoRotate] = useState(true);
  const [rippleData, setRippleData] = useState([]);

  // Set mounted state after component mounts
  useEffect(() => {
    setMounted(true);
    setDimensions({
      width: window.innerWidth,
      height: window.innerHeight,
    });
  }, []);

  // Fetch cities data from the public folder
  useEffect(() => {
    if (!mounted) return;

    fetch('/data/city_stats.json')
      .then((response) => response.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setCities(data);
        }
      })
      .catch((error) => {
        console.error('Error fetching city stats:', error);
        setError("Failed to load city data. Please try again later.");
      });
  }, [mounted]);

  // Fetch world topology data
  useEffect(() => {
    if (!mounted) return;

    fetch('/data/world_topo.json')
      .then((response) => response.json())
      .then((topology) => {
        if (topology?.objects?.units) {
          const worldData = topojson.feature(topology, topology.objects.units);
          setWorld(worldData);
        }
      })
      .catch((error) => {
        console.error('Error fetching topology data:', error);
        setError("Failed to load world map. Please try again later.");
      });
  }, [mounted]);

  // Handle window resize
  useEffect(() => {
    if (!mounted) return;

    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [mounted]);

  // Close popup when clicking outside
  useEffect(() => {
    if (!mounted) return;

    const handleClickOutside = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        setSelectedCity(null);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [mounted]);

  // Dynamically extract highlighted countries from the fetched city data
  const highlightedCountries = useMemo(() => {
    if (!cities.length) return [];
    return [...new Set(cities.map((city) => city.country))];
  }, [cities]);

  // Transform city data for the globe
  const pointsData = useMemo(() => {
    if (!cities.length) return [];
    
    return cities.map(city => {
      if (!city.coordinates) return null;
      
      return {
        ...city,
        lat: city.coordinates[1],
        lng: city.coordinates[0],
        size: 0.5,
        color: city.coming_soon ? '#555555' : '#d1b99e', // Gray color for coming soon cities
      };
    }).filter(Boolean);
  }, [cities]);

  // Add a function to convert city name to URL-friendly format
  const getCitySlug = (cityName) => {
    if (!cityName) return '';
    return cityName.toLowerCase().replace(/\s+/g, '');
  };

  // Update the handleCityClick function to store the selected city slug
  const handleCityClick = useCallback((city) => {
    if (!city || !city.coordinates) return;
    
    setSelectedCity(city);
    
    // Store the city slug and coordinates in localStorage for persistence
    if (city.name) {
      const citySlug = getCitySlug(city.name);
      localStorage.setItem('selectedCity', citySlug);
      localStorage.setItem('selectedCityCoordinates', JSON.stringify(city.coordinates));
    }
    
    // Add ripple effect
    setRippleData([{
      lat: city.coordinates[1],
      lng: city.coordinates[0],
      maxR: 5,
      propagationSpeed: 3,
      repeatPeriod: 1000
    }]);
    
    if (!globeRef.current) return;
    
    // Stop auto-rotation when a city is selected
    const controls = globeRef.current.controls();
    if (controls) {
      controls.autoRotate = false;
      setAutoRotate(false);
      controls.update();
    }
    
    // Use a very safe altitude to ensure visibility
    setTimeout(() => {
      try {
        globeRef.current.pointOfView({
          lat: city.coordinates[1],
          lng: city.coordinates[0],
          altitude: 2.5
        }, 1000);
      } catch (err) {
        console.error('Failed to update globe view:', err);
      }
    }, 100);
  }, []);

  // Add this function near your other functions
  const toggleAutoRotate = useCallback(() => {
    if (!globeRef.current) return;
    
    const controls = globeRef.current.controls();
    if (controls) {
      const newState = !autoRotate;
      controls.autoRotate = newState;
      setAutoRotate(newState);
      controls.update();
    }
  }, [autoRotate]);

  // Add this useMemo near your other useMemo hooks to calculate averages
  const cityAverages = useMemo(() => {
    if (!cities.length) return { transitScore: 0, economicScore: 0 };
    
    const transitTotal = cities.reduce((sum, city) => sum + (city.transitScore || 0), 0);
    const economicTotal = cities.reduce((sum, city) => sum + (city.economicScore || 0), 0);
    
    return {
      transitScore: Math.round(transitTotal / cities.length),
      economicScore: Math.round(economicTotal / cities.length)
    };
  }, [cities]);

  // If there's an error, show it
  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="bg-red-500/20 p-6 rounded-lg">
          <h2 className="text-xl font-bold text-white mb-2">Error</h2>
          <p className="text-white">{error}</p>
          <p className="text-gray-300 mt-2">Try refreshing the page or check the console for details.</p>
        </div>
      </div>
    );
  }

  // Don't render anything until mounted
  if (!mounted) {
    return <LoadingIndicator />;
  }

  return (
    <ErrorBoundary>
      <div className="flex flex-col items-center">
        {/* City Select Text in Top Right Corner */}
        <div className="fixed top-6 left-6 z-10 text-left font-logo">
          <h1 className="text-[10rem] leading-none font-bold text-white opacity-80">City</h1>
          <h1 className="text-[6rem] leading-none font-bold text-white opacity-80">Select</h1>
          
          <div className="mt-0">
            {/* Search hint */}
            <div className="bg-background-dk bg-opacity-30 backdrop-blur-lg rounded-full px-4 py-2 text-white/70 text-[1.2rem] flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <span>Click on a city to explore</span>
            </div>
          </div>
        </div>

        <div className="w-full h-screen">
          <Suspense fallback={<LoadingIndicator />}>
            {mounted && (
              <Globe
                ref={globeRef}
                // Keep the dark earth texture
                globeImageUrl="//unpkg.com/three-globe/example/img/earth-dark.jpg" 
                backgroundColor="rgba(0, 0, 0, 0)"
                width={dimensions.width}
                height={dimensions.height}
                
                // Add atmosphere glow effect
                atmosphereColor="#c4a76e" // Bright blue glow
                atmosphereAltitude={0.15} // Controls the thickness of the glow
                
                // Replace hexPolygons with polygons (which don't use H3)
                polygonsData={world.features || []}
                polygonCapColor={d => highlightedCountries.includes(d?.properties?.name) ? '#ca2848' : '#393939'}
                polygonSideColor={() => '#222222'}
                polygonStrokeColor={() => '#111111'}
                polygonAltitude={0.005}
                
                // Keep your city points
                pointsData={pointsData}
                pointColor="color"
                pointAltitude={0.05}
                pointRadius={0.7}
                pointsMerge={false}
                onPointClick={point => {
                  handleCityClick({
                    name: point.name,
                    country: point.country,
                    population: point.population,
                    population_density: point.population_density,
                    transitScore: point.transitScore,
                    economicScore: point.economicScore,
                    coordinates: [point.lng, point.lat],
                    coming_soon: point.coming_soon  // Add this line to pass the coming_soon flag
                  });
                }}
                // Replace the existing onGlobeReady callback
                onGlobeReady={() => {
                  if (globeRef.current) {
                    const controls = globeRef.current.controls();
                    if (controls) {
                      controls.enableZoom = true;
                      controls.autoRotate = autoRotate;
                      controls.autoRotateSpeed = 0.25;
                      controls.minDistance = 200;
                      // Optionally, force an update:
                      controls.update();
                    }
                    // Then set the initial view
                    globeRef.current.pointOfView({ lat: 45, lng: -30, altitude: 2.5 });
                  }
                }}
                ringsData={rippleData}
                ringColor={() => 'rgba(255,255,255,0.6)'}
                ringMaxRadius="maxR"
                ringPropagationSpeed="propagationSpeed"
                ringRepeatPeriod="repeatPeriod"
              />
            )}
          </Suspense>
        </div>

        {selectedCity && (
          <div
            ref={popupRef}
            className="fixed right-8 top-1/2 transform -translate-y-1/2 z-10 w-80 rounded-xl bg-background-dk bg-opacity-30 p-6 shadow-lg backdrop-blur-lg flex flex-col justify-between border border-white/10"
          >
            <div>
              <button
                onClick={() => setSelectedCity(null)}
                className="absolute right-3 top-3 text-lg font-bold text-white/80 hover:text-white bg-black/20 rounded-full w-8 h-8 flex items-center justify-center"
              >
                &times;
              </button>

              <div className="flex items-center mb-4 mt-2">
                {selectedCity.country && countryCodes[selectedCity.country] && (
                  <img
                    src={`https://flagcdn.com/24x18/${countryCodes[selectedCity.country]}.png`}
                    alt={`${selectedCity.country} flag`}
                    className="w-6 h-auto object-contain mr-3"
                  />
                )}
                <h3 className="text-2xl font-logo text-white tracking-wide">{selectedCity.name}</h3>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-white/10 rounded-lg p-3">
                  <p className="text-accent font-body text-xs uppercase mb-1 opacity-80">Population</p>
                  <p className="text-white font-bold text-xl">{selectedCity.population.toLocaleString()}</p>
                </div>
                <div className="bg-white/10 rounded-lg p-3">
                  <p className="text-accent font-body text-xs uppercase mb-1 opacity-80">Density</p>
                  <p className="text-white font-bold text-xl">{selectedCity.population_density.toLocaleString()}</p>
                  <p className="text-white/70 text-xs">people/km²</p>
                </div>
              </div>

              {selectedCity.coming_soon ? (
                <div className="mb-4 bg-white/10 rounded-lg p-4 flex flex-col items-center">
                  <div className="text-yellow-200 mb-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="8" x2="12" y2="12"></line>
                      <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                  </div>
                  <h4 className="text-yellow-200 font-semibold text-lg mb-1">Coming Soon</h4>
                  <p className="text-white/90 text-center text-sm">
                    Transit and economic data for {selectedCity.name} will be available in a future update.
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-4">
                    <h4 className="text-white/90 font-semibold text-sm mb-2">City Performance</h4>
                    {selectedCity.transitScore && (
                      <div className="mb-3">
                        <ProgressBar
                          percentage={selectedCity.transitScore}
                          name="Transit Score"
                          startColor="#00bfff"
                          endColor="#0080ff"
                        />
                        {selectedCity.transitScore >= 80 && (
                          <p className="text-[#00bfff] text-xs mt-1">Top tier transit system</p>
                        )}
                      </div>
                    )}
                    {selectedCity.economicScore && (
                      <div className="mb-2">
                        <ProgressBar
                          percentage={selectedCity.economicScore}
                          name="Economic Score"
                          startColor="#7fff2aff"
                          endColor="#00d400ff"
                        />
                        {selectedCity.economicScore >= 70 && (
                          <p className="text-[#7fff2a] text-xs mt-1">Strong economic performance</p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mb-4 border-t border-white/10 pt-3">
                    <h4 className="text-white/90 font-semibold text-sm mb-2">Performance Comparison</h4>
                    <div className="relative h-24 w-full">
                      <div className="absolute bottom-0 left-0 w-full h-full flex items-end">
                        <div className="flex flex-col items-center justify-end w-1/4">
                          <div 
                            className="w-6 bg-gradient-to-t from-[#00bfff] to-[#0080ff] rounded-t"
                            style={{ height: `${selectedCity.transitScore * 0.3}px` }}
                          ></div>
                          <p className="text-white/80 text-xs mt-1">City</p>
                        </div>
                        <div className="flex flex-col items-center justify-end w-1/4">
                          <div 
                            className="w-6 bg-white/30 rounded-t" 
                            style={{ height: `${cityAverages.transitScore * 0.3}px` }}
                          ></div>
                          <p className="text-white/80 text-xs mt-1">Avg</p>
                        </div>
                        <div className="flex flex-col items-center justify-end w-1/4">
                          <div 
                            className="w-6 bg-gradient-to-t from-[#7fff2aff] to-[#00d400ff] rounded-t"
                            style={{ height: `${selectedCity.economicScore * 0.3}px` }}
                          ></div>
                          <p className="text-white/80 text-xs mt-1">City</p>
                        </div>
                        <div className="flex flex-col items-center justify-end w-1/4">
                          <div 
                            className="w-6 bg-white/30 rounded-t" 
                            style={{ height: `${cityAverages.economicScore * 0.3}px` }}
                          ></div>
                          <p className="text-white/80 text-xs mt-1">Avg</p>
                        </div>
                      </div>
                      <div className="absolute top-0 left-0 w-full text-xs flex text-white/70">
                        <span className="w-1/2 text-center">Transit</span>
                        <span className="w-1/2 text-center">Economic</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {selectedCity.transitScore > 75 && (
                      <span className="bg-blue-500/20 text-blue-300 text-xs py-1 px-2 rounded-full">
                        Transit Hub
                      </span>
                    )}
                    {selectedCity.economicScore > 60 && (
                      <span className="bg-green-500/20 text-green-300 text-xs py-1 px-2 rounded-full">
                        Economic Transit
                      </span>
                    )}
                    {selectedCity.population > 5000000 && (
                      <span className="bg-purple-500/20 text-purple-300 text-xs py-1 px-2 rounded-full">
                        Megacity
                      </span>
                    )}
                    {selectedCity.population_density > 5000 && (
                      <span className="bg-orange-500/20 text-orange-300 text-xs py-1 px-2 rounded-full">
                        High-Density
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Update the popup buttons with city parameter */}
            <div className="w-full flex justify-center mt-5">
              {selectedCity.coming_soon ? (
                <button
                  className="bg-white/50 px-4 py-1.5 rounded-xl text-black font-body text-sm cursor-not-allowed"
                  disabled
                >
                  Data Coming Soon
                </button>
              ) : (
                <Link 
                  href={`/map?city=${getCitySlug(selectedCity.name)}`} 
                  passHref
                >
                  <button
                    className="bg-white px-4 py-1.5 rounded-xl text-black font-body text-sm hover:bg-opacity-90 transition">
                    Explore Map &rarr;
                  </button>
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Move auto-rotation toggle button to bottom left */}
        <div className="fixed bottom-6 left-6 z-10 flex items-center">
          <button
            onClick={toggleAutoRotate}
            className="bg-background-dk bg-opacity-30 backdrop-blur-lg p-3 rounded-full shadow-lg text-white hover:bg-opacity-50 transition-all"
            title={autoRotate ? "Stop Rotation" : "Start Rotation"}
          >
            {autoRotate ? (
              // Pause icon
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="6" y="4" width="4" height="16"></rect>
                <rect x="14" y="4" width="4" height="16"></rect>
              </svg>
            ) : (
              // Play icon
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
            )}
          </button>
          
          {/* Legend now positioned to the right of the button */}
          <div className="bg-background-dk bg-opacity-30 backdrop-blur-lg rounded-lg shadow-lg p-3 text-white ml-4 flex flex-col space-y-2">
            <div className="flex items-center">
              <div className="w-4 h-4 rounded-full bg-[#ca2848] mr-2"></div>
              <span className="text-xs">Available Countries</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded-full bg-[#d1b99e] mr-2"></div>
              <span className="text-xs">City Points</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded-full bg-[#555555] mr-2"></div>
              <span className="text-xs">Coming Soon</span>
            </div>
          </div>
        </div>

        {/* Add this inside the main div, below the globe */}
        {!selectedCity && (
          <div className="fixed right-8 top-1/2 transform -translate-y-1/2 z-10 w-80 rounded-xl bg-background-dk bg-opacity-30 p-6 shadow-lg backdrop-blur-lg flex flex-col justify-between border border-white/10">
            <div>
              <h3 className="text-2xl font-logo text-white tracking-wide mb-4">Explore Transit Cities</h3>
              
              <p className="text-white/80 mb-4">Click on any highlighted city to explore its transit and economic performance metrics.</p>
              
              <div className="bg-white/10 rounded-lg p-3 mb-4">
                <p className="text-accent font-body text-xs uppercase mb-1 opacity-80">Global Statistics</p>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div>
                    <p className="text-white/70 text-xs">Cities</p>
                    <p className="text-white font-bold text-xl">{cities.length}</p>
                  </div>
                  <div>
                    <p className="text-white/70 text-xs">Countries</p>
                    <p className="text-white font-bold text-xl">{highlightedCountries.length}</p>
                  </div>
                </div>
              </div>
              
              <div className="mb-4">
                <h4 className="text-white/90 font-semibold text-sm mb-2">Global Averages</h4>
                <ProgressBar
                  percentage={cityAverages.transitScore}
                  name="Transit Score"
                  startColor="#00bfff"
                  endColor="#0080ff"
                />
                <div className="mt-3">
                  <ProgressBar
                    percentage={cityAverages.economicScore}
                    name="Economic Score"
                    startColor="#7fff2aff"
                    endColor="#00d400ff"
                  />
                </div>
              </div>
              
              <div className="mt-4 text-sm text-white/70">
                <p>Featuring top transit systems from around the world. Use the globe to discover cities and their performance metrics.</p>
              </div>
            </div>
            
            <div className="w-full flex justify-center mt-5">
              <Link href="/" passHref>
                <button className="bg-white px-4 py-1.5 rounded-xl text-black font-body text-sm hover:bg-opacity-90 transition">
                  Return Home
                </button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
