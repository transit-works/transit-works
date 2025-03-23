import React, { useState, useEffect, useRef } from 'react';

function OptimizedBanner({ isVisible, selectedRoute, collapsedBanner, setCollapsedBanner }) {
  const [bannerHovered, setBannerHovered] = useState(false);
  const bannerTimeout = useRef(null);
  
  useEffect(() => {
    // Clear any existing timeouts
    if (bannerTimeout.current) {
      clearTimeout(bannerTimeout.current);
    }
    
    if (isVisible) {
      setCollapsedBanner(false);
      
      // After 3 seconds, collapse the banner
      bannerTimeout.current = setTimeout(() => {
        setCollapsedBanner(true);
      }, 3000);
    }
    
    return () => {
      if (bannerTimeout.current) {
        clearTimeout(bannerTimeout.current);
      }
    };
  }, [isVisible, setCollapsedBanner]);
  
  if (!isVisible) return null;
  
  return (
    <div 
      className={`fixed top-4 left-[calc(20%+16px)] z-30 flex items-center transition-all duration-300 ease-in-out ${
        collapsedBanner && !bannerHovered
          ? 'bg-green-600 rounded-full w-8 h-8 overflow-hidden shadow-lg shadow-green-800/20' 
          : 'bg-green-800/90 backdrop-blur-sm rounded-lg shadow-lg pr-4 pl-3 py-2'
      }`}
      onMouseEnter={() => setBannerHovered(true)}
      onMouseLeave={() => setBannerHovered(false)}
    >
      {collapsedBanner && !bannerHovered ? (
        <div className="flex items-center justify-center w-full h-full text-white">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="bg-green-500 rounded-full p-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-white" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <span className="text-white text-sm font-medium">Viewing optimized route</span>
            <span className="text-white/70 text-xs ml-2">Route {selectedRoute}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default OptimizedBanner;