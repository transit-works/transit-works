'use client';

import { useState, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Sidebar from '../maps/Sidebar';

// Dynamically import MapView with no SSR to ensure it runs only on the client
const TransitMap = dynamic(() => import('../maps/TransitMap'), { ssr: false });

export default function MapView({ data, initialOptimizedRoutesData, initialOptimizedRoutes }) {
  // Update selectedRoute to selectedRoutes (a Set)
  const [selectedRoutes, setSelectedRoutes] = useState(new Set());
  const [optimizedRoutesData, setOptimizedRoutesData] = useState(initialOptimizedRoutesData);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationError, setOptimizationError] = useState(null);
  const [optimizedRoutes, setOptimizedRoutes] = useState(new Set(initialOptimizedRoutes));
  const [optimizationProgress, setOptimizationProgress] = useState(0);
  const [currentEvaluation, setCurrentEvaluation] = useState(null);
  const [useLiveOptimization, setUseLiveOptimization] = useState(true);
  const wsRef = useRef(null);

  // Add map control state variables
  const [mapStyle, setMapStyle] = useState('/styles/dark_matter.json');
  const [show3DRoutes, setShow3DRoutes] = useState(false);
  const [useRandomColors, setUseRandomColors] = useState(false);
  const [showPopulationHeatmap, setShowPopulationHeatmap] = useState(false);
  
  // Map control toggle functions
  const toggleMapStyle = () => {
    setMapStyle((prevStyle) => (prevStyle === '/styles/dark_matter_3d.json' 
      ? '/styles/dark_matter.json' 
      : '/styles/dark_matter_3d.json'));
  };

  const toggle3DRoutes = () => {
    setShow3DRoutes(!show3DRoutes);
  };

  const toggleRandomColors = () => {
    setUseRandomColors(!useRandomColors);
  };

  const togglePopulationHeatmap = () => {
    setShowPopulationHeatmap(!showPopulationHeatmap);
  };

  // Modified handleOptimize function to work with multiple routes
  const handleOptimize = async () => {
    // Check if any routes are selected
    if (selectedRoutes.size === 0) {
      setOptimizationError('Please select at least one route to optimize');
      return;
    }

    const routesToOptimize = Array.from(selectedRoutes);

    try {
      setIsOptimizing(true);
      setOptimizationError(null);
      
      const endpoint = 'http://localhost:8080/optimize-routes';
      
      const requestOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ routes: routesToOptimize })
      };

      try {
        const response = await fetch(endpoint, requestOptions);
        
        if (!response.ok) {
          throw new Error(`Optimization failed with status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result && result.geojson) {
          // Store the optimized route data
          setOptimizedRoutesData(result.geojson);
          // Add the optimized routes to our cache
          setOptimizedRoutes(prev => {
            const newSet = new Set(prev);
            routesToOptimize.forEach(routeId => newSet.add(routeId));
            return newSet;
          });
        } else {
          throw new Error('Invalid response format from optimization service');
        }
      } catch (fetchError) {
        // Handle network errors
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
      console.error('Error optimizing routes:', error);
      setOptimizationError(error.message);
    } finally {
      setIsOptimizing(false);
    }
  };

  // Update handleLiveOptimize to work with the first selected route
  const handleLiveOptimize = () => {
    if (selectedRoutes.size === 0) {
      setOptimizationError('Please select a route to optimize');
      return;
    }

    // For live optimization, just use the first selected route
    // (or you could modify your backend to support multiple routes with WebSockets)
    const selectedRoute = Array.from(selectedRoutes)[0];
    
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

  // Choose appropriate optimization method
  const handleOptimizeRoute = () => {
    if (useLiveOptimization && selectedRoutes.size === 1) {
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
    if (selectedRoutes.size === 0 && isOptimizing) {
      setIsOptimizing(false);
      
      // Close any existing WebSocket connection
      if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
        wsRef.current.close();
      }
    }
  }, [selectedRoutes, isOptimizing]);

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
      
      // Verify the reset worked by checking with the server
      const verifyResponse = await fetch('http://localhost:8080/get-optimizations');
      if (verifyResponse.ok) {
        const verifyData = await verifyResponse.json();
        if (verifyData.routes && verifyData.routes.length > 0) {
          console.warn('Warning: Server still has optimized routes after reset');
          // Force another reset if needed
          await fetch('http://localhost:8080/reset-optimizations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
        } else {
          console.log('Reset verification successful - server confirms no optimized routes');
        }
      }
      
    } catch (error) {
      console.error('Error resetting optimizations:', error);
      setOptimizationError(error.message);
    } finally {
      setIsOptimizing(false);
    }
  };

  // Add this function to MapView.js
  const fetchOptimizedRoutes = async () => {
    try {
      const response = await fetch('http://localhost:8080/get-optimizations');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch optimized routes: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Check if there are any optimized routes
      if (data.geojson && data.geojson.features && data.geojson.features.length > 0) {
        // Extract route IDs from the geojson features
        const optimizedRouteIds = new Set(
          data.geojson.features
            .filter(feature => feature.properties && feature.properties.route_id)
            .map(feature => feature.properties.route_id)
        );
        
        // Update optimized routes set
        setOptimizedRoutes(optimizedRouteIds);
        
        // Update optimized routes data
        setOptimizedRoutesData(data.geojson);
      } else {
        // No optimized routes, ensure our state reflects this
        setOptimizedRoutes(new Set());
        setOptimizedRoutesData(null);
      }
    } catch (error) {
      console.error('Error fetching optimized routes:', error);
      // On error, clear optimized routes to prevent stale data
      setOptimizedRoutes(new Set());
      setOptimizedRoutesData(null);
    }
  };

  useEffect(() => {
    fetchOptimizedRoutes();
  }, []);

  return (
    <div className="flex h-screen">
      <div className="relative z-10 h-full w-1/5 rounded-2xl bg-background-dk bg-opacity-20 backdrop-blur-lg">
        <Sidebar 
          data={data} 
          selectedRoutes={selectedRoutes} 
          setSelectedRoutes={setSelectedRoutes} 
          onOptimize={handleOptimizeRoute}
          isOptimizing={isOptimizing}
          optimizationError={optimizationError}
          optimizationProgress={optimizationProgress}
          currentEvaluation={currentEvaluation}
          useLiveOptimization={useLiveOptimization}
          setUseLiveOptimization={setUseLiveOptimization}
          // Add map control props
          mapStyle={mapStyle}
          show3DRoutes={show3DRoutes}
          useRandomColors={useRandomColors}
          showPopulationHeatmap={showPopulationHeatmap}
          onToggleMapStyle={toggleMapStyle}
          onToggle3DRoutes={toggle3DRoutes}
          onToggleRandomColors={toggleRandomColors}
          onTogglePopulationHeatmap={togglePopulationHeatmap}
        />
      </div>
      <div className="absolute inset-0 z-0 h-full w-full">
        <TransitMap 
          data={data} 
          selectedRoutes={selectedRoutes} 
          setSelectedRoutes={setSelectedRoutes} 
          optimizedRoutesData={optimizedRoutesData}
          optimizedRoutes={optimizedRoutes}
          resetOptimization={resetOptimization}
          useLiveOptimization={useLiveOptimization}
          setUseLiveOptimization={setUseLiveOptimization}
          isOptimizing={isOptimizing}
          optimizationProgress={optimizationProgress}
          currentEvaluation={currentEvaluation}
          onOptimize={handleOptimizeRoute}
          optimizationError={optimizationError}
          // Add map control props
          mapStyle={mapStyle}
          show3DRoutes={show3DRoutes}
          useRandomColors={useRandomColors}
          showPopulationHeatmap={showPopulationHeatmap}
        />
      </div>
    </div>
  );
}
