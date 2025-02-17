import React from 'react';

function MiniTable() {
  const busData = [
    { label: 'Bus Routes', count: 100, color: 'bg-accent-1' }, // red circle
    { label: 'Bus Stops', count: 200, color: 'bg-accent-1' }, // green circle
    { label: 'Bike Routes', count: 150, color: 'bg-accent-2' }, // blue circle
  ];

  return (
    <div className="mt-2 w-full rounded-2xl border border-zinc-800 bg-background-dk p-2">
      {busData.map((item, index) => (
        <div key={index} className="flex items-center justify-between">
          <div className="flex-1 font-heading text-sm text-white">{item.label}</div>
          <div className="pr-6 font-heading text-sm text-white">{item.count}</div>
          <div className={`h-3 w-3 rounded-full ${item.color}`} />
        </div>
      ))}
    </div>
  );
}

export default MiniTable;
