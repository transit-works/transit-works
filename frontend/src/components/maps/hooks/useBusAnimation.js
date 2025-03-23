import { useState, useEffect } from 'react';

function getDistance(coord1, coord2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(coord2[1] - coord1[1]);
  const dLon = toRad(coord2[0] - coord1[0]);
  const lat1 = toRad(coord1[1]);
  const lat2 = toRad(coord2[1]);
  const a = 
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function useBusAnimation({
  selectedRoute,
  multiSelectMode,
  effectiveSelectedRoutes,
  data,
  optimizedRoutes,
  optimizedRoutesData
}) {
  const [busPositions, setBusPositions] = useState(new window.Map());

  useEffect(() => {
    let animationFrames = new window.Map();
    
    // Determine which routes to animate
    const routesToAnimate = multiSelectMode 
      ? Array.from(effectiveSelectedRoutes) 
      : (selectedRoute ? [selectedRoute] : []);
      
    // Clean up any buses for routes no longer selected
    setBusPositions(prev => {
      const newPositions = new window.Map(prev);
      Array.from(prev.keys()).forEach(routeId => {
        if (!routesToAnimate.includes(routeId)) {
          newPositions.delete(routeId);
        }
      });
      return newPositions;
    });
    
    // Start animation for each route
    routesToAnimate.forEach(routeId => {
      const routeFeature = optimizedRoutes.has(routeId) 
        ? optimizedRoutesData?.features.find(
            feature =>
              feature.properties.route_id === routeId &&
              feature.geometry.type === 'LineString'
          )
        : data.features.find(
            feature =>
              feature.properties.route_id === routeId &&
              feature.geometry.type === 'LineString'
          );
          
      if (routeFeature) {
        const routeCoordinates = routeFeature.geometry.coordinates;
        if (routeCoordinates.length < 2) {
          // Skip routes with insufficient coordinates
          return;
        }

        const cumulativeDistances = [];
        let totalDistance = 0;
        const numPoints = routeCoordinates.length;
        for (let i = 0; i < numPoints - 1; i++) {
          cumulativeDistances.push(totalDistance);
          totalDistance += getDistance(routeCoordinates[i], routeCoordinates[i + 1]);
        }
        cumulativeDistances.push(totalDistance);

        const speed = 0.1;
        let travelled = 0;
        let lastTimestamp;

        const animate = (timestamp) => {
          if (!lastTimestamp) lastTimestamp = timestamp;
          const delta = timestamp - lastTimestamp;
          lastTimestamp = timestamp;
          travelled += speed * delta;

          if (travelled >= totalDistance) {
            setBusPositions(prev => {
              const newPositions = new window.Map(prev);
              newPositions.set(routeId, routeCoordinates[0]);
              return newPositions;
            });
            travelled = 0;
            lastTimestamp = timestamp;
            animationFrames.set(routeId, requestAnimationFrame(animate));
            return;
          }

          let segmentIndex = 0;
          while (
            segmentIndex < cumulativeDistances.length - 1 &&
            cumulativeDistances[segmentIndex + 1] <= travelled
          ) {
            segmentIndex++;
          }
          const segmentStart = cumulativeDistances[segmentIndex];
          const segmentEnd = cumulativeDistances[segmentIndex + 1];
          const segmentDistance = segmentEnd - segmentStart;
          const segmentProgress = (travelled - segmentStart) / segmentDistance;

          const currentPos = routeCoordinates[segmentIndex];
          const nextPos = routeCoordinates[segmentIndex + 1];
          const interpolatedPosition = [
            currentPos[0] + segmentProgress * (nextPos[0] - currentPos[0]),
            currentPos[1] + segmentProgress * (nextPos[1] - currentPos[1]),
          ];

          // Update this route's bus position
          setBusPositions(prev => {
            const newPositions = new window.Map(prev);
            newPositions.set(routeId, interpolatedPosition);
            return newPositions;
          });
          
          animationFrames.set(routeId, requestAnimationFrame(animate));
        };

        animationFrames.set(routeId, requestAnimationFrame(animate));
      }
    });

    return () => {
      // Cancel all animation frames when cleaning up
      animationFrames.forEach(frameId => cancelAnimationFrame(frameId));
    };
  }, [effectiveSelectedRoutes, selectedRoute, multiSelectMode, data, optimizedRoutes, optimizedRoutesData]);

  return { busPositions, setBusPositions };
}