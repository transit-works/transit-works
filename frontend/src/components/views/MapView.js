'use client';

import { useState, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Sidebar from '../maps/Sidebar';

// Dynamically import MapView with no SSR to ensure it runs only on the client
const TransitMap = dynamic(() => import('../maps/TransitMap'), { ssr: false });

export default function MapView({ data, initialOptimizedRoutesData, initialOptimizedRoutes }) {
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [optimizedRoutesData, setOptimizedRoutesData] = useState(initialOptimizedRoutesData);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationError, setOptimizationError] = useState(null);
  const [optimizedRoutes, setOptimizedRoutes] = useState(new Set(initialOptimizedRoutes));
  // for websocket live optimization
  const [optimizationProgress, setOptimizationProgress] = useState(0);
  const [currentEvaluation, setCurrentEvaluation] = useState(null);
  const [useLiveOptimization, setUseLiveOptimization] = useState(true); // Default to live optimization
  const wsRef = useRef(null);

  // Handle traditional REST API optimization
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
          // Store the optimized route data with route ID as key
          setOptimizedRoutesData(result.geojson);
          // Add the optimized route to our cache
          setOptimizedRoutes(prev => new Set(prev).add(selectedRoute));
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

  // New live optimization function using WebSockets
  const handleLiveOptimize = () => {
    if (!selectedRoute) {
      setOptimizationError('Please select a route to optimize');
      return;
    }

    // Close any existing WebSocket connection
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      wsRef.current.close();
    }

    try {
      setIsOptimizing(true);
      setOptimizationError(null);
      setOptimizationProgress(0);
      setCurrentEvaluation(null);

      // Create WebSocket connection
      const wsUrl = `ws://localhost:8080/optimize-route-live/${selectedRoute}`;
      console.log(`Connecting to WebSocket at ${wsUrl}`);
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      // Set up ping interval to keep connection alive
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          console.log('Sending client ping to keep connection alive');
          // Send a small message to keep the connection active
          ws.send('ping');
        }
      }, 15000); // Send ping every 15 seconds

      ws.onopen = () => {
        console.log('WebSocket connection established');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Received WebSocket message:', data);
          
          if (data.error) {
            setOptimizationError(data.error);
            ws.close();
            return;
          }

          // Update optimization progress
          if (data.iteration && data.total_iterations) {
            const progress = (data.iteration / data.total_iterations) * 100;
            setOptimizationProgress(progress);
            console.log(`Optimization progress: ${progress}% (iteration ${data.iteration}/${data.total_iterations})`);
            
            // If this is the last iteration, make sure we mark optimization as complete
            if (data.iteration === data.total_iterations) {
              // Add to optimized routes set
              setOptimizedRoutes(prev => new Set(prev).add(selectedRoute));
              
              // Set isOptimizing to false since we're done
              setIsOptimizing(false);
            }
          }

          // Update evaluation score
          if (data.evaluation) {
            setCurrentEvaluation(data.evaluation);
          }

          // Update map with latest optimized route
          if (data.geojson) {
            setOptimizedRoutesData(data.geojson);
          }

          // Check if this is the final iteration
          if (data.iteration === data.total_iterations) {
            // Add to optimized routes set
            setOptimizedRoutes(prev => new Set(prev).add(selectedRoute));
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
          setOptimizationError('Failed to process optimization update');
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setOptimizationError('Connection to optimization service failed');
        clearInterval(pingInterval);
      };

      ws.onclose = (event) => {
        console.log(`WebSocket connection closed: ${event.code} ${event.reason}`);
        
        // Always set isOptimizing to false when WebSocket closes
        // This ensures the button is re-enabled
        setIsOptimizing(false);
        
        // If closed abnormally with optimization incomplete, show error
        if (event.code !== 1000 && optimizationProgress < 100) {
          setOptimizationError('WebSocket connection closed unexpectedly');
        }
        
        wsRef.current = null;
        clearInterval(pingInterval);
      };

      return () => {
        clearInterval(pingInterval);
      };
    } catch (error) {
      console.error('Error setting up WebSocket connection:', error);
      setOptimizationError(error.message);
      setIsOptimizing(false);
    }
  };

  // Choose appropriate optimization method based on user preference
  const handleOptimizeRoute = () => {
    if (useLiveOptimization) {
      handleLiveOptimize();
    } else {
      handleOptimize();
    }
  };

  // Clean up WebSocket on component unmount
  useEffect(() => {
    return () => {
      if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
        wsRef.current.close();
      }
    };
  }, []);

  // Add an effect to make sure isOptimizing is reset when route selection changes
  useEffect(() => {
    // If a route is deselected while optimizing, disable optimization mode
    if (!selectedRoute && isOptimizing) {
      setIsOptimizing(false);
      
      // Close any existing WebSocket connection
      if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
        wsRef.current.close();
      }
    }
  }, [selectedRoute, isOptimizing]);

  // Reset function for all route optimizations
  const resetOptimization = async () => {
    try {
      setIsOptimizing(true);
      setOptimizationError(null);
      
      const response = await fetch('http://localhost:8080/reset-optimizations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Reset failed with status: ${response.status}`);
      }
      
      // Clear optimized routes data
      setOptimizedRoutes(new Set());
      setOptimizedRoutesData(null);
      
    } catch (error) {
      console.error('Error resetting optimizations:', error);
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
          onOptimize={handleOptimizeRoute}
          isOptimizing={isOptimizing}
          optimizationError={optimizationError}
          optimizationProgress={optimizationProgress}
          currentEvaluation={currentEvaluation}
          useLiveOptimization={useLiveOptimization}
          setUseLiveOptimization={setUseLiveOptimization}
        />
      </div>
      <div className="absolute inset-0 z-0 h-full w-full">
        <TransitMap 
          data={data} 
          selectedRoute={selectedRoute} 
          setSelectedRoute={setSelectedRoute} 
          optimizedRoutesData={optimizedRoutesData}
          optimizedRoutes={optimizedRoutes}
          resetOptimization={resetOptimization}
        />
      </div>
    </div>
  );
}
