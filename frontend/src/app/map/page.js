import dynamic from 'next/dynamic';

const Map = dynamic(() => import('../../components/maps/Map'), { ssr: false });

export default function MapTest() {
  return (
    <div className="h-screen flex">
        <div className="relative h-full w-1/5 bg-background-dk bg-opacity-20 backdrop-blur-lg z-10 rounded-2xl">
            <h2 className="text-amber-50 text-center">Hello World</h2>
        </div>
        <div className="absolute inset-0 h-full w-full z-0">
            <Map />
        </div>
    </div>
  );
}