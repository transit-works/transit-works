import React, { useState } from 'react';
import Link from 'next/link';
import ProgressDial from '@/components/visualization/ProgressDial';
import RouteList from '@/components/transit/RouteList';
import SidebarReport from '@/components/views/ExpandedSidebarView';
import ImageButton from '@/components/common/ImageButton';
import MiniTable from '@/components/visualization/MiniTable';
import OptimizationProgress from '@/components/visualization/OptimizationProgress';

function Sidebar({ 
  data, 
  selectedRoute, 
  setSelectedRoute, 
  onOptimize, 
  isOptimizing, 
  optimizationError,
  optimizationProgress,
  currentEvaluation,
  useLiveOptimization,
  setUseLiveOptimization
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleSidebar = () => {
    setIsExpanded(!isExpanded);
  };

  const closeExpandedSection = () => {
    setIsExpanded(false);
  };

  return (
    <div className="relative flex h-screen flex-col">
      {/* Sidebar Section */}
      <div className="bg-background-light flex h-full flex-col p-3 transition-all duration-300">
        {/* Expand Button */}
        <div className="flex flex-row items-center justify-between pb-3 pl-2 pt-1">
          <h2 className="font-heading text-xl leading-none text-white">Toronto</h2>
          <button
            onClick={toggleSidebar}
            className="px-2 text-right font-body text-xs leading-none text-white hover:text-accent"
          >
            {isExpanded ? '< Close Details' : 'View Details >'}
          </button>
        </div>

        {/* Progress Dial Section */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-zinc-800 bg-background-dk py-2">
            <ProgressDial percentage={68} name="Transit Score" />
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-background-dk py-2">
            <ProgressDial percentage={77} name="Economic Score" />
          </div>
        </div>

        {/* Legend */}
        <MiniTable />

        {/* Routes Section */}
        <div className="custom-scrollbar-container my-2 max-h-[calc(100vh-300px)] overflow-y-auto rounded-2xl border border-zinc-800 bg-background-dk px-2 pb-2 custom-scrollbar">
          <RouteList
            data={data}
            selectedRoute={selectedRoute}
            setSelectedRoute={setSelectedRoute}
          />
        </div>
        
        {/* Live Optimization Toggle */}
        <div className="mt-2 mb-1 flex items-center justify-between px-2">
          <span className="text-xs text-white">Live Optimization</span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              checked={useLiveOptimization} 
              onChange={() => setUseLiveOptimization(!useLiveOptimization)} 
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent"></div>
          </label>
        </div>
        
        {/* Optimization Progress Bar - Only show when optimizing */}
        {isOptimizing && useLiveOptimization && (
          <div className="mt-1 mb-2 px-2">
            <OptimizationProgress 
              progress={optimizationProgress} 
              currentEvaluation={currentEvaluation}
            />
          </div>
        )}

        {/* Optimize Button */}
        <ImageButton
          text={isOptimizing ? "Optimizing..." : "Optimize"}
          imageSrc="/assets/icons/speed.png"
          onClick={onOptimize}
          disabled={!selectedRoute || isOptimizing}
          isLoading={isOptimizing}
        />
        
        {/* Show error message if optimization failed */}
        {optimizationError && (
          <div className="mt-1 text-xs text-red-500 text-center">
            {optimizationError}
          </div>
        )}

        <div className="flex justify-around pt-2">
          <Link href="/" className="w-full pr-1" passHref>
            <ImageButton text="Home" imageSrc="/assets/icons/home.png" altText="Home icon" />
          </Link>
          <Link href="city-select" className="w-full pl-1" passHref>
            <ImageButton
              text="New"
              imageSrc="/assets/icons/earth.png"
              altText="Earth Icon"
              onClick={() => console.log('New button clicked')}
            />
          </Link>
        </div>
      </div>

      {/* Expanded Sidebar Section (conditionally rendered when expanded) */}
      {isExpanded && <SidebarReport onClose={closeExpandedSection} />}
    </div>
  );
}

export default Sidebar;
