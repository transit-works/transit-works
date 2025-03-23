import React, { useState, useEffect, useRef } from 'react';

function RouteStopsCarousel({
  isVisible,
  selectedRoute,
  setSelectedRoute,
  optimizedRoutes,
  data,
  optimizedRoutesData,
  panelOpen,
  setPopupInfo,
  mapRef,
  setIsRouteCarouselVisible
}) {
  const [stops, setStops] = useState([]);
  const [activeStopIndex, setActiveStopIndex] = useState(0);
  const carouselRef = useRef(null);
  const isOptimized = selectedRoute && optimizedRoutes.has(selectedRoute);

  useEffect(() => {
    setIsRouteCarouselVisible(isVisible);
  }, [isVisible, setIsRouteCarouselVisible]);

  useEffect(() => {
    if (!selectedRoute || !isVisible) {
      setStops([]);
      return;
    }

    // Determine whether to use original or optimized data
    const sourceData = isOptimized ? optimizedRoutesData : data;
    if (!sourceData) return;

    const routeFeature = sourceData.features.find(
      feature => feature.properties.route_id === selectedRoute && feature.geometry.type === 'LineString'
    );

    if (!routeFeature || !routeFeature.properties.route_stops) {
      setStops([]);
      return;
    }

    // Get stop IDs for the route
    const stopIds = routeFeature.properties.route_stops;
    
    // Find stop features
    const routeStops = sourceData.features
      .filter(feature => 
        feature.geometry.type === 'Point' && 
        feature.properties.stop_id && 
        stopIds.includes(feature.properties.stop_id)
      )
      .map(stop => ({
        ...stop.properties,
        coordinates: stop.geometry.coordinates
      }));

    // Sort stops by their position in the route_stops array
    routeStops.sort((a, b) => 
      stopIds.indexOf(a.stop_id) - stopIds.indexOf(b.stop_id)
    );

    setStops(routeStops);
    setActiveStopIndex(0);
  }, [selectedRoute, isVisible, data, optimizedRoutesData, optimizedRoutes, isOptimized]);

  // Scroll to active stop when it changes
  useEffect(() => {
    if (carouselRef.current && stops.length > 0) {
      const stopElements = carouselRef.current.querySelectorAll('.stop-item');
      if (stopElements[activeStopIndex]) {
        stopElements[activeStopIndex].scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      }
    }
  }, [activeStopIndex, stops.length]);

  const handleStopClick = (index, stop) => {
    setActiveStopIndex(index);

    // Center map on stop
    if (mapRef.current) {
      const map = mapRef.current.getMap();
      map.flyTo({
        center: stop.coordinates,
        zoom: 15,
        duration: 1000,
      });
    }

    // Update the popup info to show stop details
    setPopupInfo({
      coordinates: stop.coordinates,
      properties: stop,
      type: 'Point'
    });
  };

  if (!isVisible || stops.length === 0) return null;

  return (
    <div 
      className={`fixed bottom-6 z-30 transition-all duration-300 ease-in-out
        ${panelOpen ? 'right-80' : 'right-8'}
        left-[22%] max-w-[54%]`}
    >
      <div 
        className="bg-zinc-900/80 backdrop-blur-md rounded-xl shadow-lg border border-zinc-800 p-3 overflow-hidden"
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-white font-heading font-medium text-sm flex items-center gap-1.5">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-rose-600/20">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500"></span>
            </span>
            <span>
              {stops.length} stops on route {selectedRoute}
              {isOptimized && (
                <span className="ml-2 bg-green-500/20 text-green-400 text-xs px-1.5 py-0.5 rounded">
                  Optimized
                </span>
              )}
            </span>
          </h3>
          <div className="flex items-center gap-1 text-white/50">
            <button
              className={`w-5 h-5 flex items-center justify-center rounded ${
                activeStopIndex === 0 ? "text-white/30 cursor-not-allowed" : "hover:text-white hover:bg-white/10"
              }`}
              onClick={() => activeStopIndex > 0 && setActiveStopIndex(activeStopIndex - 1)}
              disabled={activeStopIndex === 0}
              aria-label="Previous stop"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </button>
            <button
              className={`w-5 h-5 flex items-center justify-center rounded ${
                activeStopIndex === stops.length - 1 ? "text-white/30 cursor-not-allowed" : "hover:text-white hover:bg-white/10"
              }`}
              onClick={() => activeStopIndex < stops.length - 1 && setActiveStopIndex(activeStopIndex + 1)}
              disabled={activeStopIndex === stops.length - 1}
              aria-label="Next stop"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
        
        <div 
          ref={carouselRef}
          className="flex items-stretch gap-2 overflow-x-auto py-1 custom-scrollbar"
          style={{ scrollbarWidth: 'thin' }}
        >
          {stops.map((stop, index) => (
            <button
              key={stop.stop_id}
              className={`stop-item flex-shrink-0 flex flex-col min-w-[120px] max-w-[150px] p-2 rounded-md text-left transition-all cursor-pointer ${
                index === activeStopIndex
                  ? "bg-accent/80 text-white"
                  : "bg-zinc-800/70 text-white/70 hover:bg-zinc-700/70 hover:text-white"
              }`}
              onClick={() => handleStopClick(index, stop)}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`flex h-4 w-4 items-center justify-center rounded-full ${
                  index === activeStopIndex ? "bg-white/20" : "bg-white/10"
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${
                    index === activeStopIndex ? "bg-white" : "bg-white/70"
                  }`}></span>
                </span>
                <span className="text-xs font-semibold truncate">{index + 1}</span>
              </div>
              <span className="text-xs font-medium line-clamp-2">{stop.stop_name}</span>
            </button>
          ))}
        </div>
        
        <div className="mt-2 text-xs text-white/50 text-center">
          Click on a stop to navigate to it
        </div>
      </div>
    </div>
  );
}

export default RouteStopsCarousel;