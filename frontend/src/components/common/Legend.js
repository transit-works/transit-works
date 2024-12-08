import React from "react";

function Legend({ items }) {
  return (
    <div className="flex space-x-4 items-center">
      {items.map((item, index) => (
        <div key={index} className="flex items-center space-x-2 group relative">
          {/* Circle with dynamic color */}
          <div
            className={`w-3 h-3 rounded-full ${item.color}`}
            aria-label={`${item.name} Circle`}
           />

          {/* Label */}
          <span className="text-sm text-white font-heading">{item.name}</span>

          {/* Tooltip */}
          <span className="absolute opacity-0 group-hover:opacity-100 transition-opacity bg-gray-700 text-white text-xs rounded-md p-1 -mt-8 ml-4 whitespace-nowrap">
            {item.tooltip}
          </span>
        </div>
      ))}
    </div>
  );
}

export default Legend;
