import React from 'react';

function OptimizationProgress({ progress, currentEvaluation }) {
  // Format evaluation score to 2 decimal places if available
  const formattedEvaluation = currentEvaluation !== null 
    ? currentEvaluation.toFixed(2) 
    : 'N/A';
  
  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-white">Optimization Progress</span>
        <span className="text-xs text-accent font-medium">
          {progress.toFixed(0)}% ({formattedEvaluation})
        </span>
      </div>
      <div className="w-full bg-zinc-800 rounded-full h-1.5">
        <div 
          className="bg-accent h-1.5 rounded-full transition-all duration-300 ease-out" 
          style={{ width: `${progress}%` }}
        ></div>
      </div>
    </div>
  );
}

export default OptimizationProgress;
