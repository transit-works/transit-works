import React, { useState } from 'react';
import Link from 'next/link';
import ProgressDial from '@/components/visualization/ProgressDial';
import RouteList from '@/components/transit/RouteList';
import SidebarReport from '@/components/views/ExpandedSidebarView';
import ImageButton from '@/components/common/ImageButton';
import MiniTable from '@/components/visualization/MiniTable';

function Sidebar({ data, selectedRoute, setSelectedRoute, onOptimize, isOptimizing, optimizationError }) {
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
        <div className="custom-scrollbar-container my-2 max-h-[calc(100vh-200px)] overflow-y-auto rounded-2xl border border-zinc-800 bg-background-dk px-2 pb-2 custom-scrollbar">
          <RouteList
            data={data}
            selectedRoute={selectedRoute}
            setSelectedRoute={setSelectedRoute}
          />
        </div>

        {/* Optimize Button */}
        <ImageButton
          text={isOptimizing ? "Optimizing..." : "Optimize"}
          imageSrc="/assets/icons/speed.png"
          onClick={onOptimize}
          disabled={!selectedRoute || isOptimizing}
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
          <Link href="/" className="w-full pl-1" passHref>
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
