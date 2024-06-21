import Link from 'next/link';

export default function Home() {
  return (
    <>
      <h1>Hello World</h1>
      <Link className="text-teal-500" href="/map">Go to map</Link>
    </>
  );
}
