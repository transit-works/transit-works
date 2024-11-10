function RouteList({ data, selectedRoute, setSelectedRoute }) {
  const handleClick = (id) => {
    setSelectedRoute((prevSelectedRoute) =>
      prevSelectedRoute === id ? null : id
    );
  };

  return (
    <div>
      <div className="flex flex-row sticky top-0 bg-background-dk py-1">
        {/* Heading with a bottom border */}
        <h2 className="text-white text-md font-heading w-16">Route</h2>
        <h2 className="text-white text-md font-heading ml-2">Route Name</h2>
      </div>
      {data?.features
        ?.filter((feature) => feature.geometry.type !== 'Point')
        .map((route) => {
          const { route_id, route_short_name, route_long_name } = route.properties;
          const isSelected = selectedRoute === route_id;

          return (
            <div key={route_id} className="flex items-center w-full text-left">
              {isSelected && (
                <div className="w-2 h-2 mt-1 bg-accent-1 rounded-full mr-2" />
              )}
              <button
                type="button"
                onClick={() => handleClick(route_id)}
                aria-pressed={isSelected}
                title={route_long_name} // Tooltip for the full route name
                className={`text-white text-xs text-left pt-1 hover:text-accent-1 hover:cursor-pointer w-full`}
              >
                <div className="flex items-center w-full">
                  <span className="inline-block w-16 whitespace-nowrap overflow-hidden text-ellipsis flex-shrink-0">
                    {route_short_name}
                  </span>
                  <span className="ml-2 whitespace-nowrap overflow-hidden text-ellipsis flex-grow">
                    {route_long_name}
                  </span>
                </div>
              </button>
            </div>
          );
        })}
      {(data?.features?.length === 0) && (
        <p className="text-white p-2">No routes available</p>
      )}
    </div>
  );
}

export default RouteList;
