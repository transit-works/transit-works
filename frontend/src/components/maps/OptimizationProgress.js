import React from 'react';

export default function OptimizationProgress({
  isOptimizing,
  optimizationProgress,
  selectedRoutes,
  websocketData,
  convergedRoutes,
  onCancel
}) {
  // If not optimizing, don't show anything
  if (!isOptimizing) return null;
  
  // Calculate what to display based on available data
  const progress = optimizationProgress ? optimizationProgress.toFixed(1) : '0.0';
  const routeCount = selectedRoutes?.size || 0;
  
  // If we have detailed WebSocket data for multi-route optimization
  if (websocketData && routeCount > 1 && 
      websocketData.current_route && 
      websocketData.routes_count) {
    
    const {
      current_route,
      current_route_index,
      routes_count,
      route_iteration,
      iterations_per_route,
      converged,
      converged_route,
      converged_routes,
      optimize_attempts,
      all_route_ids,
      warning
    } = websocketData;
    
    // Ensure all required values are present
    if (current_route_index !== undefined && routes_count && 
        route_iteration !== undefined && iterations_per_route) {
      
      // Build route status elements for multi-route optimization
      const routeStatusElements = [];
      
      // If we have a list of all routes, show status for each
      if (all_route_ids && all_route_ids.length > 0) {
        for (let i = 0; i < all_route_ids.length; i++) {
          const routeId = all_route_ids[i];
          const isCurrentRoute = i === current_route_index;
          
          // A route is converged if the backend has marked it as such
          const hasConverged = converged_routes && converged_routes[i];
          
          // Show how many optimization attempts have been made
          const attemptCount = optimize_attempts ? optimize_attempts[i] : 0;
          
          routeStatusElements.push(
            <div key={routeId} className={`text-xs mb-2 ${isCurrentRoute ? 'font-bold' : ''} flex justify-between`}>
              <span className="truncate max-w-[150px]">
                Route {i + 1}/{routes_count}: {routeId.substring(0, 12)}...
              </span>
              {hasConverged ? (
                <span className="ml-2 text-accent-2 font-semibold">
                  ✓ Converged ({attemptCount})
                </span>
              ) : isCurrentRoute ? (
                <span className="ml-2 text-accent">
                  Optimizing... ({attemptCount})
                </span>
              ) : (
                <span className="ml-2 text-text-2 opacity-70">
                  Waiting... ({attemptCount})
                </span>
              )}
            </div>
          );
        }
      } else {
        // Fallback to showing just the current route
        routeStatusElements.push(
          <div key={current_route} className="text-xs mb-2 font-bold flex justify-between">
            <span className="truncate max-w-[150px]">
              Route {current_route_index + 1}/{routes_count}: {current_route}
            </span>
            {converged && converged_route === current_route ? (
              <span className="ml-2 text-accent-2 font-semibold">
                ✓ Converged
              </span>
            ) : (
              <span className="ml-2 text-accent">
                Optimizing...
              </span>
            )}
          </div>
        );
      }
      
      return (
        <div className="p-5 bg-background-dk bg-opacity-80 backdrop-blur-lg rounded-2xl shadow-bubble border border-zinc-700 min-w-[340px] max-w-[400px] transition-all duration-300">
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm font-semibold text-text flex items-center">
              <div className="w-2 h-2 bg-accent rounded-full mr-2 animate-pulse"></div>
              Optimizing {routes_count} routes: {progress}%
            </div>
            <button
              onClick={onCancel}
              className="bg-primary hover:bg-primary/80 text-text px-4 py-1.5 text-xs font-medium rounded-md transition-colors shadow-md"
            >
              Cancel
            </button>
          </div>
          
          <div className="max-h-32 overflow-y-auto custom-scrollbar text-text px-1 py-1 bg-black/20 rounded-lg mb-3">
            {routeStatusElements}
          </div>
          
          <div className="text-xs mt-2 mb-3 text-text-2 flex justify-between items-center">
            <span>Current route: {current_route_index + 1}/{routes_count}</span>
            <span className="px-2 py-0.5 bg-black/30 rounded-md">Iteration {route_iteration}/{iterations_per_route}</span>
          </div>
          
          <div className="w-full bg-zinc-800 rounded-full h-2.5 overflow-hidden shadow-inner">
            <div 
              className="bg-accent h-2.5 rounded-full transition-all duration-300 relative"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute top-0 left-0 w-full h-full bg-white/20 animate-pulse"></div>
            </div>
          </div>
        </div>
      );
    }
  }
  
  // Simple progress display for single route
  return (
    <div className="p-5 bg-background-dk bg-opacity-80 backdrop-blur-lg rounded-2xl shadow-bubble border border-zinc-700 min-w-[340px] max-w-[400px] transition-all duration-300">
      <div className="flex justify-between items-center mb-4">
        <div className="text-sm font-semibold text-text flex items-center">
          <div className="w-2 h-2 bg-accent rounded-full mr-2 animate-pulse"></div>
          Optimizing {routeCount > 1 ? `${routeCount} routes` : '1 route'}: {progress}%
        </div>
        <button
          onClick={onCancel}
          className="bg-primary hover:bg-primary/80 text-text px-4 py-1.5 text-xs font-medium rounded-md transition-colors shadow-md ml-3"
        >
          Cancel
        </button>
      </div>
      <div className="w-full bg-zinc-800 rounded-full h-2.5 overflow-hidden shadow-inner">
        <div 
          className="bg-accent h-2.5 rounded-full transition-all duration-300 relative"
          style={{ width: `${progress}%` }}
        >
          <div className="absolute top-0 left-0 w-full h-full bg-white/20 animate-pulse"></div>
        </div>
      </div>
    </div>
  );
}
