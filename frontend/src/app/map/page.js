'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import MapView from '../../components/views/MapView';
import Loading from './loading';
import { fetchFromAPI } from '@/utils/api';

// Main page component that wraps the client map view
export default function MapPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ClientMapView />
    </Suspense>
  );
}

// The client component to handle data fetching with the city parameter
function ClientMapView() {
  const searchParams = useSearchParams();
  const city = searchParams.get('city') || 'toronto'; // Default to Toronto
  
  const [data, setData] = useState(null);
  const [optimizedData, setOptimizedData] = useState(null);
  const [optimizedRoutes, setOptimizedRoutes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Store the city in localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('selectedCity', city);
    }
    
    // Fetch GeoJSON data with the city parameter
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Fetch main data
        const geoData = await fetchFromAPI('/get-data', {}, city);
        setData(geoData);
        
        // Fetch optimized data if available
        try {
          const optData = await fetchFromAPI('/get-optimizations', {}, city);
          if (optData.geojson && optData.routes) {
            setOptimizedData(optData.geojson);
            setOptimizedRoutes(optData.routes);
          }
        } catch (optError) {
          console.warn('Optional optimized data not available:', optError);
          // Don't fail the whole load if just optimized data is missing
          setOptimizedData(null);
          setOptimizedRoutes([]);
        }
      } catch (err) {
        console.error('Error fetching data:', err);
        setError(err.message);
        
        // Fallback to local file if backend is not available
        try {
          const response = await fetch('/data.geojson');
          const fallbackData = await response.json();
          setData(fallbackData);
        } catch (fallbackErr) {
          console.error('Fallback data fetch failed:', fallbackErr);
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [city]);

  if (isLoading) {
    return <Loading />;
  }

  if (error && !data) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="bg-red-500/20 p-6 rounded-lg text-white">
          <h2 className="text-xl font-bold mb-2">Error loading data</h2>
          <p>{error}</p>
          <p className="mt-2">Please check if the backend server is running.</p>
        </div>
      </div>
    );
  }

  return (
    <MapView 
      data={data} 
      initialOptimizedRoutesData={optimizedData} 
      initialOptimizedRoutes={optimizedRoutes} 
      city={city} 
    />
  );
}
