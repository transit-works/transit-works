import React, { useState, useEffect, useRef } from 'react';

function NoopBanner({ isVisible, selectedRoute, collapsedBanner, setCollapsedBanner }) {
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
          ? 'bg-orange-600 rounded-full w-8 h-8 overflow-hidden shadow-lg shadow-orange-800/20' 
          : 'bg-orange-800/90 backdrop-blur-sm rounded-lg shadow-lg pr-4 pl-3 py-2'
      }`}
      onMouseEnter={() => setBannerHovered(true)}
      onMouseLeave={() => setBannerHovered(false)}
    >
      {collapsedBanner && !bannerHovered ? (
        <div className="flex items-center justify-center w-full h-full text-white">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="bg-orange-500 rounded-full p-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-white" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <span className="text-white text-sm font-medium">No Optimizations Found</span>
            <span className="text-white/70 text-xs ml-2">Route {selectedRoute}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default NoopBanner;