import React from 'react';
import { 
  FiActivity, FiLayers, FiToggleRight, FiZap, 
  FiSettings, FiRefreshCw, FiInfo, FiBus
} from 'react-icons/fi';

function MapControls({
  open,
  optimizedRoutes,
  noopRoutes,
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
      try {
        const result = onOptimize(Array.from(effectiveSelectedRoutes));
        if (result && typeof result.then === 'function') {
          result.then(() => { if (selectedRoute) fetchRidershipData(selectedRoute); });
        } else if (selectedRoute) {
          fetchRidershipData(selectedRoute);
        }
      } catch (error) {
        console.error("Error during optimization:", error);
      }
    } else if (selectedRoute) {
      try {
        const result = onOptimize(selectedRoute);
        if (result && typeof result.then === 'function') {
          result.then(() => fetchRidershipData(selectedRoute));
        } else {
          fetchRidershipData(selectedRoute);
        }
      } catch (error) {
        console.error("Error during optimization:", error);
      }
    }
  };

  const isOptimizeDisabled = (multiSelectMode && (effectiveSelectedRoutes.size === 0 || !areSelectedRoutesBusRoutes)) || 
                             (!multiSelectMode && (!selectedRoute || !isBusRoute)) || 
                             isOptimizing;

  return (
    <div className="absolute bottom-12 right-0 w-72 bg-gradient-to-br from-zinc-900/90 to-zinc-800/90 backdrop-blur-md text-white rounded-l-md shadow-xl p-5 z-10 transition-all duration-300 border border-zinc-700/30">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-heading text-xl font-semibold flex items-center">
          <FiActivity className="mr-2 text-accent" />
          Optimization
        </h3>
        {(optimizedRoutes.size > 0 || noopRoutes?.size > 0) && (
          <button 
            onClick={() => resetOptimization()}
            className="text-xs bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1.5 rounded-full flex items-center transition-all duration-200 border border-zinc-600/40 shadow-sm group"
          >
            <FiRefreshCw className="h-3 w-3 mr-1.5 group-hover:rotate-180 transition-transform duration-500" />
            Reset
          </button>
        )}
      </div>
      
      {/* Status Cards */}
      <div className="grid grid-cols-2 gap-2 mb-5">
        <div className="bg-gradient-to-br from-accent/20 to-accent/10 rounded-lg p-3 border border-accent/30 shadow-sm">
          <div className="text-xs text-accent-light/80 uppercase font-medium tracking-wide mb-1 flex items-center">
            <FiZap className="mr-1" /> Optimized
          </div>
          <div className="text-xl font-bold text-accent-light">
            {optimizedRoutes.size}
            <span className="text-sm font-normal ml-1 opacity-60">routes</span>
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-zinc-700/50 to-zinc-800/30 rounded-lg p-3 border border-zinc-600/30 shadow-sm">
          <div className="text-xs text-zinc-300/80 uppercase font-medium tracking-wide mb-1 flex items-center">
            <FiLayers className="mr-1" /> Unchanged
          </div>
          <div className="text-xl font-bold text-zinc-300">
            {noopRoutes?.size || 0}
            <span className="text-sm font-normal ml-1 opacity-60">routes</span>
          </div>
        </div>
      </div>
      
      {/* Control Panel */}
      <div className="bg-zinc-800/50 rounded-xl p-4 mb-4 border border-zinc-700/30 shadow-inner">
        {/* Selection Mode */}
        <div className="flex items-center justify-between mb-3.5">
          <label htmlFor="multi-select-toggle" className="flex items-center text-sm cursor-pointer">
            <FiLayers className="mr-2 text-zinc-400" />
            Multi-Route Selection
          </label>
          <div className="relative" onClick={() => {
            if (multiSelectMode) {
              setMultiSelectMode(false);
              effectiveSelectedRoutes.clear();
              if (selectedRoute) effectiveSelectedRoutes.add(selectedRoute);
            } else {
              setMultiSelectMode(true);
            }
          }}>
            <input 
              id="multi-select-toggle"
              type="checkbox" 
              checked={multiSelectMode} 
              onChange={() => {}} // Keep empty handler to avoid React warning
              className="sr-only peer"
            />
            <div className="w-10 h-5 bg-zinc-700 rounded-full peer cursor-pointer
                           after:content-[''] after:absolute after:top-[2px] after:left-[2px]
                           after:bg-zinc-300 after:rounded-full after:h-4 after:w-4 
                           after:transition-all after:duration-300 after:shadow-sm
                           peer-checked:after:translate-x-5 peer-checked:after:bg-white
                           peer-checked:bg-accent peer-checked:border-accent/50"></div>
          </div>
        </div>
        
        {/* Live Optimization */}
        <div className="flex items-center justify-between mb-1">
          <label htmlFor="live-optimization-toggle" className="flex items-center text-sm cursor-pointer">
            <FiToggleRight className="mr-2 text-zinc-400" />
            Live Optimization
          </label>
          <div className="relative" onClick={() => setUseLiveOptimization(!useLiveOptimization)}>
            <input 
              id="live-optimization-toggle"
              type="checkbox" 
              checked={useLiveOptimization} 
              onChange={() => {}} // Keep empty handler to avoid React warning
              className="sr-only peer"
            />
            <div className="w-10 h-5 bg-zinc-700 rounded-full peer cursor-pointer
                           after:content-[''] after:absolute after:top-[2px] after:left-[2px]
                           after:bg-zinc-300 after:rounded-full after:h-4 after:w-4 
                           after:transition-all after:duration-300 after:shadow-sm
                           peer-checked:after:translate-x-5 peer-checked:after:bg-white
                           peer-checked:bg-accent peer-checked:border-accent/50"></div>
          </div>
        </div>
      </div>
      
      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleOptimize}
          disabled={isOptimizeDisabled}
          className={`flex-1 py-2.5 px-3 rounded-lg flex items-center justify-center gap-2 
            ${isOptimizeDisabled
              ? 'bg-zinc-800/70 text-zinc-500 cursor-not-allowed' 
              : 'bg-gradient-to-r from-accent to-accent/80 hover:from-accent-light hover:to-accent text-white shadow-md hover:shadow-lg transition-all duration-300'}`}
        >
          {isOptimizing ? (
            <>
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="font-medium">Optimizing...</span>
            </>
          ) : (
            <>
              <FiZap className="h-5 w-5" />
              <span className="font-medium">Optimize</span>
              {multiSelectMode && effectiveSelectedRoutes.size > 0 && (
                <span className="ml-1 bg-white/20 text-xs py-0.5 px-1.5 rounded-full">{effectiveSelectedRoutes.size}</span>
              )}
            </>
          )}
        </button>
        
        <button
          onClick={() => setShowParametersPopup(true)}
          className="py-2.5 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700/50 shadow-sm transition-all duration-200"
          aria-label="Configure Parameters"
        >
          <FiSettings className="h-5 w-5" />
        </button>
      </div>
      
      {(!multiSelectMode && selectedRoute && !isBusRoute) || 
       (multiSelectMode && effectiveSelectedRoutes.size > 0 && !areSelectedRoutesBusRoutes) ? (
        <div className="mt-3 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center text-amber-300 text-xs">
          <FiInfo className="h-4 w-4 mr-2 flex-shrink-0" />
          <span>Only bus routes (type 3) can be optimized</span>
        </div>
      ) : null}
    </div>
  );
}

export default MapControls;

// This would be in TransitMap.js or wherever resetOptimization is defined
const resetOptimization = () => {
  setOptimizedRoutes(new Set());
  setNoopRoutes(new Set()); // Also clear the noop routes
  
  // Also reset any related state, such as:
  setShowOptimizedBanner(false);
  setShowNoopBanner(false);
  
  // If there are optimization results, clear them as well
  if (setOptimizationResults) {
    setOptimizationResults(null);
  }
};