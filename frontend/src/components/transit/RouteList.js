function RouteList({ data, selectedRoutes, setSelectedRoutes }) {
  const handleClick = (id) => {
    setSelectedRoutes((prevSelectedRoutes) => {
      // Create a new Set from previous selections
      const newSelectedRoutes = new Set(prevSelectedRoutes);
      
      // Toggle the selection
      if (newSelectedRoutes.has(id)) {
        newSelectedRoutes.delete(id);
      } else {
        newSelectedRoutes.add(id);
      }
      
      return newSelectedRoutes;
    });
  };

  // Get all routes that aren't points
  const routes = data?.features?.filter((feature) => feature.geometry.type !== 'Point') || [];
  
  // Separate into selected and unselected routes while preserving original order
  const selectedRoutesArray = [];
  const unselectedRoutesArray = [];
  
  routes.forEach(route => {
    if (selectedRoutes?.has(route.properties.route_id)) {
      selectedRoutesArray.push(route);
    } else {
      unselectedRoutesArray.push(route);
    }
  });
  
  // Combine arrays: selected routes first, then unselected
  const sortedRoutes = [...selectedRoutesArray, ...unselectedRoutesArray];

  return (
    <div>
      <div className="sticky top-0 flex flex-row bg-background-dk py-1">
        {/* Heading with a bottom border */}
        <h2 className="text-md w-16 font-heading text-white">Route</h2>
        <h2 className="text-md ml-2 font-heading text-white">Route Name</h2>
      </div>
      {sortedRoutes.map((route) => {
        const { route_id, route_short_name, route_long_name } = route.properties;
        const isSelected = selectedRoutes?.has(route_id);

        return (
          <div key={route_id} className="flex w-full items-center text-left">
            {isSelected && <div className="mr-2 mt-1 h-2 w-2 rounded-full bg-accent-1" />}
            <button
              type="button"
              onClick={() => handleClick(route_id)}
              aria-pressed={isSelected}
              title={route_long_name} // Tooltip for the full route name
              className={`w-full pt-1 text-left text-xs ${isSelected ? 'text-accent-1' : 'text-white'} hover:cursor-pointer hover:text-accent-1`}
            >
              <div className="flex w-full items-center">
                <span className="inline-block w-16 flex-shrink-0 overflow-hidden text-ellipsis whitespace-nowrap">
                  {route_short_name}
                </span>
                <span className="ml-2 flex-grow overflow-hidden text-ellipsis whitespace-nowrap">
                  {route_long_name}
                </span>
              </div>
            </button>
          </div>
        );
      })}
      {data?.features?.length === 0 && <p className="p-2 text-white">No routes available</p>}
    </div>
  );
}

export default RouteList;
