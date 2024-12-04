'use client';

import React, { useRef, useEffect } from 'react';
import Globe from 'react-globe.gl';

function ReactGlobe() {
  const globeRef = useRef();

  // Generate random data for the rings
  const N = 10;
  const gData = [...Array(N).keys()].map(() => ({
    lat: (Math.random() - 0.5) * 180,
    lng: (Math.random() - 0.5) * 360,
    maxR: Math.random() * 20 + 3,
    propagationSpeed: (Math.random() - 0.5) * 20 + 1,
    repeatPeriod: Math.random() * 2000 + 200,
  }));

  const colorInterpolator = (t) => `rgba(255,22,67,${Math.sqrt(1 - t)})`;

  useEffect(() => {
    if (globeRef.current) {
      // Optional: Set the initial view of the globe
      globeRef.current.pointOfView({ lat: 45, lng: 22, altitude: 2 }, 0);
      const controls = globeRef.current.controls();
      controls.enableZoom = false;
    }
  }, []);

  return (
    <div className="flex justify-center align-middle  ">
      <Globe
        ref={globeRef}
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-dark.jpg" // Custom Earth texture
        ringsData={gData}
        ringColor={() => colorInterpolator}
        ringMaxRadius="maxR"
        ringPropagationSpeed="propagationSpeed"
        ringRepeatPeriod="repeatPeriod"
        backgroundColor="rgba(0, 0, 0, 0)"
        width={300}
        height={300}
      />
    </div>
  );
}

export default ReactGlobe;
