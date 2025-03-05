import React, { useState, useEffect } from 'react';
import ProgressBar from '@/components/visualization/ProgressBar';

function ExpandedSection({ onClose, cityName = "Toronto" }) {
  const [cityData, setCityData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Fetch city data based on city name
  useEffect(() => {
    const fetchCityData = async () => {
      try {
        const response = await fetch('/data/city_stats.json');
        const data = await response.json();
        const city = data.find(c => c.name === cityName);
        setCityData(city);
        setLoading(false);
      } catch (error) {
        console.error("Failed to fetch city data:", error);
        setLoading(false);
      }
    };
    
    fetchCityData();
  }, [cityName]);
  
  // Sample optimized routes data for leaderboard
  const topOptimizedRoutes = [
    { id: "R-104", name: "Downtown Express", improvement: 37.8, current: 65, optimized: 92 },
    { id: "R-029", name: "East Side Connector", improvement: 29.4, current: 48, optimized: 75 },
    { id: "R-056", name: "University Line", improvement: 24.2, current: 72, optimized: 89 },
    { id: "R-018", name: "Airport Express", improvement: 21.5, current: 58, optimized: 76 },
    { id: "R-033", name: "Waterfront Loop", improvement: 19.7, current: 61, optimized: 73 }
  ];
  
  // Performance metrics that will leverage both current and future optimized data
  const performanceMetrics = [
    {
      name: 'Transit Coverage',
      current: 68,
      optimized: 86,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M12 1.586l-4 4v12.828l4-4V1.586zM3.707 3.293A1 1 0 002 4v10a1 1 0 00.293.707L6 18.414V5.586L3.707 3.293zM17.707 5.293L14 1.586v12.828l2.293 2.293A1 1 0 0018 16V6a1 1 0 00-.293-.707z" clipRule="evenodd" />
        </svg>
      )
    },
    {
      name: 'Service Frequency',
      current: 55,
      optimized: 78,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
        </svg>
      )
    },
    {
      name: 'Cost Efficiency',
      current: 63,
      optimized: 85, 
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
        </svg>
      )
    },
    {
      name: 'Environmental Impact',
      current: 59,
      optimized: 81,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
        </svg>
      )
    }
  ];

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
              <span className="text-green-500 text-sm">+24%</span>
            </div>
            <ProgressBar percentage={cityData.transitScore.toString()} name="Current" startColor="#f43f5e" endColor="#fb923c" />
            <ProgressBar percentage={(cityData.transitScore * 1.24).toFixed(0)} name="Optimized" startColor="#7231ec" endColor="#1fd2fb" />
          </div>
          
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-zinc-300 text-sm">Economic Score</span>
              <span className="text-green-500 text-sm">+18%</span>
            </div>
            <ProgressBar percentage={cityData.economicScore.toString()} name="Current" startColor="#f43f5e" endColor="#fb923c" />
            <ProgressBar percentage={(cityData.economicScore * 1.18).toFixed(0)} name="Optimized" startColor="#7231ec" endColor="#1fd2fb" />
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
            <h3 className="text-zinc-300 text-sm font-medium">Transit Routes</h3>
          </div>
          <div className="flex items-baseline">
            <span className="text-3xl font-bold text-white">+12.6%</span>
            <span className="ml-2 text-purple-400 text-sm">↑ Coverage</span>
          </div>
        </div>
        <div className="bg-gradient-to-br from-zinc-800/80 to-zinc-900/60 rounded-lg p-5 border border-zinc-700 shadow-lg">
          <div className="flex items-center mb-3">
            <div className="rounded-full bg-green-500/20 p-2 mr-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
              </svg>
            </div>
            <h3 className="text-zinc-300 text-sm font-medium">Operating Cost</h3>
          </div>
          <div className="flex items-baseline">
            <span className="text-3xl font-bold text-white">-8.7%</span>
            <span className="ml-2 text-green-500 text-sm">↓ Lower costs</span>
          </div>
        </div>
        <div className="bg-gradient-to-br from-zinc-800/80 to-zinc-900/60 rounded-lg p-5 border border-zinc-700 shadow-lg">
          <div className="flex items-center mb-3">
            <div className="rounded-full bg-blue-500/20 p-2 mr-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
              </svg>
            </div>
            <h3 className="text-zinc-300 text-sm font-medium">Rider Experience</h3>
          </div>
          <div className="flex items-baseline">
            <span className="text-3xl font-bold text-white">+19.2%</span>
            <span className="ml-2 text-blue-400 text-sm">↑ Improved</span>
          </div>
        </div>
      </div>
      
      {/* Leaderboard Section - New */}
      <div className="bg-gradient-to-br from-zinc-800/80 to-zinc-900/60 rounded-lg p-5 border border-zinc-700 shadow-lg mb-6">
        <h3 className="font-medium text-white mb-4">Top Routes by Improvement</h3>
        <div className="overflow-hidden rounded-lg border border-zinc-700">
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
              {topOptimizedRoutes.map((route, index) => (
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
                      <span className="text-xs text-zinc-400">{route.current}</span>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M12 1.586l-4 4v12.828l4-4V1.586zM3.707 3.293A1 1 0 002 4v10a1 1 0 00.293.707L6 18.414V5.586L3.707 3.293zM17.707 5.293L14 1.586v12.828l2.293 2.293A1 1 0 0018 16V6a1 1 0 00-.293-.707z" clipRule="evenodd" />
                      </svg>
                      <div className="w-16 h-2 rounded-full bg-zinc-700 overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-blue-500 to-indigo-500"
                          style={{ width: `${route.optimized}%` }}
                        ></div>
                      </div>
                      <span className="text-xs text-zinc-400">{route.optimized}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
    </div>
  );
}

export default ExpandedSection;
