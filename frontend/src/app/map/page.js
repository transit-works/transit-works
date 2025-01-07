import { Suspense } from 'react';
import MapView from '../../components/views/MapView';
import Loading from './loading'; // Import a custom loading component


async function fetchGeoJsonData() {
    // const response = await fetch('http://localhost:3000/data.geojson');
    const response = await fetch('http://localhost:8080/get-data');
    const data = await response.json();
    return data;
}

export default async function MapPage() {
    const data = await fetchGeoJsonData();

    return (
        <Suspense fallback={<Loading />}>
            <MapView data={data} />
        </Suspense>
    );
}
