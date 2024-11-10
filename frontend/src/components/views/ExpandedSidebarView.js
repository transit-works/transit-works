import React from 'react';
import ProgressBar from '@/components/visualization/ProgressBar';
import Legend from '@/components/common/Legend';

function ExpandedSection({ onClose }) {
  const legendItems = [
    { name: "Base Values", tooltip: "Values before optimization", color: "bg-orange-400" },
    { name: "Optimized Values", tooltip: "Values after optimization", color: "bg-blue-500" }
  ];

  const tableData = [
    { label: "Bus Routes", value1: 120, value2: 130, tooltip: "The total number of bus routes in the system" },
    { label: "Bus Stops", value1: 300, value2: 290, tooltip: "The total number of bus stops across all routes" },
    { label: "Bike Routes", value1: 80, value2: 95, tooltip: "The total number of bike routes available", borderBottom: true },
    { label: "Cost", value1: 5000, value2: 4800, tooltip: "The total operating cost of the transit system" },
    { label: "Fuel Efficiency", value1: 15, value2: 17, tooltip: "The fuel efficiency (miles per gallon) of the fleet" },
    { label: "Average Ridership", value1: 400, value2: 420, tooltip: "The average number of riders using the system daily" }
  ];

  // Calculate the percentage difference between base and optimized values
  const calculateDiff = (value1, value2) => {
    return ((value2 - value1) / value1 * 100).toFixed(2); // Returns the diff with 2 decimal points
  };

  return (
    <div className="fixed top-0 left-full w-[50vw] h-full p-5 bg-background-dk rounded-2x">
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white text-2xl hover:text-accent"
      >
        &times; {/* X button */}
      </button>
      <h3 className="text-white font-heading text-3xl mb-32">Detailed Overview</h3>
      <Legend items={legendItems} />
      <div className="flex flex-row text-white mt-2">
        <ProgressBar percentage="70" name="Transit Score" startColor="#f43f5e" endColor="#fb923c" />
        <ProgressBar percentage="20" name="Economic Score" startColor="#f43f5e" endColor="#fb923c" />
        <ProgressBar percentage="90" name="Transit Score" startColor="#7231ec" endColor="#1fd2fb" />
        <ProgressBar percentage="44" name="Economic Score" startColor="#7231ec" endColor="#1fd2fb" />
      </div>

      {/* Table with Headers */}
      <div className="mt-10 mx-4">
        <table className="w-full text-white text-left">
          <thead>
          <tr className="border-b border-zinc-700 text-sm font-logo tracking-wider">
            <th className="py-1 px-2" title="Category of the metric">Metric</th>
            <th className="py-1 px-2 text-center" title="Initial value before changes">Base Value</th>
            <th className="py-1 px-2 text-center" title="Value after optimization">Optimized Value</th>
            <th className="py-1 px-2 text-right" title="Percentage difference between base and optimized values">% Diff</th>
            <th className="py-1 px-2 text-center" title="Increase or decrease indicator">Trend</th>
          </tr>
          </thead>
          <tbody className="font-body text-sm">
          {tableData.map((row, index) => {
            const { borderBottom = false } = row; // Default to false if borderBottom is not provided
            const diff = calculateDiff(row.value1, row.value2); // Calculate the diff dynamically
            const isPositiveDiff = diff >= 0;
            return (
              <tr
                key={index}
                className={`${borderBottom ? 'border-b border-zinc-700' : ''}`}
              >
                <td className="py-1" title={row.tooltip}>{row.label}</td>
                <td className="py-1 text-center" title="Value before optimization">{row.value1}</td>
                <td className="py-1 text-center" title="Value after optimization">{row.value2}</td>
                <td className={`py-1 text-right ${isPositiveDiff ? 'text-green-500' : 'text-red-500'}`} title="Percentage difference">
                  {diff}%
                </td>
                <td className="py-1 text-center" title={isPositiveDiff ? "The metric has increased" : "The metric has decreased"}>
                  {isPositiveDiff ? (
                    <span className="text-green-500">&#9650;</span> // Up arrow
                  ) : (
                    <span className="text-red-500">&#9660;</span> // Down arrow
                  )}
                </td>
              </tr>
            );
          })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ExpandedSection;
