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
            <div key={routeId} className={`text-xs mb-2 ${isCurrentRoute ? 'font-bold' : ''}`}>
              Route {i + 1}/{routes_count}: {routeId.substring(0, 15)}...
              {hasConverged ? (
                <span className="ml-2 text-green-400 font-semibold">
                  ✓ Converged ({attemptCount} attempts)
                </span>
              ) : isCurrentRoute ? (
                <span className="ml-2 text-blue-400">
                  Optimizing... ({attemptCount} attempts)
                </span>
              ) : (
                <span className="ml-2 text-gray-400">
                  Waiting... ({attemptCount} attempts)
                </span>
              )}
            </div>
          );
        }
      } else {
        // Fallback to showing just the current route
        routeStatusElements.push(
          <div key={current_route} className="text-xs mb-2 font-bold">
            Route {current_route_index + 1}/{routes_count}: {current_route}
            {converged && converged_route === current_route ? (
              <span className="ml-2 text-green-400 font-semibold">
                ✓ Converged
              </span>
            ) : (
              <span className="ml-2 text-blue-400">
                Optimizing...
              </span>
            )}
          </div>
        );
      }
      
      return (
        <div className="p-4 bg-background-dk bg-opacity-20 backdrop-blur-lg rounded-2xl shadow-lg border border-zinc-700 min-w-[300px] max-w-[400px]">
          <div className="flex justify-between items-center mb-3">
            <div className="text-sm font-semibold text-white">
              Optimizing {routes_count} routes: {progress}%
            </div>
            <button
              onClick={onCancel}
              className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 text-xs rounded-md transition-colors"
            >
              Cancel
            </button>
          </div>
          
          <div className="max-h-28 overflow-y-auto custom-scrollbar text-white">
            {routeStatusElements}
          </div>
          
          <div className="text-xs mt-2 mb-2 text-white">
            Current route: {current_route_index + 1}/{routes_count} (Iteration {route_iteration}/{iterations_per_route})
          </div>
          
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div 
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      );
    }
  }
  
  // Simple progress display for single route
  return (
    <div className="p-4 bg-background-dk bg-opacity-20 backdrop-blur-lg rounded-2xl shadow-lg border border-zinc-700 min-w-[300px] max-w-[400px]">
      <div className="flex justify-between items-center mb-3">
        <div className="text-sm font-semibold text-white">
          Optimizing {routeCount > 1 ? `${routeCount} routes` : '1 route'}: {progress}%
        </div>
        <button
          onClick={onCancel}
          className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 text-xs rounded-md transition-colors"
        >
          Cancel
        </button>
      </div>
      <div className="w-full bg-gray-700 rounded-full h-2">
        <div 
          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        ></div>
      </div>
    </div>
  );
}
