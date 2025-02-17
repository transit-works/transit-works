'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Sidebar from '../maps/Sidebar';

// Dynamically import MapView with no SSR to ensure it runs only on the client
const TransitMap = dynamic(() => import('../maps/TransitMap'), { ssr: false });

export default function MapView({ data }) {
  const [selectedRoute, setSelectedRoute] = useState(null);

  return (
    <div className="flex h-screen">
      <div className="relative z-10 h-full w-1/5 rounded-2xl bg-background-dk bg-opacity-20 backdrop-blur-lg">
        <Sidebar data={data} selectedRoute={selectedRoute} setSelectedRoute={setSelectedRoute} />
      </div>
      <div className="absolute inset-0 z-0 h-full w-full">
        <TransitMap data={data} selectedRoute={selectedRoute} setSelectedRoute={setSelectedRoute} />
      </div>
    </div>
  );
}
