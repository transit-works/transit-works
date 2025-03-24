import React from 'react';
import { FaCheck, FaExclamationTriangle, FaTimes, FaRoute } from 'react-icons/fa';

function OptimizationResultsModal({ results, onClose }) {
  if (!results) return null;
  
  const { successful, failed } = results;
  const totalRoutes = successful.length + failed.length;
  
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
        
        <div className="mb-6 bg-zinc-900/50 rounded-lg p-4 shadow-inner border border-zinc-800/50">
          <div className="flex justify-between mb-3 items-center">
            <span className="text-white/90 font-medium">Total routes:</span>
            <span className="text-white font-semibold bg-zinc-800/70 px-3 py-1 rounded-md">{totalRoutes}</span>
          </div>
          <div className="flex justify-between mb-3 items-center">
            <span className="text-green-400 font-medium flex items-center gap-2">
              <FaCheck className="text-green-500" /> Successfully optimized:
            </span>
            <span className="text-green-400 font-semibold bg-green-900/30 px-3 py-1 rounded-md">{successful.length}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-orange-400 font-medium flex items-center gap-2">
              <FaExclamationTriangle className="text-orange-500" /> Could not optimize:
            </span>
            <span className="text-orange-400 font-semibold bg-orange-900/30 px-3 py-1 rounded-md">{failed.length}</span>
          </div>
        </div>
        
        {successful.length > 0 && (
          <div className="mb-5">
            <h3 className="text-white/90 font-medium mb-2 flex items-center gap-2">
              <FaCheck className="text-green-500 text-sm" /> Optimized Routes:
            </h3>
            <div className="max-h-32 overflow-y-auto custom-scrollbar bg-black/30 rounded-lg p-3 shadow-inner border border-zinc-800/50">
              <div className="grid grid-cols-2 gap-2">
                {successful.map(routeId => (
                  <div key={`opt-${routeId}`} className="text-green-400 text-sm py-1 px-2 bg-green-900/20 rounded border border-green-900/30">
                    {routeId}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {failed.length > 0 && (
          <div className="mb-5">
            <h3 className="text-white/90 font-medium mb-2 flex items-center gap-2">
              <FaExclamationTriangle className="text-orange-500 text-sm" /> Routes That Could Not Be Optimized:
            </h3>
            <div className="max-h-32 overflow-y-auto custom-scrollbar bg-black/30 rounded-lg p-3 shadow-inner border border-zinc-800/50">
              <div className="grid grid-cols-2 gap-2">
                {failed.map(routeId => (
                  <div key={`noop-${routeId}`} className="text-orange-400 text-sm py-1 px-2 bg-orange-900/20 rounded border border-orange-900/30">
                    {routeId}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        
        <button
          onClick={onClose}
          className="mt-2 w-full bg-accent hover:bg-accent/80 text-white py-2.5 rounded-lg transition-colors shadow-md font-medium border border-accent/30 hover:shadow-lg"
        >
          Close
        </button>
      </div>
    </div>
  );
}

export default OptimizationResultsModal;