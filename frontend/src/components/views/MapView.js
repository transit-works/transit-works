'use client';

import { useState, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Sidebar from '../maps/Sidebar';
import OptimizationProgress from '../maps/OptimizationProgress';
import { fetchFromAPI, createWebSocket } from '@/utils/api';

// Dynamically import MapView with no SSR to ensure it runs only on the client
const TransitMap = dynamic(() => import('../maps/TransitMap'), { ssr: false });

export default function MapView({ data, initialOptimizedRoutesData, initialOptimizedRoutes, city = 'toronto' }) {
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [selectedRoutes, setSelectedRoutes] = useState(new Set());
  const [optimizedRoutesData, setOptimizedRoutesData] = useState(initialOptimizedRoutesData);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationError, setOptimizationError] = useState(null);
  const [optimizedRoutes, setOptimizedRoutes] = useState(new Set(initialOptimizedRoutes));
  const [optimizationProgress, setOptimizationProgress] = useState(0);
  const [currentEvaluation, setCurrentEvaluation] = useState(null);
  const [useLiveOptimization, setUseLiveOptimization] = useState(true);
  const wsRef = useRef(null);
  const [websocketData, setWebsocketData] = useState(null);

  const [acoParams, setAcoParams] = useState({
    'aco_num_ant': '20',
    'aco_max_gen': '200',
    'max_gen': '4',
    'alpha': '2',
    'beta': '3',
    'rho': '0.1',
    'q': '1',
  });

  // Add map control state variables
  const [mapStyle, setMapStyle] = useState('/styles/dark_matter.json');
  const [show3DRoutes, setShow3DRoutes] = useState(false);
  const [useRandomColors, setUseRandomColors] = useState(false);
  const [showPopulationHeatmap, setShowPopulationHeatmap] = useState(false);
  const [showCoverageHeatmap, setShowCoverageHeatmap] = useState(false);
  
  // Add multiSelectMode state here
  const [multiSelectMode, setMultiSelectMode] = useState(false);

  // Add state to track routes that have converged
  const [convergedRoutes, setConvergedRoutes] = useState(new Set());

  // Add state to track if the route carousel is visible
  const [isRouteCarouselVisible, setIsRouteCarouselVisible] = useState(false);

  // Add state for route type colors (default is false)
  const [colorByRouteType, setColorByRouteType] = useState(false);

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

  // Add toggle function
  const toggleRouteTypeColors = () => {
    setColorByRouteType(!colorByRouteType);
  };
  
  const toggleCoverageHeatmap = () => {
    setShowCoverageHeatmap(!showCoverageHeatmap);
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
      
      try {
        const result = await fetchFromAPI('/optimize-routes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            routes: routesToOptimize,
            params: acoParams
          })
        });
        
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

  const handleLiveOptimize = () => {
    if (selectedRoutes.size === 0) {
      setOptimizationError('Please select at least one route to optimize');
      return;
    }

    // Get all selected routes
    const routesToOptimize = Array.from(selectedRoutes);
    
    // Close any existing WebSocket connection
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      wsRef.current.close();
    }

    try {
      setIsOptimizing(true);
      setOptimizationError(null);
      setOptimizationProgress(0);
      setCurrentEvaluation(null);
      setWebsocketData(null);
      
      // Clear previously tracked converged routes
      setConvergedRoutes(new Set());

      // Create WebSocket connection
      const routeIdsParam = routesToOptimize.join(',');
      const ws = createWebSocket(`/optimize-live?route_ids=${encodeURIComponent(routeIdsParam)}`, city);
      wsRef.current = ws;

      // Set up ping interval to keep connection alive
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          console.log('Sending client ping to keep connection alive');
          // Send a small message to keep the connection active
          ws.send('ping');
        }
      }, 10000); // Send ping every 10 seconds

      ws.onopen = () => {
        console.log('WebSocket connection established');

        ws.send(JSON.stringify({
          params: acoParams
        }));
      };

      ws.onmessage = (event) => {
        try {
          console.log('Raw WebSocket message received:', event.data);
          
          const data = JSON.parse(event.data);
          console.log('Parsed WebSocket message:', data);
          
          // Store the complete websocket data for detailed UI rendering
          setWebsocketData(data);
          
          // Handle connection confirmation message - check with more detailed logging
          if (data.status) {
            console.log(`Message has status field: ${data.status}`);
          }
          
          if (data.status === "connected") {
            console.log(`WebSocket connection confirmed: ${data.message}`);
            setOptimizationProgress(0.1);
            return; // return here to avoid processing this as an optimization message
          }
          
          if (data.error) {
            setOptimizationError(data.error);
            ws.close();
            return;
          }

          // Handle warning messages but continue optimization
          if (data.warning) {
            console.warn(`Optimization warning: ${data.warning}`);
          }
          
          // Handle converged routes
          if (data.converged && data.converged_route) {
            console.info(`Route ${data.converged_route} has converged to optimal solution`);
            setConvergedRoutes(prev => {
              const newSet = new Set(prev);
              newSet.add(data.converged_route);
              return newSet;
            });
          }
          
          // Handle all routes converged notification
          if (data.all_converged) {
            console.info("All routes have converged to optimal solutions");
            setOptimizationProgress(100); // Set to 100% since we're done
          }

          // Update optimization progress with enhanced information
          if (data.iteration && data.total_iterations) {
            const progress = (data.iteration / data.total_iterations) * 100;
            setOptimizationProgress(progress);
            
            // Enhanced console logging with route-specific information
            if (data.current_route && data.routes_count > 1) {
              console.log(
                `Optimization progress: ${progress.toFixed(1)}% - ` +
                `Route ${data.current_route_index + 1}/${data.routes_count} (${data.current_route}), ` +
                `Iteration ${data.current_route_iteration}/${data.iterations_per_route}`
              );
            } else {
              console.log(`Optimization progress: ${progress.toFixed(1)}% (iteration ${data.iteration}/${data.total_iterations})`);
            }
            
            // If this is the last iteration, mark optimization as complete
            if (data.iteration === data.total_iterations || data.early_completion) {
              // Set isOptimizing to false since we're done
              setIsOptimizing(false);
            }
          }

          // Update evaluation score - handle array of evaluations
          if (data.evaluation) {
            // For multiple routes, show the first evaluation or a combined score
            if (Array.isArray(data.evaluation)) {
              if (data.evaluation.length > 0) {
                // Show first route's evaluation
                setCurrentEvaluation(data.evaluation[0][1]);
              }
            } else {
              setCurrentEvaluation(data.evaluation);
            }
          }

          // Update map with latest optimized routes
          if (data.geojson) {
            setOptimizedRoutesData(data.geojson);
            
            // Mark routes as optimized as soon as we get any valid geojson data
            if (data.current_route) {
              setOptimizedRoutes(prev => {
                const newSet = new Set(prev);
                newSet.add(data.current_route);
                return newSet;
              });
            } else {
              // Fallback to mark all routes as optimized
              setOptimizedRoutes(prev => {
                const newSet = new Set(prev);
                routesToOptimize.forEach(route => newSet.add(route));
                return newSet;
              });
            }
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
        setIsOptimizing(false);
        
        // Only show error if it's an abnormal closure AND not at end of optimization
        // Code 1000 means normal closure, so don't treat it as an error
        if (event.code !== 1000 && optimizationProgress < 99) {
          setOptimizationError('WebSocket connection closed unexpectedly');
        } else {
          // Clear any previous error if this is a normal completion
          setOptimizationError(null);
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
    if (useLiveOptimization) {
      handleLiveOptimize();
    } else {
      handleOptimize();
    }
  };

  // Add a cancel optimization function to close the websocket
  const cancelOptimization = () => {
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      console.log('Cancelling optimization by closing WebSocket connection');
      wsRef.current.close();
    }
    setIsOptimizing(false);
    setOptimizationError(null);
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

      const response = await fetchFromAPI('/reset-optimizations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      // Clear optimized routes data
      setOptimizedRoutes(new Set());
      setOptimizedRoutesData(null);
      
      // Verify the reset worked by checking with the server
      const verifyData = await fetchFromAPI('/get-optimizations');
      if (verifyData.routes && verifyData.routes.length > 0) {
        console.warn('Warning: Server still has optimized routes after reset');
        // Force another reset if needed
        await fetchFromAPI('/reset-optimizations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        console.log('Reset verification successful - server confirms no optimized routes');
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
      // Use the fetchFromAPI utility
      const data = await fetchFromAPI('/get-optimizations');
      
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

  // Listen for route selection to determine if carousel should be visible
  useEffect(() => {
    // Carousel shows when a single route is selected and not in multi-select mode
    setIsRouteCarouselVisible(!!selectedRoute && !multiSelectMode);
  }, [selectedRoute, multiSelectMode]);

  return (
    <div className="flex h-screen">
      <div className="relative z-10 h-full w-1/5 rounded-2xl bg-background-dk bg-opacity-20 backdrop-blur-lg">
        <Sidebar 
          data={data} 
          selectedRoutes={selectedRoutes} 
          setSelectedRoutes={setSelectedRoutes}
          selectedRoute={selectedRoute}
          setSelectedRoute={setSelectedRoute}
          multiSelectMode={multiSelectMode}
          onOptimize={handleOptimizeRoute}
          isOptimizing={isOptimizing}
          optimizationError={optimizationError}
          optimizationProgress={optimizationProgress}
          currentEvaluation={currentEvaluation}
          useLiveOptimization={useLiveOptimization}
          setUseLiveOptimization={setUseLiveOptimization}
          optimizedRoutes={optimizedRoutes}
          websocketData={websocketData}
          convergedRoutes={convergedRoutes}
          // Add map control props
          mapStyle={mapStyle}
          show3DRoutes={show3DRoutes}
          useRandomColors={useRandomColors}
          showPopulationHeatmap={showPopulationHeatmap}
          onToggleMapStyle={toggleMapStyle}
          onToggle3DRoutes={toggle3DRoutes}
          onToggleRandomColors={toggleRandomColors}
          onTogglePopulationHeatmap={togglePopulationHeatmap}
          showCoverageHeatmap={showCoverageHeatmap}
          onToggleCoverageHeatmap={toggleCoverageHeatmap}
          city={city} // Pass city prop to Sidebar
          colorByRouteType={colorByRouteType}
          onToggleRouteTypeColors={toggleRouteTypeColors}
        />
      </div>
      <div className="absolute inset-0 z-0 h-full w-full">
        <TransitMap 
          data={data} 
          selectedRoutes={selectedRoutes} 
          setSelectedRoutes={setSelectedRoutes}
          selectedRoute={selectedRoute}
          setSelectedRoute={setSelectedRoute}
          multiSelectMode={multiSelectMode}
          setMultiSelectMode={setMultiSelectMode}
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
          showCoverageHeatmap={showCoverageHeatmap}
          acoParams={acoParams}
          setAcoParams={setAcoParams}
          setIsRouteCarouselVisible={setIsRouteCarouselVisible}
          city={city} // Pass city prop to TransitMap
          colorByRouteType={colorByRouteType}
        />

        {/* Update the floating OptimizationProgress component position to bottom left with higher z-index */}
        <div className={`absolute ${isRouteCarouselVisible ? 'bottom-48' : 'bottom-6'} left-[calc(20%+24px)] z-50 transition-all duration-300`}>
          <OptimizationProgress
            isOptimizing={isOptimizing}
            optimizationProgress={optimizationProgress}
            selectedRoutes={selectedRoutes}
            websocketData={websocketData}
            convergedRoutes={convergedRoutes}
            onCancel={cancelOptimization}
          />
        </div>
      </div>
    </div>
  );
}
