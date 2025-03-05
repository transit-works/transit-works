import React, { useState } from 'react';
import Link from 'next/link';
import ProgressDial from '@/components/visualization/ProgressDial';
import RouteList from '@/components/transit/RouteList';
import SidebarReport from '@/components/views/ExpandedSidebarView';
import ImageButton from '@/components/common/ImageButton';
import { FaBuilding, FaLayerGroup, FaPalette, FaFireAlt } from 'react-icons/fa';

function Sidebar({ 
  data, 
  selectedRoutes,
  setSelectedRoutes,
  onOptimize, 
  isOptimizing, 
  optimizationError,
  // Add new map control props
  mapStyle,
  show3DRoutes,
  useRandomColors,
  showPopulationHeatmap,
  onToggleMapStyle,
  onToggle3DRoutes,
  onToggleRandomColors,
  onTogglePopulationHeatmap
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
            <ProgressDial percentage={20} name="Transit Score" />
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-background-dk py-2">
            <ProgressDial percentage={37} name="Economic Score" />
          </div>
        </div>

        {/* Map Control Section - new section */}
        <div className="mt-3 mb-2">
          <div className="flex justify-center gap-3">
            {/* 3D Buildings Toggle */}
            <div className="relative group">
              <button
                className={`w-11 h-11 ${
                  mapStyle === '/styles/dark_matter_3d.json' ? 'bg-primary' : 'bg-zinc-900'
                } hover:bg-white hover:text-black backdrop-blur-sm text-white rounded-full flex items-center justify-center focus:outline-none border border-zinc-600`}
                onClick={onToggleMapStyle}
                aria-label="Toggle map style"
              >
                <FaBuilding className="text-lg" />
              </button>
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-max px-2 py-1 bg-black/70 backdrop-blur-sm text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200">
                3D Buildings
              </div>
            </div>
            
            {/* Layered Routes Toggle */}
            <div className="relative group">
              <button
                className={`w-11 h-11 ${
                  show3DRoutes ? 'bg-primary' : 'bg-zinc-900'
                } hover:bg-white hover:text-black backdrop-blur-sm text-white rounded-full flex items-center justify-center focus:outline-none border border-zinc-600`}
                onClick={onToggle3DRoutes}
                aria-label="Toggle route visualization"
              >
                <FaLayerGroup className="text-lg" />
              </button>
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-max px-2 py-1 bg-black/70 backdrop-blur-sm text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200">
                Layered Routes
              </div>
            </div>
            
            {/* Random Colors Toggle */}
            <div className="relative group">
              <button
                className={`w-11 h-11 ${
                  useRandomColors ? 'bg-accent' : 'bg-zinc-900'
                } hover:bg-white hover:text-black backdrop-blur-sm text-white rounded-full flex items-center justify-center focus:outline-none border border-zinc-600`}
                onClick={onToggleRandomColors}
                aria-label="Toggle random route colors"
              >
                <FaPalette className="text-lg" />
              </button>
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-max px-2 py-1 bg-black/70 backdrop-blur-sm text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200">
                Random Colors
              </div>
            </div>
            
            {/* Population Heatmap Toggle */}
            <div className="relative group">
              <button
                className={`w-11 h-11 ${
                  showPopulationHeatmap ? 'bg-accent' : 'bg-zinc-900'
                } hover:bg-white hover:text-black backdrop-blur-sm text-white rounded-full flex items-center justify-center focus:outline-none border border-zinc-600`}
                onClick={onTogglePopulationHeatmap}
                aria-label="Toggle population heatmap"
              >
                <FaFireAlt className="text-lg" />
              </button>
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-max px-2 py-1 bg-black/70 backdrop-blur-sm text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200">
                Population Heatmap
              </div>
            </div>
          </div>
        </div>

        {/* Routes Section */}
        <div className="custom-scrollbar-container my-2 max-h-[calc(100vh-300px)] overflow-y-auto rounded-2xl border border-zinc-800 bg-background-dk px-2 pb-2 custom-scrollbar">
          <RouteList
            data={data}
            selectedRoutes={selectedRoutes}
            setSelectedRoutes={setSelectedRoutes}
          />
        </div>
        
        {/* Optimize Button */}
        <ImageButton
          text={isOptimizing ? "Optimizing..." : "Optimize"}
          imageSrc="/assets/icons/speed.png"
          onClick={onOptimize}
          disabled={selectedRoutes?.size === 0 || isOptimizing}
          isLoading={isOptimizing}
        />
        
        {/* Show number of selected routes */}
        {selectedRoutes?.size > 0 && (
          <div className="mt-1 text-xs text-white text-center">
            {selectedRoutes.size} route{selectedRoutes.size > 1 ? 's' : ''} selected
          </div>
        )}
        
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
