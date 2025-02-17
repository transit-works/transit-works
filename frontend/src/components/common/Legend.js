import React from 'react';

function Legend({ items }) {
  return (
    <div className="flex items-center space-x-4">
      {items.map((item, index) => (
        <div key={index} className="group relative flex items-center space-x-2">
          {/* Circle with dynamic color */}
          <div
            className={`h-3 w-3 rounded-full ${item.color}`}
            aria-label={`${item.name} Circle`}
          />

          {/* Label */}
          <span className="font-heading text-sm text-white">{item.name}</span>

          {/* Tooltip */}
          <span className="absolute -mt-8 ml-4 whitespace-nowrap rounded-md bg-gray-700 p-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
            {item.tooltip}
          </span>
        </div>
      ))}
    </div>
  );
}

export default Legend;
