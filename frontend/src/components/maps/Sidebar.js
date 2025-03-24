import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import ProgressDial from '@/components/visualization/ProgressDial';
import RouteList from '@/components/transit/RouteList';
import SidebarReport from '@/components/views/ExpandedSidebarView';
import ImageButton from '@/components/common/ImageButton';
import { fetchFromAPI } from '@/utils/api';
// Import the icons
import { FaBuilding, FaLayerGroup, FaPalette, FaFireAlt, FaPlus, FaSubway, FaPaintBrush, FaTrain, FaBusAlt } from 'react-icons/fa';

function Sidebar({ 
  data, 
  selectedRoutes,
  setSelectedRoutes,
  selectedRoute, 
  setSelectedRoute, 
  onOptimize, 
  isOptimizing, 
  optimizationError,
  optimizedRoutes,
  mapStyle,
  show3DRoutes,
  useRandomColors,
  showPopulationHeatmap,
  onToggleMapStyle,
  onToggle3DRoutes,
  onToggleRandomColors,
  onTogglePopulationHeatmap,
  multiSelectMode,
  optimizationProgress,
  currentEvaluation,
  useLiveOptimization,
  setUseLiveOptimization,
  websocketData,
  earlyConvergedRoutes,
  colorByRouteType,
  onToggleRouteTypeColors,
  showCoverageHeatmap,
  onToggleCoverageHeatmap,
  city,
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showExtraControls, setShowExtraControls] = useState(false);
  const [networkData, setNetworkData] = useState(null);
  const [networkLoading, setNetworkLoading] = useState(true);

  const toggleSidebar = () => {
    setIsExpanded(!isExpanded);
  };

  const closeExpandedSection = () => {
    setIsExpanded(false);
  };

  // Automatically deactivate "More Controls" when "View Details" is open
  useEffect(() => {
    if (isExpanded) {
      setShowExtraControls(false);
    }
  }, [isExpanded]);
  
  // Fetch network evaluation data
  useEffect(() => {
    const fetchNetworkData = async () => {
      try {
        setNetworkLoading(true);
        const data = await fetchFromAPI('/evaluate-network', {}, city);
        if (data && data.original && data.optimized) {
          setNetworkData(data);
          console.log('Network evaluation data:', data);
        }
      } catch (error) {
        console.error(`Failed to fetch network evaluation data:`, error);
      } finally {
        setNetworkLoading(false);
      }
    };
    
    fetchNetworkData();
  }, [city]);

  return (
    <div className="relative flex h-screen flex-col">
      {/* Sidebar Section */}
      <div className="bg-background-light flex h-full flex-col p-3 transition-all duration-300">
        {/* Expand Button */}
        <div className="flex flex-row items-center justify-between pb-3 pl-2 pt-1">
          <h2 className="font-heading text-xl leading-none text-white">
            {city.charAt(0).toUpperCase() + city.slice(1)} {/* Display capitalized city name */}
          </h2>
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
            <ProgressDial 
              percentage={networkData ? Math.round(networkData.optimized.transit_score) : 82}
              name="Transit Score" 
            />
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-background-dk py-2">
            <ProgressDial 
              percentage={networkData ? Math.round(networkData.optimized.economic_score) : 77}
              name="Economic Score" 
            />
          </div>
        </div>

        {/* Map Control Section */}
        <div className="mt-3 mb-2">
          <div className="flex justify-center gap-2">
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
            
            {/* More Controls Toggle */}
            <div className="relative group">
              <button
                className={`w-11 h-11 ${
                  showExtraControls ? 'bg-primary' : 'bg-zinc-900'
                } hover:bg-white hover:text-black backdrop-blur-sm text-white rounded-full flex items-center justify-center focus:outline-none border border-zinc-600`}
                onClick={() => setShowExtraControls(!showExtraControls)}
                aria-label="Toggle extra controls"
              >
                <FaPlus className="text-lg" />
              </button>
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-max px-2 py-1 bg-black/70 backdrop-blur-sm text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200">
                More Controls
              </div>
            </div>
          </div>
          
          {/* Expandable controls panel with frosted glass effect */}
          {showExtraControls && (
            <div className="absolute left-full top-[200px] bg-background-light bg-opacity-20 backdrop-blur-lg border border-l-0 border-zinc-800 rounded-r-xl p-3 shadow-lg transition-all duration-300 z-20">
              <div className="flex flex-col gap-3">
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
                  <div className="absolute right-full top-1/2 transform -translate-y-1/2 mr-2 w-max px-2 py-1 bg-black/70 backdrop-blur-sm text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200">
                    Random Colors
                  </div>
                </div>
                
                {/* Route Type Colors Toggle */}
                <div className="relative group">
                  <button
                    className={`w-11 h-11 ${
                      colorByRouteType ? 'bg-primary' : 'bg-zinc-900'
                    } hover:bg-white hover:text-black backdrop-blur-sm text-white rounded-full flex items-center justify-center focus:outline-none border border-zinc-600`}
                    onClick={onToggleRouteTypeColors}
                    aria-label="Toggle route type colors"
                  >
                    <FaTrain className="text-lg" /> {/* Changed from FaSubway to FaTrain */}
                  </button>
                  <div className="absolute right-full top-1/2 transform -translate-y-1/2 mr-2 w-max px-2 py-1 bg-black/70 backdrop-blur-sm text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200">
                    Route Type Colors
                  </div>
                </div>

                {/* Coverage Heatmap Toggle */}
                <div className="relative group">
                  <button
                    className={`w-11 h-11 ${
                      showCoverageHeatmap ? 'bg-accent' : 'bg-zinc-900'
                    } hover:bg-white hover:text-black backdrop-blur-sm text-white rounded-full flex items-center justify-center focus:outline-none border border-zinc-600`}
                    onClick={onToggleCoverageHeatmap}
                    aria-label="Toggle coverage heatmap"
                  >
                    <FaBusAlt className="text-lg" />
                  </button>
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-max px-2 py-1 bg-black/70 backdrop-blur-sm text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200">
                    Coverage Heatmap
                  </div>
                </div>
                
              </div>
            </div>
          )}
        </div>

        {/* Rest of sidebar content remains the same */}
        <div className="custom-scrollbar-container my-2 max-h-[calc(100vh-300px)] overflow-y-auto rounded-2xl border border-zinc-800 bg-background-dk px-2 pb-2 custom-scrollbar">
          <RouteList
            data={data}
            selectedRoutes={selectedRoutes}
            setSelectedRoutes={setSelectedRoutes}
            selectedRoute={selectedRoute} 
            setSelectedRoute={setSelectedRoute} 
            multiSelectMode={multiSelectMode} 
            optimizedRoutes={optimizedRoutes}
          />
        </div>
        
        <ImageButton
          text={isOptimizing ? "Optimizing..." : "Optimize"}
          imageSrc="/assets/icons/speed.png"
          onClick={onOptimize}
          disabled={selectedRoutes?.size === 0 || isOptimizing}
          isLoading={isOptimizing}
        />

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

      {isExpanded && <SidebarReport onClose={closeExpandedSection} cityName={city} isVisible={isExpanded} />}
    </div>
  );
}

export default Sidebar;
