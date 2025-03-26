import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FaCheck, FaExclamationTriangle, FaTimes, FaRoute, 
  FaChartPie, FaDownload, FaBus, FaFileExport, FaSpinner
} from 'react-icons/fa';
import { Pie } from '@visx/shape';
import { Group } from '@visx/group';
import { scaleOrdinal } from '@visx/scale';
import { LinearGradient } from '@visx/gradient';
import { fetchFromAPI } from '../../utils/api'; // Assuming you have this utility

function OptimizationResultsModal({ results, onClose }) {
  if (!results) return null;
  
  const { successful, failed } = results;
  const totalRoutes = successful.length + failed.length;
  const [activeTab, setActiveTab] = useState('all');
  const [exportFormat, setExportFormat] = useState('csv');
  const [showExportOptions, setShowExportOptions] = useState(false);
  const [improvementData, setImprovementData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Fetch real improvement data when the modal opens
  useEffect(() => {
    const fetchImprovementData = async () => {
      if (successful.length === 0) return;
      
      setIsLoading(true);
      setError(null);
      
      try {
        // Extract route IDs from successful routes
        const routeIds = successful.map(route => 
          typeof route === 'object' ? route.id : route
        ).join(',');
        
        const data = await fetchFromAPI(`/route-improvements?route_ids=${routeIds}`);
        
        if (data && data.routes) {
          setImprovementData(data.routes);
        } else {
          setError('No improvement data available');
        }
      } catch (err) {
        console.error('Error fetching route improvements:', err);
        setError('Failed to fetch improvement data');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchImprovementData();
  }, [successful]);
  
  // Calculate average improvement from real data
  const calculateAverageImprovement = () => {
    if (!improvementData || improvementData.length === 0) return null;
    
    const sum = improvementData.reduce((acc, route) => acc + route.improvement, 0);
    return (sum / improvementData.length).toFixed(1);
  };
  
  const averageImprovement = calculateAverageImprovement();
  
  // Enhanced route objects with real improvement data
  const allRoutes = [
    ...successful.map(route => {
      const routeId = typeof route === 'object' ? route.id : route;
      const routeData = improvementData?.find(r => r.route_id === routeId);
      
      return {
        id: routeId,
        shortName: typeof route === 'object' ? route.short_name : 
                  (routeData?.route_short_name || null),
        name: typeof route === 'object' ? route.name : 
              (routeData?.route_long_name || `Route ${routeId}`),
        status: 'success',
        timestamp: new Date().toISOString(),
        improvement: routeData?.improvement || 0,
        score_before: routeData?.score_before || 0,
        score_after: routeData?.score_after || 0
      };
    }),
    ...failed.map(route => ({
      id: typeof route === 'object' ? route.id : route,
      shortName: typeof route === 'object' ? route.short_name : null,
      name: typeof route === 'object' ? route.name : null,
      status: 'failed',
      timestamp: new Date().toISOString(),
      reason: 'No optimization possible',
    }))
  ];
  
  // Sort by route ID for better readability
  allRoutes.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  
  // Filter routes based on active tab
  const displayedRoutes = 
    activeTab === 'all' ? allRoutes : 
    activeTab === 'success' ? allRoutes.filter(r => r.status === 'success') : 
    allRoutes.filter(r => r.status === 'failed');
  
  // Enhanced pie chart config
  const width = 150;
  const height = 150;
  const radius = Math.min(width, height) / 2;
  
  // Data for pie chart with enhanced colors
  const pieData = [
    { label: 'Optimized', value: successful.length, gradientId: 'optimizedGradient' },
    { label: 'Unchanged', value: failed.length, gradientId: 'unchangedGradient' }
  ];
  
  // Calculate percentages
  const successfulPercent = totalRoutes > 0 ? (successful.length / totalRoutes) * 100 : 0;
  const failedPercent = totalRoutes > 0 ? (failed.length / totalRoutes) * 100 : 0;
  
  // Scale for pie segments
  const getGradientId = scaleOrdinal({
    domain: pieData.map(d => d.label),
    range: pieData.map(d => d.gradientId)
  });
  
  // Export function
  const exportResults = () => {
    // Format data based on selected format
    if (exportFormat === 'csv') {
      const headers = ['ID', 'Route Name', 'Status', 'Details', 'Score Before', 'Score After', 'Improvement (%)', 'Timestamp'];
      
      const csvContent = [
        headers.join(','),
        ...allRoutes.map(route => {
          const details = route.status === 'success' 
            ? `${route.improvement.toFixed(1)}% improvement` 
            : route.reason;
          
          return [
            route.id,
            route.name || `Route ${route.id}`,
            route.status === 'success' ? 'Optimized' : 'Unchanged',
            details,
            route.score_before || '',
            route.score_after || '',
            route.improvement ? route.improvement.toFixed(1) : '',
            route.timestamp
          ].join(',');
        })
      ].join('\n');
      
      // Create download link
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      
      // Set up link properties
      link.setAttribute('href', url);
      link.setAttribute('download', `optimization-results-${new Date().toISOString().slice(0,10)}.csv`);
      link.style.display = 'none';
      
      // Add link to document, trigger download, then clean up
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
    } else if (exportFormat === 'json') {
      // Format JSON data
      const jsonData = {
        summary: {
          total: totalRoutes,
          optimized: successful.length,
          unchanged: failed.length,
          optimizedPercent: Math.round(successfulPercent),
          unchangedPercent: Math.round(failedPercent),
          averageImprovement: averageImprovement
        },
        routes: allRoutes
      };
      
      // Create download link
      const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      
      // Set up link properties
      link.setAttribute('href', url);
      link.setAttribute('download', `optimization-results-${new Date().toISOString().slice(0,10)}.json`);
      link.style.display = 'none';
      
      // Add link to document, trigger download, then clean up
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
    
    setShowExportOptions(false);
  };

  // Return statement and rest of component remains the same
  return (
    <AnimatePresence>
      <motion.div 
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Component structure remains the same as before */}
        <motion.div 
          className="bg-gradient-to-b from-zinc-900 to-black rounded-2xl border border-zinc-700/50 shadow-2xl max-w-2xl w-full max-h-[85vh] h-[700px] transform transition-all overflow-hidden flex flex-col"
          initial={{ scale: 0.9, y: 20 }}
          animate={{ 
            scale: 1, 
            y: 0,
            transition: { type: 'spring', damping: 25, stiffness: 300 }
          }}
        >
          {/* Header remains the same */}
          <div className="bg-zinc-800/40 backdrop-blur-md rounded-t-2xl p-6 border-b border-zinc-700/30 flex-shrink-0 shadow-lg">
            <div className="flex justify-between items-center">
              <motion.h2 
                className="text-2xl font-heading font-bold text-white flex items-center gap-3"
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
              >
                <motion.div
                  initial={{ rotate: -90 }}
                  animate={{ rotate: 0 }}
                  transition={{ delay: 0.2, type: 'spring' }}
                  className="bg-accent/10 rounded-full p-2"
                >
                  <FaRoute className="text-accent h-6 w-6" /> 
                </motion.div>
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-accent to-amber-300">
                  Optimization Results
                </span>
              </motion.h2>
              
              <motion.button 
                onClick={onClose}
                className="text-zinc-400 hover:text-white transition-colors duration-200 rounded-full p-2 hover:bg-zinc-700/50"
                whileHover={{ rotate: 90, scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                aria-label="Close modal"
              >
                <FaTimes className="h-5 w-5" />
              </motion.button>
            </div>
          </div>
          
          {/* Content area */}
          <div className="p-6 overflow-y-auto custom-scrollbar flex-grow">
            {/* Stats and visualization section */}
            <motion.div 
              className="flex flex-col md:flex-row gap-6 mb-6"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              {/* Pie chart remains the same */}
              <div className="bg-zinc-900/70 rounded-xl p-5 border border-zinc-800 shadow-lg flex-shrink-0 flex flex-col items-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-blue-900/5 to-indigo-900/5 pointer-events-none"></div>
                
                <h3 className="text-zinc-300 text-sm font-medium mb-3 flex items-center gap-1 z-10">
                  <FaChartPie className="text-blue-400 text-xs" /> Result Distribution
                </h3>
                
                <div className="relative h-[150px] w-[150px] mb-2">
                  {/* Circular highlight glow behind chart */}
                  <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-blue-500/5 to-indigo-500/5 blur-xl"></div>
                  
                  <svg width={width} height={height}>
                    <LinearGradient 
                      id="optimizedGradient" 
                      from="#059669" 
                      to="#10B981" 
                      vertical={false}
                    />
                    <LinearGradient 
                      id="unchangedGradient" 
                      from="#EA580C" 
                      to="#F97316" 
                      vertical={false}
                    />
                    <LinearGradient
                      id="centerGradient"
                      from="#1e293b"
                      to="#0f172a"
                      vertical={true}
                    />
                    
                    <Group top={height / 2} left={width / 2}>
                      {/* Enhanced background with inner glow */}
                      <motion.circle 
                        r={radius - 5} 
                        fill="rgba(39, 39, 42, 0.5)" 
                        filter="url(#glow)"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.1, duration: 0.5 }}
                      />
                      
                      {/* Define filter for glow */}
                      <defs>
                        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                          <feGaussianBlur stdDeviation="4" result="blur" />
                          <feComposite in="SourceGraphic" in2="blur" operator="over" />
                        </filter>
                      </defs>
                      
                      <Pie
                        data={pieData}
                        pieValue={d => d.value > 0 ? d.value : 0.0001}
                        outerRadius={radius - 8}
                        innerRadius={radius - 35}
                        cornerRadius={3}
                        padAngle={0.02}
                      >
                        {pie => {
                          return pie.arcs.map((arc, index) => {
                            const { label, gradientId } = pieData[index];
                            const [centroidX, centroidY] = pie.path.centroid(arc);
                            const hasSpaceForLabel = arc.endAngle - arc.startAngle >= 0.3;
                            
                            return (
                              <motion.g 
                                key={`arc-${label}`}
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: 0.3 + index * 0.1, duration: 0.4 }}
                              >
                                <path
                                  d={pie.path(arc)}
                                  fill={`url(#${gradientId})`}
                                  stroke="rgba(255, 255, 255, 0.15)"
                                  strokeWidth={1}
                                  filter="drop-shadow(0px 2px 3px rgba(0, 0, 0, 0.3))"
                                />
                                
                                {hasSpaceForLabel && (
                                  <g>
                                    <circle 
                                      cx={centroidX * 0.8} 
                                      cy={centroidY * 0.8} 
                                      r={12} 
                                      fill={index === 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(249, 115, 22, 0.3)'} 
                                      strokeWidth={1}
                                      stroke={index === 0 ? 'rgba(16, 185, 129, 0.6)' : 'rgba(249, 115, 22, 0.6)'}
                                    />
                                    <text
                                      x={centroidX * 0.8}
                                      y={centroidY * 0.8}
                                      dy=".33em"
                                      fontSize={9}
                                      fontWeight="bold"
                                      textAnchor="middle"
                                      fill={index === 0 ? '#10B981' : '#F97316'}
                                    >
                                      {pieData[index].value > 0 ? pieData[index].value : ''}
                                    </text>
                                  </g>
                                )}
                              </motion.g>
                            );
                          });
                        }}
                      </Pie>
                      
                      {/* Enhanced center content */}
                      <g>
                        <circle 
                          r={radius - 35} 
                          fill="url(#centerGradient)" 
                          strokeWidth={2}
                          stroke="rgba(63, 63, 70, 0.6)"
                        />
                        <text
                          textAnchor="middle"
                          dy="-0.5em"
                          fontSize={22}
                          fontWeight="bold"
                          fill="white"
                          filter="drop-shadow(0px 1px 2px rgba(0, 0, 0, 0.5))"
                        >
                          {totalRoutes}
                        </text>
                        <text
                          textAnchor="middle"
                          dy="1.5em"
                          fontSize={10}
                          fill="#a1a1aa"
                        >
                          Total Routes
                        </text>
                      </g>
                    </Group>
                  </svg>
                </div>
                
                {/* Enhanced chart legend */}
                <div className="flex justify-center gap-4 mt-1 text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-gradient-to-r from-green-600 to-green-500 shadow-sm shadow-green-500/20"></div>
                    <span className="text-green-400">Optimized ({Math.round(successfulPercent)}%)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-gradient-to-r from-orange-600 to-orange-500 shadow-sm shadow-orange-500/20"></div>
                    <span className="text-orange-400">Unchanged ({Math.round(failedPercent)}%)</span>
                  </div>
                </div>
                
                {/* Reflective base effect */}
                <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-zinc-800/50 to-transparent"></div>
              </div>
              
              {/* Stats cards - Update improvement information */}
              <div className="flex-1 grid grid-cols-2 gap-4">
                <motion.div 
                  className="flex flex-col justify-between items-center bg-gradient-to-br from-green-900/30 to-green-950/40 rounded-xl p-4 border border-green-800/30 shadow-lg relative overflow-hidden"
                  whileHover={{ y: -5, boxShadow: "0 20px 25px -5px rgba(16, 185, 129, 0.05)" }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                >
                  {/* Background glow effect */}
                  <div className="absolute -top-20 -right-20 w-40 h-40 bg-green-500/10 rounded-full blur-xl"></div>
                  
                  <div className="text-green-400 font-medium flex items-center gap-2 mb-2">
                    <div className="bg-green-400/20 rounded-full p-2">
                      <FaCheck className="text-green-400" />
                    </div>
                    <span>Optimized Routes</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-green-400">{successful.length}</span>
                    <span className="text-xs text-green-500/70">
                      ({Math.round(successfulPercent)}%)
                    </span>
                  </div>
                  {successful.length > 0 && (
                    <div className="mt-2 text-xs text-green-500/70 text-center">
                      {isLoading ? (
                        <span className="flex items-center justify-center">
                          <FaSpinner className="animate-spin mr-1" /> 
                          Loading data...
                        </span>
                      ) : error ? (
                        <span>Improvement data unavailable</span>
                      ) : averageImprovement ? (
                        <span>Average improvement: ~{averageImprovement}%</span>
                      ) : (
                        <span>Calculating improvements...</span>
                      )}
                    </div>
                  )}
                </motion.div>
                
                {/* Unchanged routes card remains the same */}
                <motion.div 
                  className="flex flex-col justify-between items-center bg-gradient-to-br from-orange-900/30 to-orange-950/40 rounded-xl p-4 border border-orange-800/30 shadow-lg relative overflow-hidden"
                  whileHover={{ y: -5, boxShadow: "0 20px 25px -5px rgba(249, 115, 22, 0.05)" }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                >
                  {/* Background glow effect */}
                  <div className="absolute -top-20 -right-20 w-40 h-40 bg-orange-500/10 rounded-full blur-xl"></div>
                  
                  <div className="text-orange-400 font-medium flex items-center gap-2 mb-2">
                    <div className="bg-orange-400/20 rounded-full p-2">
                      <FaExclamationTriangle className="text-orange-400" />
                    </div>
                    <span>Unchanged Routes</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-orange-400">{failed.length}</span>
                    <span className="text-xs text-orange-500/70">
                      ({Math.round(failedPercent)}%)
                    </span>
                  </div>
                  {failed.length > 0 && (
                    <div className="mt-2 text-xs text-orange-500/70 text-center">
                      No optimization possible
                    </div>
                  )}
                </motion.div>
              </div>
            </motion.div>
            
            {/* Tab navigation */}
            <motion.div 
              className="flex mb-4 border-b border-zinc-800"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <TabButton 
                active={activeTab === 'all'} 
                onClick={() => setActiveTab('all')}
                icon={<FaRoute />}
                count={allRoutes.length}
                label="All Routes"
              />
              <TabButton 
                active={activeTab === 'success'} 
                onClick={() => setActiveTab('success')}
                icon={<FaCheck />}
                count={successful.length}
                label="Optimized"
                className="text-green-400"
              />
              <TabButton 
                active={activeTab === 'failed'} 
                onClick={() => setActiveTab('failed')}
                icon={<FaExclamationTriangle />}
                count={failed.length}
                label="Unchanged"
                className="text-orange-400"
              />
            </motion.div>
            
            {/* Route list */}
            <div className="max-h-[300px] overflow-y-auto custom-scrollbar bg-zinc-900/40 rounded-xl p-4 shadow-inner border border-zinc-800 mb-6">
              {displayedRoutes.length > 0 ? (
                <motion.div 
                  className="space-y-3"
                  initial="hidden"
                  animate="visible"
                  variants={{
                    visible: {
                      transition: { staggerChildren: 0.07 }
                    },
                    hidden: {}
                  }}
                >
                  {displayedRoutes.map((route, index) => (
                    <RouteCard key={route.id} route={route} index={index} />
                  ))}
                </motion.div>
              ) : (
                <div className="text-center text-zinc-500 py-8 flex flex-col items-center">
                  <FaBus className="text-zinc-700 mb-2 text-3xl" />
                  <p>No routes to display in this category</p>
                </div>
              )}
            </div>
          </div>
          
          {/* Fixed footer with actions */}
          <div className="p-6 border-t border-zinc-800/50 bg-zinc-900/30 flex-shrink-0 relative">
            {/* Export options popup */}
            {showExportOptions && (
              <motion.div 
                className="absolute bottom-16 right-6 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl p-4 w-72"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
              >
                <h4 className="text-white text-sm font-medium mb-3 flex items-center gap-2">
                  <FaFileExport className="text-accent" />
                  Export Format
                </h4>
                
                <div className="flex flex-col gap-2 mb-4">
                  <label className="flex items-center gap-2 text-zinc-300 text-sm">
                    <input 
                      type="radio" 
                      name="exportFormat" 
                      value="csv" 
                      checked={exportFormat === 'csv'}
                      onChange={() => setExportFormat('csv')}
                      className="accent-accent"
                    />
                    CSV (Excel, Google Sheets)
                  </label>
                  
                  <label className="flex items-center gap-2 text-zinc-300 text-sm">
                    <input 
                      type="radio" 
                      name="exportFormat" 
                      value="json" 
                      checked={exportFormat === 'json'}
                      onChange={() => setExportFormat('json')}
                      className="accent-accent"
                    />
                    JSON (Developers)
                  </label>
                </div>
                
                <div className="flex gap-2">
                  <button 
                    onClick={() => setShowExportOptions(false)}
                    className="flex-1 py-2 text-sm bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={exportResults}
                    className="flex-1 py-2 text-sm bg-accent hover:bg-amber-500 text-white rounded-lg flex items-center justify-center gap-1"
                  >
                    <FaDownload size={12} /> Download
                  </button>
                </div>
              </motion.div>
            )}
            
            {/* Replaced the flex container with right-aligned buttons */}
            <div className="flex justify-end gap-3">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-lg transition-colors shadow font-medium border border-zinc-700/50 text-sm flex items-center gap-1.5"
                onClick={onClose}
              >
                <FaTimes className="text-xs" /> Close
              </motion.button>
              
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="bg-gradient-to-r from-accent to-amber-600 hover:from-accent hover:to-amber-500 text-white px-4 py-2 rounded-lg transition-all shadow-lg font-medium border border-accent/20 text-sm flex items-center gap-1.5"
                onClick={() => setShowExportOptions(!showExportOptions)}
              >
                <FaDownload className="text-xs" /> Export Results
              </motion.button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// Tab Button Component
function TabButton({ active, onClick, icon, count, label, className = "" }) {
  return (
    <button
      onClick={onClick}
      className={`relative px-4 py-2 flex items-center gap-2 ${
        active 
          ? 'text-white border-b-2 border-blue-500' 
          : 'text-zinc-500 hover:text-zinc-300'
      }`}
    >
      <span className={`${className} ${active ? 'opacity-100' : 'opacity-70'}`}>
        {icon}
      </span>
      <span>{label}</span>
      {count > 0 && (
        <span className={`
          ml-1 text-xs px-1.5 py-0.5 rounded-full
          ${active 
            ? 'bg-accent/20 text-accent' 
            : 'bg-zinc-800 text-zinc-400'}
        `}>
          {count}
        </span>
      )}
      
      {active && (
        <motion.div 
          className="absolute bottom-0 inset-x-0 h-0.5 bg-accent"
          layoutId="activeTab"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        />
      )}
    </button>
  );
}

// Route Card Component
function RouteCard({ route, index }) {
  return (
    <motion.div 
      variants={{
        visible: { opacity: 1, y: 0 },
        hidden: { opacity: 0, y: 20 }
      }}
      className={`p-3 rounded-xl border ${
        route.status === 'success' 
          ? 'bg-gradient-to-r from-green-900/10 to-green-950/10 border-green-900/30 hover:from-green-900/20 hover:to-green-950/20' 
          : 'bg-gradient-to-r from-orange-900/10 to-orange-950/10 border-orange-900/30 hover:from-orange-900/20 hover:to-orange-950/20'
      } transition-colors hover:shadow-md`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`
            rounded-full p-2 flex-shrink-0
            ${route.status === 'success' 
              ? 'bg-green-400/10 text-green-400' 
              : 'bg-orange-400/10 text-orange-400'}
          `}>
            {route.status === 'success' ? <FaCheck /> : <FaExclamationTriangle />}
          </div>
          
          <div className="flex flex-col">
            <div className="font-medium text-white flex items-center gap-2">
              {route.name || `Route ${route.id}`}
              {route.shortName && (
                <span className="text-xs py-0.5 px-1.5 rounded bg-zinc-800 text-zinc-300">
                  {route.shortName}
                </span>
              )}
            </div>
            <span className="text-xs text-zinc-400">ID: {route.id}</span>
          </div>
        </div>
        
        <div className="flex flex-col items-end">
          {route.status === 'success' ? (
            <div className="flex flex-col items-end">
              <span className="text-green-400 text-sm font-medium bg-green-900/30 px-2 py-1 rounded">
                Optimized ✓
              </span>
              <span className="text-xs text-green-500/80 mt-1">
                {typeof route.improvement === 'number' 
                  ? `${route.improvement.toFixed(1)}% improvement` 
                  : 'Improvement data loading...'}
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-end">
              <span className="text-orange-400 text-sm font-medium bg-orange-900/30 px-2 py-1 rounded">
                Unchanged
              </span>
              <span className="text-xs text-orange-500/80 mt-1">
                {route.reason}
              </span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default OptimizationResultsModal;