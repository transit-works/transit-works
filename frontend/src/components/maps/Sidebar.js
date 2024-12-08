import React, { useState } from 'react';
import Link from 'next/link';
import ProgressDial from '@/components/visualization/ProgressDial';
import RouteList from '@/components/transit/RouteList';
import SidebarReport from '@/components/views/ExpandedSidebarView';
import ImageButton from '@/components/common/ImageButton';
import MiniTable from '@/components/visualization/MiniTable';

function Sidebar({ data, selectedRoute, setSelectedRoute }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleSidebar = () => {
    setIsExpanded(!isExpanded);
  };

  const closeExpandedSection = () => {
    setIsExpanded(false);
  };

  return (
    <div className="flex flex-col relative h-screen">
      {/* Sidebar Section */}
      <div
        className={`flex flex-col h-full p-3 transition-all duration-300 bg-background-light`}
      >
        {/* Expand Button */}
        <div className="flex flex-row items-center justify-between pl-2 pb-3 pt-1">
          <h2 className="text-xl font-heading leading-none text-white">Toronto</h2>
          <button
            onClick={toggleSidebar}
            className="px-2 text-right hover:text-accent text-white font-body text-xs leading-none"
          >
            {isExpanded ? '< Close Details' : 'View Details >'}
          </button>
        </div>

        {/* Progress Dial Section */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-background-dk border-zinc-800 border rounded-2xl py-2">
            <ProgressDial percentage={68} name="Transit Score" />
          </div>
          <div className="bg-background-dk border-zinc-800 border rounded-2xl py-2">
            <ProgressDial percentage={77} name="Economic Score" />
          </div>
        </div>

        {/* Legend */}
        <MiniTable />

        {/* Routes Section */}
        <div
          className="px-2 pb-2 my-2 bg-background-dk border-zinc-800 border rounded-2xl custom-scrollbar custom-scrollbar-container overflow-y-auto max-h-[calc(100vh-200px)]">
          <RouteList data={data} selectedRoute={selectedRoute} setSelectedRoute={setSelectedRoute} />
        </div>

        {/* Buttons at the Bottom */}
        <ImageButton text="Optimize" imageSrc="/assets/icons/speed.png"
                     onClick={() => console.log("New button clicked")} />
        <div className="flex justify-around pt-2">
          <Link href="/" className="w-full pr-1" passHref>
            <ImageButton text="Home" imageSrc="/assets/icons/home.png" altText="Home icon" />
          </Link>
          <Link href="/" className="w-full pl-1" passHref>
            <ImageButton
              text="New"
              imageSrc="/assets/icons/earth.png"
              altText="Earth Icon"
              onClick={() => console.log("New button clicked")}
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
