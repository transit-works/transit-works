import React from 'react';
import { FaCheck, FaExclamationTriangle, FaTimes, FaRoute, FaArrowRight } from 'react-icons/fa';

function OptimizationResultsModal({ results, onClose }) {
  if (!results) return null;
  
  const { successful, failed } = results;
  const totalRoutes = successful.length + failed.length;
  
  // Combine all routes for a unified list with status - updated to include names
  const allRoutes = [
    ...successful.map(route => ({
      id: typeof route === 'object' ? route.id : route,
      shortName: typeof route === 'object' ? route.short_name : null,
      name: typeof route === 'object' ? route.name : null,
      status: 'success'
    })),
    ...failed.map(route => ({
      id: typeof route === 'object' ? route.id : route,
      shortName: typeof route === 'object' ? route.short_name : null,
      name: typeof route === 'object' ? route.name : null,
      status: 'failed'
    }))
  ];
  
  // Sort by route ID for better readability
  allRoutes.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all duration-200">
      <div className="bg-background-dk/90 backdrop-blur-md rounded-xl border border-zinc-800 p-6 shadow-xl max-w-md w-full transform transition-all duration-300 ease-in-out">
        <div className="flex justify-between items-center mb-6 pb-2 border-b border-zinc-800/70">
          <h2 className="text-xl font-heading font-semibold text-white flex items-center gap-2">
            <FaRoute className="text-accent" /> 
            Optimization Results
          </h2>
          <button 
            onClick={onClose}
            className="text-white/70 hover:text-white transition-colors duration-200 rounded-full p-1 hover:bg-zinc-800"
            aria-label="Close modal"
          >
            <FaTimes className="h-5 w-5" />
          </button>
        </div>
        
        <div className="mb-4 bg-zinc-900/50 rounded-lg p-4 shadow-inner border border-zinc-800/50">
          <div className="flex justify-between items-center mb-2">
            <span className="text-white/90 font-medium">Total routes:</span>
            <span className="text-white font-semibold bg-zinc-800/70 px-3 py-1 rounded-md">{totalRoutes}</span>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col items-center bg-green-900/20 rounded-lg p-2 border border-green-900/30">
              <div className="text-green-400 font-medium flex items-center gap-1">
                <FaCheck className="text-green-500" />
                <span>Success</span>
              </div>
              <span className="text-2xl font-bold text-green-400">{successful.length}</span>
            </div>
            
            <div className="flex flex-col items-center bg-orange-900/20 rounded-lg p-2 border border-orange-900/30">
              <div className="text-orange-400 font-medium flex items-center gap-1">
                <FaExclamationTriangle className="text-orange-500" />
                <span>Failed</span>
              </div>
              <span className="text-2xl font-bold text-orange-400">{failed.length}</span>
            </div>
          </div>
        </div>
        
        <h3 className="text-white/90 font-medium mb-2 flex items-center gap-2">
          <FaRoute className="text-accent text-sm" /> Route Details:
        </h3>
        
        <div className="max-h-64 overflow-y-auto custom-scrollbar bg-black/30 rounded-lg p-3 shadow-inner border border-zinc-800/50 mb-4">
          {allRoutes.length > 0 ? (
            <div className="space-y-2">
              {allRoutes.map(route => (
                <div 
                  key={route.id}
                  className={`flex items-center justify-between p-2 rounded-md border ${
                    route.status === 'success' 
                      ? 'bg-green-900/20 border-green-900/30' 
                      : 'bg-orange-900/20 border-orange-900/30'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {route.status === 'success' ? (
                      <FaCheck className="text-green-500" />
                    ) : (
                      <FaExclamationTriangle className="text-orange-500" />
                    )}
                    <div>
                      {route.name ? (
                        <div className="flex flex-col">
                          <span className="font-medium text-white">
                            {route.name}
                          </span>
                          <span className="text-xs text-white/60">ID: {route.id}</span>
                        </div>
                      ) : (
                        <span className="font-medium text-white">{route.id}</span>
                      )}
                    </div>
                  </div>
                  <span className={`text-sm px-2 py-1 rounded ${
                    route.status === 'success'
                      ? 'text-green-400 bg-green-900/40'
                      : 'text-orange-400 bg-orange-900/40'
                  }`}>
                    {route.status === 'success' ? 'Optimized' : 'Not Optimized'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-zinc-500 py-4">No routes to display</div>
          )}
        </div>
        
        <button
          onClick={onClose}
          className="w-full bg-accent hover:bg-accent/80 text-white py-2.5 rounded-lg transition-colors shadow-md font-medium border border-accent/30 hover:shadow-lg"
        >
          Close
        </button>
      </div>
    </div>
  );
}

export default OptimizationResultsModal;