import React, { useMemo } from 'react';
import { FaTimes } from 'react-icons/fa';
import { routeTypeData, routeTypeColorsRGB } from '../../../utils/routeTypeColors';

function RouteColorLegend({ isVisible, onClose, useRandomColors, toggleRandomColors, data }) {
  if (!isVisible) return null;
  
  // Extract unique route types actually present in the map data
  const displayedRouteTypes = useMemo(() => {
    if (!data || !data.features) return [];
    
    // Get unique route types from the data
    const uniqueTypes = new Set();
    data.features.forEach(feature => {
      if (feature.properties && feature.properties.route_type !== undefined) {
        uniqueTypes.add(feature.properties.route_type);
      }
    });
    
    // Filter and sort route type data based on what's actually in the map
    return [...routeTypeData]
      .filter(item =>
        (uniqueTypes.has(item.type) || uniqueTypes.has(item.type.toString()))
      );
  }, [data]);
  
  // If no route types to display, don't render
  if (displayedRouteTypes.length === 0) return null;

  return (
    <div className="absolute top-4 right-14 z-20 w-auto max-w-[50%] bg-zinc-900/70 backdrop-blur-md px-3 py-2 rounded-md shadow-md">
      <div className="flex justify-between items-start">
        <div className="flex-1 flex flex-wrap gap-2 items-center">
          {displayedRouteTypes.map(item => (
            <div key={item.type} className="flex items-center mb-1">
              <div 
                className="w-3 h-3 rounded-full mr-1 flex-shrink-0" 
                style={{ 
                  backgroundColor: useRandomColors 
                    ? routeTypeColorsRGB.default 
                    : item.color 
                }}
              />
              <span className="text-xs text-white whitespace-nowrap">{item.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default RouteColorLegend;