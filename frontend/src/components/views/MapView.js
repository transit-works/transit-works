'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Sidebar from '../maps/Sidebar';

// Dynamically import MapView with no SSR to ensure it runs only on the client
const TransitMap = dynamic(() => import('../maps/TransitMap'), { ssr: false });

export default function MapView({ data }) {
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [optimizedData, setOptimizedData] = useState(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationError, setOptimizationError] = useState(null);

  const handleOptimize = async () => {
    if (!selectedRoute) {
      // Cannot optimize if no route is selected
      setOptimizationError('Please select a route to optimize');
      return;
    }

    try {
      setIsOptimizing(true);
      setOptimizationError(null);
      
      // Check if the backend service is reachable first
      try {
        const response = await fetch(`http://localhost:8080/optimize-route/${selectedRoute}`, {
          method: 'POST', // Changed to POST to match backend expectation
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error(`Optimization failed with status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result && result.geojson) {
          setOptimizedData(result.geojson);
        } else {
          throw new Error('Invalid response format from optimization service');
        }
      } catch (fetchError) {
        // Specific error handling for network issues
        if (fetchError.message.includes('NetworkError') || 
            fetchError.message.includes('Failed to fetch')) {
          throw new Error(
            'Cannot connect to optimization service. Please ensure the backend is running at http://localhost:8080'
          );
        } else {
          throw fetchError;
        }
      }
    } catch (error) {
      console.error('Error optimizing route:', error);
      setOptimizationError(error.message);
    } finally {
      setIsOptimizing(false);
    }
  };

  return (
    <div className="flex h-screen">
      <div className="relative z-10 h-full w-1/5 rounded-2xl bg-background-dk bg-opacity-20 backdrop-blur-lg">
        <Sidebar 
          data={data} 
          selectedRoute={selectedRoute} 
          setSelectedRoute={setSelectedRoute} 
          onOptimize={handleOptimize}
          isOptimizing={isOptimizing}
          optimizationError={optimizationError}
        />
      </div>
      <div className="absolute inset-0 z-0 h-full w-full">
        <TransitMap 
          data={optimizedData || data} 
          selectedRoute={selectedRoute} 
          setSelectedRoute={setSelectedRoute} 
          isOptimized={!!optimizedData}
          resetOptimization={() => setOptimizedData(null)}
        />
      </div>
    </div>
  );
}
