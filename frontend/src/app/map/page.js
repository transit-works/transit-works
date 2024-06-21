import dynamic from 'next/dynamic';

const Map = dynamic(() => import('../../components/maps/Map'), { ssr: false });

export default function MapTest() {
  return (
    <div>
      <h1>Dev Map</h1>
      <Map />
    </div>
  );
}