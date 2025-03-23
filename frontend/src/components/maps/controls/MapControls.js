import React from 'react';
import { FaBuilding, FaLayerGroup, FaFireAlt } from 'react-icons/fa';

function MapControls({
  open,
  optimizedRoutes,
  resetOptimization,
  multiSelectMode,
  setMultiSelectMode,
  useLiveOptimization,
  setUseLiveOptimization,
  isOptimizing,
  effectiveSelectedRoutes,
  selectedRoute,
  onOptimize,
  fetchRidershipData,
  setShowParametersPopup,
  isBusRoute,
  areSelectedRoutesBusRoutes
}) {
  if (!open) return null;
  
  const handleOptimize = () => {
    if (multiSelectMode && effectiveSelectedRoutes.size > 0) {
      // Optimize all selected routes
      try {
        const result = onOptimize(Array.from(effectiveSelectedRoutes));
        
        // Check if result is a Promise
        if (result && typeof result.then === 'function') {
          result.then(() => {
            if (selectedRoute) {
              fetchRidershipData(selectedRoute);
            }
          });
        } else {
          // If not a Promise, fetch data immediately
          if (selectedRoute) {
            fetchRidershipData(selectedRoute);
          }
        }
      } catch (error) {
        console.error("Error during optimization:", error);
      }
    } else if (selectedRoute) {
      // Optimize single route
      try {
        const result = onOptimize(selectedRoute);
        
        // Check if result is a Promise
        if (result && typeof result.then === 'function') {
          result.then(() => {
            fetchRidershipData(selectedRoute);
          });
        } else {
          // If not a Promise, fetch data immediately
          fetchRidershipData(selectedRoute);
        }
      } catch (error) {
        console.error("Error during optimization:", error);
      }
    }
  };

  return (
    <div className="absolute bottom-12 right-0 w-72 bg-zinc-900/60 backdrop-blur-md text-white rounded-l-md shadow-lg p-4 z-10 transition-all duration-300">
      <h3 className="font-heading text-lg font-semibold pb-4">Route Optimization</h3>
      
      {/* Optimized routes counter box */}
      <div className="mb-3 py-2 px-3 bg-zinc-800/70 rounded-md flex justify-between items-center">
        <span className="text-sm">
          {optimizedRoutes.size > 0 
            ? `${optimizedRoutes.size} optimized route${optimizedRoutes.size !== 1 ? 's' : ''}`
            : "No optimized routes"
          }
        </span>
        {optimizedRoutes.size > 0 && (
          <button 
            onClick={() => resetOptimization()}
            className="text-xs bg-zinc-700 hover:bg-zinc-600 px-2 py-1 rounded"
          >
            Reset All
          </button>
        )}
      </div>
      
      {/* Multi-Route Selection Toggle */}
      <div className="mb-3 py-2 px-3 bg-zinc-800/70 rounded-md flex justify-between items-center">
        <span className="text-sm">Multi-Route Selection</span>
        <label className="relative inline-flex items-center cursor-pointer">
          <input 
            type="checkbox" 
            checked={multiSelectMode} 
            onChange={() => {
              if (multiSelectMode) {
                // When turning OFF multi-select mode:
                setMultiSelectMode(false);
                
                // Keep only the current active route (if any) in selectedRoutes
                effectiveSelectedRoutes.clear(); // Clear the existing set
                if (selectedRoute) {
                  effectiveSelectedRoutes.add(selectedRoute); // Add only the selected route
                }
              } else {
                // When turning ON multi-select mode, just toggle the flag
                setMultiSelectMode(true);
              }
            }} 
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent"></div>
        </label>
      </div>
      
      {/* Live Optimization Toggle */}
      <div className="mb-3 py-2 px-3 bg-zinc-800/70 rounded-md flex justify-between items-center">
        <span className="text-sm">Live Optimization</span>
        <label className="relative inline-flex items-center cursor-pointer">
          <input 
            type="checkbox" 
            checked={useLiveOptimization} 
            onChange={() => setUseLiveOptimization(!useLiveOptimization)} 
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent"></div>
        </label>
      </div>
      
      {/* Optimize Button and Configure Parameters Button in one row */}
      <div className="mb-3 flex gap-2">
        <button
          onClick={handleOptimize}
          disabled={
            (multiSelectMode && (effectiveSelectedRoutes.size === 0 || !areSelectedRoutesBusRoutes)) || 
            (!multiSelectMode && (!selectedRoute || !isBusRoute)) || 
            isOptimizing
          }
          className={`flex-1 py-2 px-4 rounded flex items-center justify-center gap-2 
            ${(multiSelectMode && (effectiveSelectedRoutes.size === 0 || !areSelectedRoutesBusRoutes)) || 
              (!multiSelectMode && (!selectedRoute || !isBusRoute)) || 
              isOptimizing
              ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed' 
              : 'bg-accent hover:bg-accent/90 text-white'}`}
        >
          {isOptimizing ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Optimizing...
            </>
          ) : (
            <>
              <img src="/assets/icons/speed.png" alt="Speed" className="w-5 h-5" />
              Optimize {multiSelectMode && effectiveSelectedRoutes.size > 0 ? `(${effectiveSelectedRoutes.size})` : ''}
            </>
          )}
          {!isOptimizing && multiSelectMode && effectiveSelectedRoutes.size > 0 && !areSelectedRoutesBusRoutes && (
            <span className="text-xs">Only bus routes can be optimized</span>
          )}
        </button>
        
        {/* Configure Parameters Button - Just the gear icon with tooltip */}
        <div className="relative group">
          <button
            onClick={() => setShowParametersPopup(true)}
            className="h-full aspect-square py-2 px-2 rounded bg-zinc-700 hover:bg-zinc-600 text-white flex items-center justify-center"
            aria-label="Configure Parameters"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
          </button>
          {/* Tooltip */}
          <div className="absolute right-0 bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
            <div className="bg-zinc-800 text-white text-xs py-1 px-2 rounded shadow-lg whitespace-nowrap">
              Configure Parameters
            </div>
          </div>
        </div>
      </div>
      {(!multiSelectMode && selectedRoute && !isBusRoute) || 
       (multiSelectMode && effectiveSelectedRoutes.size > 0 && !areSelectedRoutesBusRoutes) ? (
        <div className="text-xs text-amber-400 mt-1 text-center">
          Only bus routes (type 3) can be optimized
        </div>
      ) : null}
    </div>
  );
}

export default MapControls;