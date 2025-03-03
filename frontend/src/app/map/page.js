import { Suspense } from 'react';
import MapView from '../../components/views/MapView';
import Loading from './loading'; // Import a custom loading component

async function fetchGeoJsonData() {
    const response = await fetch('http://localhost:8080/get-data');
    const data = await response.json();
    return data;
}

async function fetchOptimizedGeoJsonData() {
    const response = await fetch('http://localhost:8080/get-optimizations');
    const data = await response.json();
    if (data.geojson && data.routes) {
      return [data.geojson, data.routes];
    }
    return [null, []];
}

export default async function MapPage() {
  const data = await fetchGeoJsonData();
  const optData = await fetchOptimizedGeoJsonData();
  const [optimizedData, routes] = optData;

  return (
    <Suspense fallback={<Loading />}>
      <MapView data={data} initialOptimizedRoutesData={optimizedData} initialOptimizedRoutes={routes} />
    </Suspense>
  );
}
