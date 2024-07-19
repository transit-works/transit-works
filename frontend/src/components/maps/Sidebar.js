function Sidebar({ data, selectedRoute, setSelectedRoute }) {
    const handleClick = (id) => {
        setSelectedRoute(prevSelectedRoute => (prevSelectedRoute === id ? null : id));
    };

    return (
        <div className="flex flex-col h-full w-full">
            <h2 className="text-amber-50 mt-2 text-center">TransitWorks</h2>
            {/* Routes */}
            <h2 className="text-amber-50 mt-3 ml-5">Routes:</h2>
            <div className="m-3 mt-0 p-2 bg-background-dk bg-opacity-20 backdrop-blur-lg rounded-2xl h-full custom-scrollbar custom-scrollbar-container">
                {data.features
                    .filter((feature) => feature.geometry.type !== 'Point')
                    .map((route) => (
                        <div key={route.properties.route_id} className="flex items-center w-full text-left">
                            {selectedRoute === route.properties.route_id && (
                                <div className="w-2 h-2 mt-1 bg-accent-1 rounded-full mr-2" />
                            )}
                            <button
                                type="button"
                                onClick={() => handleClick(route.properties.route_id)}
                                className={`text-white text-xs text-left pt-1 hover:text-accent-1 hover:cursor-pointer w-full ${selectedRoute === route.properties.route_id ? 'font-bold' : ''}`}
                            >
                                {route.properties.route_short_name} - {route.properties.route_long_name}
                            </button>
                            {/* You can add more details as needed */}
                        </div>
                    ))}
                {data.features.length === 0 && (
                    <p className="text-white p-2">No routes available</p>
                )}
            </div>
        </div>
    );
}

export default Sidebar;
