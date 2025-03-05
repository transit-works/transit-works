import React from 'react';

export default function OptimizationProgress({
  isOptimizing,
  optimizationProgress,
  selectedRoutes,
  websocketData,
  earlyConvergedRoutes
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
      early_convergence,
      warning,
      converged_routes,
      all_route_ids
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
          const hasConvergedEarly = (converged_routes && converged_routes[i]) || 
                                     (earlyConvergedRoutes && earlyConvergedRoutes.has(routeId));
          
          routeStatusElements.push(
            <div key={routeId} className={`text-xs mb-2 ${isCurrentRoute ? 'font-bold' : ''}`}>
              Route {i + 1}/{routes_count}: {routeId.substring(0, 15)}...
              {hasConvergedEarly ? (
                <span className="ml-2 text-green-400 font-semibold">
                  ✓ Converged
                </span>
              ) : isCurrentRoute ? (
                <span className="ml-2 text-blue-400">
                  Optimizing...
                </span>
              ) : (
                <span className="ml-2 text-gray-400">
                  Waiting...
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
            {early_convergence ? (
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
        <div className="mt-4 p-2 bg-background-lt bg-opacity-20 rounded-md">
          <div className="text-sm font-semibold mb-2">
            Optimizing {routes_count} routes: {progress}%
          </div>
          
          <div className="max-h-28 overflow-y-auto custom-scrollbar">
            {routeStatusElements}
          </div>
          
          <div className="text-xs mt-2 mb-2">
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
    <div className="mt-4 p-2 bg-background-lt bg-opacity-20 rounded-md">
      <div className="text-sm font-semibold mb-2">
        Optimizing {routeCount > 1 ? `${routeCount} routes` : '1 route'}: {progress}%
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
