import React, { useState, useEffect } from 'react';
import ProgressBar from '@/components/visualization/ProgressBar';
import { fetchFromAPI } from '@/utils/api';

function ExpandedSection({ onClose, cityName, isVisible = true }) {
  const [cityData, setCityData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rankedRoutes, setRankedRoutes] = useState([]);
  const [routesLoading, setRoutesLoading] = useState(true);
  const [networkData, setNetworkData] = useState(null);
  const [networkLoading, setNetworkLoading] = useState(true);
  
  // Fetch city data based on city name
  useEffect(() => {
    const fetchCityData = async () => {
      try {
        const response = await fetch('/data/city_stats.json');
        const data = await response.json();
        const city = data.find(c => c.key.toLowerCase() === cityName.toLowerCase());
        setCityData(city);
        setLoading(false);
      } catch (error) {
        console.error("Failed to fetch city data:", error);
        setLoading(false);
      }
    };
    
    fetchCityData();
  }, [cityName]);
  
  // Fetch network evaluation data
  useEffect(() => {
    if (!isVisible) return;
    
    const fetchNetworkData = async () => {
      try {
        console.log(`Fetching network evaluation data for ${cityName}...`);
        setNetworkLoading(true);
        const data = await fetchFromAPI('/evaluate-network', {}, cityName);
        if (data && data.original && data.optimized) {
          setNetworkData(data);
          console.log('Network evaluation data:', data);
        } else {
          console.log("No network evaluation data returned from API");
        }
      } catch (error) {
        console.error(`Failed to fetch network evaluation data for ${cityName}:`, error);
      } finally {
        setNetworkLoading(false);
      }
    };
    
    fetchNetworkData();
  }, [cityName, isVisible]);
  
  useEffect(() => {
    // Only perform fetch if the sidebar is visible
    if (!isVisible) {
      return;
    }
    
    const fetchRankedRoutes = async () => {
      try {
        console.log(`Fetching ranked route improvements for ${cityName}...`);
        setRoutesLoading(true);
        const data = await fetchFromAPI('/rank-route-improvements', {}, cityName);
        if (data && data.ranked_routes) {
          const formattedRoutes = data.ranked_routes.map(route => ({
            id: route.route_id,
            name: route.route_long_name || route.route_id,
            improvement: route.improvement,
            current: route.score_before,
            optimized: route.score_after
          }));
          setRankedRoutes(formattedRoutes);
          console.log(`Fetched ${formattedRoutes.length} optimized routes for ${cityName}`);
        } else {
          console.log("No ranked routes data returned from API");
          setRankedRoutes([]);
        }
      } catch (error) {
        console.error(`Failed to fetch ranked routes for ${cityName}:`, error);
        setRankedRoutes([]);
      } finally {
        setRoutesLoading(false);
      }
    };
    
    fetchRankedRoutes();
  }, [cityName, isVisible]);

  // Calculate improvement percentages for the Key Improvement Cards if network data is available
  const getImprovementData = () => {
    if (!networkData) return {
      coverage: 0,
      ridership: 0,
      transfers: 0,
    };
    
    const { original, optimized } = networkData;
    const coverageImprovement = ((optimized.coverage - original.coverage) / original.coverage) * 100;
    const ridershipImprovement = ((optimized.avg_ridership - original.avg_ridership) / original.avg_ridership) * 100;
    // For transfers, a decrease is an improvement so we negate the value
    const transfersImprovement = ((original.avg_transfers - optimized.avg_transfers) / original.avg_transfers) * 100;
    
    return {
      coverage: parseFloat(coverageImprovement.toFixed(1)),
      ridership: parseFloat(ridershipImprovement.toFixed(1)),
      transfers: parseFloat(transfersImprovement.toFixed(1)),
    };
  };
  
  const improvements = getImprovementData();

  if (loading) {
    return (
      <div className="rounded-lg fixed left-full top-0 h-full w-[50vw] bg-background-dk p-6 flex items-center justify-center">
        <div className="text-white text-lg">Loading city data...</div>
      </div>
    );
  }

  if (!cityData) {
    return (
      <div className="rounded-lg fixed left-full top-0 h-full w-[50vw] bg-background-dk p-6 flex items-center justify-center">
        <div className="text-white text-lg">City data not found</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg fixed left-full top-0 h-full w-[50vw] bg-background-dk p-6 overflow-y-auto">
      {/* Header with City Info */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <div className="flex items-center">
            <h2 className="font-heading text-3xl text-white">{cityData.name}</h2>
            <span className="ml-3 px-3 py-1 bg-zinc-700/50 text-zinc-300 text-xs rounded-full">
              {cityData.country}
            </span>
          </div>
          <div className="mt-2 text-zinc-400 text-sm flex items-center gap-4">
            <span className="flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
              </svg>
              {cityData.population.toLocaleString()} residents
            </span>
            <span className="flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
              {cityData.population_density}/km² density
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-full bg-zinc-700/50 hover:bg-zinc-600 p-2 text-white transition-colors"
          aria-label="Close panel"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      {/* Current vs Optimized Score Overview */}
      <div className="bg-gradient-to-br from-zinc-800/80 to-zinc-900/60 rounded-lg p-5 border border-zinc-700 shadow-lg mb-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-white font-medium">Transit Performance</h3>
          <div className="flex items-center gap-4">
            <span className="flex items-center">
              <span className="w-3 h-3 rounded-full bg-gradient-to-r from-[#f43f5e] to-[#fb923c] mr-2"></span>
              <span className="text-zinc-400 text-sm">Current</span>
            </span>
            <span className="flex items-center">
              <span className="w-3 h-3 rounded-full bg-gradient-to-r from-[#7231ec] to-[#1fd2fb] mr-2"></span>
              <span className="text-zinc-400 text-sm">Optimized</span>
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-zinc-300 text-sm">Transit Score</span>
              {networkData && (
                <span className="text-green-500 text-sm">
                  +{((networkData.optimized.transit_score - networkData.original.transit_score) / networkData.original.transit_score * 100).toFixed(1)}%
                </span>
              )}
            </div>
            <ProgressBar 
              percentage={networkData ? networkData.original.transit_score.toFixed(0) : cityData.transitScore.toString()} 
              name="Current" 
              startColor="#f43f5e" 
              endColor="#fb923c" 
            />
            <ProgressBar 
              percentage={networkData ? networkData.optimized.transit_score.toFixed(0) : (cityData.transitScore * 1.24).toFixed(0)} 
              name="Optimized" 
              startColor="#7231ec" 
              endColor="#1fd2fb" 
            />
          </div>
          
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-zinc-300 text-sm">Economic Score</span>
              {networkData && (
                <span className="text-green-500 text-sm">
                  +{((networkData.optimized.economic_score - networkData.original.economic_score) / networkData.original.economic_score * 100).toFixed(1)}%
                </span>
              )}
            </div>
            <ProgressBar 
              percentage={networkData ? networkData.original.economic_score.toFixed(0) : cityData.economicScore.toString()} 
              name="Current" 
              startColor="#f43f5e" 
              endColor="#fb923c" 
            />
            <ProgressBar 
              percentage={networkData ? networkData.optimized.economic_score.toFixed(0) : (cityData.economicScore * 1.18).toFixed(0)} 
              name="Optimized" 
              startColor="#7231ec" 
              endColor="#1fd2fb" 
            />
          </div>
        </div>
      </div>
      
      {/* Key Improvement Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-br from-zinc-800/80 to-zinc-900/60 rounded-lg p-5 border border-zinc-700 shadow-lg">
          <div className="flex items-center mb-3">
            <div className="rounded-full bg-purple-500/20 p-2 mr-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-purple-400" viewBox="0 0 20 20" fill="currentColor">
                <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1v-5h2.05a2.5 2.5 0 014.9 0H19a1 1 0 001-1v-5a1 1 0 00-1-1H3z" />
              </svg>
            </div>
            <h3 className="text-zinc-300 text-sm font-medium">Coverage</h3>
          </div>
          <div className="flex items-baseline">
            <span className="text-3xl font-bold text-white">+{networkLoading ? "..." : improvements.coverage}%</span>
            <span className="ml-2 text-purple-400 text-sm">↑ Improved</span>
          </div>
        </div>
        <div className="bg-gradient-to-br from-zinc-800/80 to-zinc-900/60 rounded-lg p-5 border border-zinc-700 shadow-lg">
          <div className="flex items-center mb-3">
            <div className="rounded-full bg-green-500/20 p-2 mr-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
              </svg>
            </div>
            <h3 className="text-zinc-300 text-sm font-medium">Ridership</h3>
          </div>
          <div className="flex items-baseline">
            <span className="text-3xl font-bold text-white">+{networkLoading ? "..." : improvements.ridership}%</span>
            <span className="ml-2 text-green-500 text-sm">↑ Higher</span>
          </div>
        </div>
        <div className="bg-gradient-to-br from-zinc-800/80 to-zinc-900/60 rounded-lg p-5 border border-zinc-700 shadow-lg">
          <div className="flex items-center mb-3">
            <div className="rounded-full bg-blue-500/20 p-2 mr-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5 3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2H5zm0 2h10v7h-2l-1 2H8l-1-2H5V5z" clipRule="evenodd" />
              </svg>
            </div>
            <h3 className="text-zinc-300 text-sm font-medium">Avg Transfers</h3>
          </div>
          <div className="flex items-baseline">
            <span className="text-3xl font-bold text-white">{networkLoading ? "..." : (improvements.transfers >= 0 ? "+" : "")}{improvements.transfers}%</span>
            <span className="ml-2 text-blue-400 text-sm">{improvements.transfers >= 0 ? "↓ Fewer" : "↑ More"}</span>
          </div>
        </div>
      </div>
      
      {/* Leaderboard Section - Updated to use API data */}
      <div className="bg-gradient-to-br from-zinc-800/80 to-zinc-900/60 rounded-lg p-5 border border-zinc-700 shadow-lg mb-6">
        <h3 className="font-medium text-white mb-4">
          Top Routes by Improvement
          {routesLoading && (
            <span className="ml-2 text-xs text-zinc-400">(refreshing...)</span>
          )}
        </h3>
        <div className="overflow-hidden rounded-lg border border-zinc-700">
          {routesLoading ? (
            <div className="p-6 text-center text-zinc-400">
              <svg className="animate-spin h-5 w-5 mx-auto mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Loading route improvements...
            </div>
          ) : rankedRoutes.length === 0 ? (
            <div className="p-6 text-center text-zinc-400">
              <div className="mb-2">No optimized routes available</div>
              <div className="text-xs">Select and optimize routes from the sidebar to see improvements here</div>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-zinc-800 text-xs uppercase text-zinc-400">
                  <th className="px-4 py-2 text-left">Route</th>
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-right">Improvement</th>
                  <th className="px-4 py-2 text-center">Before/After</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-700">
                {rankedRoutes.slice(0, 5).map((route, index) => (
                  <tr key={index} className="hover:bg-zinc-800/40">
                    <td className="px-4 py-3 text-white font-medium">{route.id}</td>
                    <td className="px-4 py-3 text-zinc-300">{route.name}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-green-500 font-medium">+{route.improvement.toFixed(1)}%</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-16 h-2 rounded-full bg-zinc-700 overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-orange-500 to-orange-400"
                            style={{ width: `${route.current}%` }}
                          ></div>
                        </div>
                        <span className="text-xs text-zinc-400">{route.current.toFixed(2)}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M12 1.586l-4 4v12.828l4-4V1.586zM3.707 3.293A1 1 0 002 4v10a1 1 0 00.293.707L6 18.414V5.586L3.707 3.293zM17.707 5.293L14 1.586v12.828l2.293 2.293A1 1 0 0018 16V6a1 1 0 00-.293-.707z" clipRule="evenodd" />
                        </svg>
                        <div className="w-16 h-2 rounded-full bg-zinc-700 overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-blue-500 to-indigo-500"
                            style={{ width: `${route.optimized}%` }}
                          ></div>
                        </div>
                        <span className="text-xs text-zinc-400">{route.optimized.toFixed(2)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default ExpandedSection;
