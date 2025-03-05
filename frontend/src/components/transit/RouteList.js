import { useState, useMemo } from 'react';

function RouteList({ 
  data, 
  selectedRoutes, 
  setSelectedRoutes, 
  multiSelectMode, 
  selectedRoute, 
  setSelectedRoute,
  optimizedRoutes
}) {
  const [searchQuery, setSearchQuery] = useState('');

  const handleClick = (id) => {
    setSelectedRoutes((prevSelectedRoutes) => {
      const newSelectedRoutes = new Set(prevSelectedRoutes);
      
      if (multiSelectMode) {
        // Multi-select mode: Toggle the selection
        if (newSelectedRoutes.has(id)) {
          newSelectedRoutes.delete(id);
        } else {
          newSelectedRoutes.add(id);
        }
      } else {
        // Single-select mode
        if (newSelectedRoutes.size === 1 && newSelectedRoutes.has(id)) {
          newSelectedRoutes.clear();
          if (setSelectedRoute) setSelectedRoute(null);
        } else {
          newSelectedRoutes.clear();
          newSelectedRoutes.add(id);
          if (setSelectedRoute) setSelectedRoute(id);
        }
      }
      
      return newSelectedRoutes;
    });
  };

  // Get all routes that aren't points
  const routes = data?.features?.filter((feature) => feature.geometry.type !== 'Point') || [];
  
  // Filter routes based on search query
  const filteredRoutes = useMemo(() => {
    if (!searchQuery) return routes;
    
    const query = searchQuery.toLowerCase();
    return routes.filter((route) => {
      const { route_id, route_short_name, route_long_name } = route.properties;
      return (
        route_id?.toLowerCase().includes(query) ||
        route_short_name?.toLowerCase().includes(query) ||
        route_long_name?.toLowerCase().includes(query)
      );
    });
  }, [routes, searchQuery]);
  
  // Separate into selected and unselected routes
  const selectedRoutesArray = [];
  const unselectedRoutesArray = [];
  
  filteredRoutes.forEach(route => {
    if (selectedRoutes?.has(route.properties.route_id)) {
      selectedRoutesArray.push(route);
    } else {
      unselectedRoutesArray.push(route);
    }
  });
  
  // Combined routes: selected first, then unselected
  const sortedRoutes = [...selectedRoutesArray, ...unselectedRoutesArray];
  
  // Count optimized routes
  const optimizedCount = optimizedRoutes ? [...optimizedRoutes].filter(id => 
    filteredRoutes.some(route => route.properties.route_id === id)
  ).length : 0;

  return (
    <div className="flex flex-col h-full">
      {/* Search input with icon */}
      <div className="sticky top-0 z-10 bg-background-dk pb-1 pt-1">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search routes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-800/50 pl-10 pr-4 py-1.5 text-sm rounded-lg text-white placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-accent-1 focus:bg-zinc-800/90 transition-colors"
          />
          {searchQuery && (
            <button 
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-white"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Column headers - more compact */}
        <div className="flex flex-row py-1.5 border-b border-zinc-800/80 mt-1">
          <h2 className="text-xs w-14 font-heading text-zinc-400">Route #</h2>
          <h2 className="text-xs ml-2 font-heading text-zinc-400">Name</h2>
        </div>
      </div>

      {/* Route list with more compact styling */}
      <div className="overflow-y-auto flex-grow">
        {sortedRoutes.length > 0 ? (
          sortedRoutes.map((route) => {
            const { route_id, route_short_name, route_long_name } = route.properties;
            const isSelected = selectedRoutes?.has(route_id);
            const isOptimized = optimizedRoutes?.has(route_id);

            return (
              <div 
                key={route_id} 
                className={`group flex w-full items-center text-left py-1 border-b border-zinc-800/30 hover:bg-zinc-800/30 transition-colors ${
                  isSelected ? 'bg-zinc-800/50' : ''
                }`}
              >
                {isSelected && <div className="mr-1 h-2.5 w-0.5 rounded-r-sm bg-accent-1" />}
                <button
                  type="button"
                  onClick={() => handleClick(route_id)}
                  aria-pressed={isSelected}
                  title={route_long_name}
                  className={`w-full text-left text-xs ${
                    isSelected ? 'text-accent-1' : 'text-white'
                  } hover:cursor-pointer group-hover:text-accent-1 px-1.5`}
                >
                  <div className="flex w-full items-center">
                    <span className="inline-block w-14 flex-shrink-0 font-medium overflow-hidden text-ellipsis whitespace-nowrap">
                      {route_short_name}
                    </span>
                    <span className="ml-1.5 flex-grow overflow-hidden text-ellipsis whitespace-nowrap text-zinc-300 group-hover:text-white transition-colors text-xs">
                      {route_long_name}
                    </span>
                    {isOptimized && (
                      <span className="ml-1.5 bg-green-500/20 text-green-400 text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        <span className="text-[10px]">Opt</span>
                      </span>
                    )}
                  </div>
                </button>
              </div>
            );
          })
        ) : (
          <div className="p-3 text-center text-zinc-400 text-sm">
            {searchQuery ? (
              <div>
                <p>No routes match "{searchQuery}"</p>
                <button 
                  onClick={() => setSearchQuery('')}
                  className="mt-1.5 text-accent-1 hover:underline focus:outline-none text-xs"
                >
                  Clear search
                </button>
              </div>
            ) : (
              <p>No routes available</p>
            )}
          </div>
        )}
      </div>

      {/* Route count display with optimized count */}
      <div className="text-xs text-zinc-500 py-2 px-2 border-t border-zinc-800/50 mt-auto flex justify-between items-center">
        <div>
          <span>{sortedRoutes.length}</span> {sortedRoutes.length === 1 ? 'route' : 'routes'} 
          {searchQuery && routes.length !== sortedRoutes.length && (
            <span className="text-zinc-600"> (filtered from {routes.length})</span>
          )}
        </div>
        {optimizedCount > 0 && (
          <div className="flex items-center text-green-400">
            <span className="block h-1.5 w-1.5 rounded-full bg-green-500 mr-1"></span>
            <span>{optimizedCount} optimized</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default RouteList;
