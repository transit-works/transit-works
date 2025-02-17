'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { Parallax, ParallaxLayer } from '@react-spring/parallax';
import Spline from '@splinetool/react-spline';
import ScrollIndicator from '@/components/common/ScrollIndicator';
import ProgressDial from '@/components/visualization/ProgressDial';
import MultiBarChart from '@/components/visualization/MultiBarChart';
import ReactGlobe from '@/components/visualization/Globe';
import FlatMap from '@/components/visualization/FlatMap';

export default function Home() {
  return (
    <Parallax pages={6} style={{ top: 0, left: 0 }}>
      {/* Background Layer */}
      <ParallaxLayer
        offset={0}
        style={{ zIndex: -1 }}
        className="bg-background-dk bg-opacity-10 backdrop-blur-md"
      >
        <ScrollIndicator />
      </ParallaxLayer>

      {/* Spline Animation */}
      <ParallaxLayer offset={0} speed={0.5} style={{ zIndex: -2 }}>
        <Spline scene="https://prod.spline.design/PV5Y02E7OKwYploF/scene.splinecode" />
      </ParallaxLayer>

      {/* Header Section */}
      <ParallaxLayer offset={0}>
        <header className="relative grid h-[7%] w-full grid-cols-[auto_1fr_auto] items-center px-3">
          {/* Left Div */}
          <div className="flex items-center space-x-2">
            <img src="/logo_path.png" width={45} height={45} alt="Logo" className="pr-2" />
            <p className="font-logo text-2xl text-text">TransitWorks</p>
          </div>

          {/* Center Div */}
          <div className="flex justify-center">
            <div className="flex space-x-4 md:space-x-6">
              <Link href="/features" className="p-5 font-body text-text hover:text-primary">
                Overview
              </Link>
              <Link href="/support" className="p-5 font-body text-text hover:text-primary">
                Documentation
              </Link>
              <Link href="/pricing" className="p-5 font-body text-text hover:text-primary">
                FAQs
              </Link>
            </div>
          </div>

          {/* Right Div */}
          <div className="ml-10 flex items-center space-x-2">
            <Link
              href="/map"
              className="rounded-lg bg-background px-4 py-1.5 font-body text-black hover:bg-primary hover:text-text"
            >
              Get Started
            </Link>
          </div>
        </header>

        <div className="flex h-screen flex-col items-center justify-center space-y-8">
          <h1 className="flex flex-col items-center font-heading text-8xl text-text">
            <span>Better Transit for</span>
            <span>
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Future
              </span>
              &nbsp;Cities
            </span>
          </h1>
          <p className="font-body text-xl text-text-2">
            Optimize your transit networks with TransitWorks.
          </p>
          <Link
            href="/map"
            className="mt-16 rounded-lg bg-primary px-8 py-3 font-body text-text hover:bg-background hover:text-black"
          >
            Get Started
          </Link>
        </div>
      </ParallaxLayer>

      {/* Optimize & Visualize Section */}
      <ParallaxLayer offset={1} speed={0.75}>
        <div className="fixed -right-1/2 -top-1/4">
          <Spline scene="https://prod.spline.design/N65bCqhDNa1MQxts/scene.splinecode" />
        </div>
      </ParallaxLayer>
      <ParallaxLayer offset={1}>
        <div className="flex w-1/2 flex-col justify-center">
          <h1 className="ml-36 mt-36 w-full text-left font-heading text-7xl text-accent">
            Optimize & Visualize
            <br />
            Bus Routes
          </h1>
          <p className="mx-36 mt-10 w-2/3 text-left font-body text-text">
            Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque
            laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi
            architecto beatae vitae dicta sunt explicabo. Nemo enim ipsam voluptatem quia voluptas
            sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione
            voluptatem sequi nesciunt.
          </p>
        </div>
      </ParallaxLayer>

      {/* Visualization Section */}
      <ParallaxLayer offset={2}>
        <div className="flex h-screen items-center justify-center">
          <div className="grid h-5/6 w-5/6 grid-cols-4 grid-rows-6 gap-4 p-4">
            <div className="col-span-2 row-span-2 flex items-center justify-center rounded-xl bg-text-2">
              <h1 className="bg-gradient-to-r from-primary to-accent bg-clip-text font-logo text-9xl text-transparent">
                Overview
              </h1>
            </div>
            <div className="col-span-2 row-span-6 flex flex-col items-center justify-center rounded-xl bg-accent">
              <img src="/assets/imgs/map.png" alt="Map Visualization" />
              <p className="mb-4 mt-auto p-4">
                Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium
                doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore
                veritatis et quasi architecto beatae vitae dicta sunt explicabo. Nemo enim ipsam
                voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur
                magni dolores eos qui ratione voluptatem sequi nesciunt.
              </p>
            </div>
            <div className="globe relative col-span-1 row-span-4 flex flex-col items-center justify-between rounded-xl bg-secondary p-4">
              <ReactGlobe />
              <div className="mt-auto">
                <p className="font-body text-sm text-white">
                  View transit data and optimize routes from all over the world.
                </p>
              </div>
            </div>
            <div className="col-span-1 row-span-2 flex items-center justify-center rounded-xl bg-primary p-4">
              <div className="rounded-lg bg-black bg-opacity-90 p-4 backdrop-blur-md">
                <ProgressDial percentage={83} name="Transit Score" />
              </div>
              <div className="my-auto w-1/2">
                <p className="p-4 font-body text-sm text-white">
                  View transit scores for real-time route evaluations.
                </p>
              </div>
            </div>
            <div className="col-span-1 row-span-2 flex items-center justify-center rounded-xl bg-text-2">
              <Spline scene="https://prod.spline.design/9jYOc1cUoGV4nrzj/scene.splinecode" />
            </div>
          </div>
        </div>
      </ParallaxLayer>

      {/* MultiBarChart Section */}
      <ParallaxLayer offset={3}>
        <div className="flex h-screen items-center justify-center">
          <div className="ml-36 w-1/2">
            <MultiBarChart width={600} height={600} />
          </div>
          <div className="flex w-1/2 flex-col">
            <h1 className="mt-36 w-full text-left font-heading text-7xl text-accent">
              Transit & Economic Score Comparison
              <br />
            </h1>
            <p className="mt-10 w-2/3 text-left font-body text-text">
              Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque
              laudantium, totam rem aperiam, eaque ipsa quae ab illo.
            </p>
          </div>
        </div>
      </ParallaxLayer>

      {/* FlatMap Section */}
      <ParallaxLayer offset={4}>
        <div id="get-started" className="mx-36 mb-0 flex flex-col">
          <h2 className="mb-2 w-full font-heading text-6xl text-primary md:text-7xl lg:w-2/3">
            Get Started with Transit Optimization
          </h2>
          <h3 className="text-white">
            View detailed transit statistics and optimizations for cities all over the world.
          </h3>
        </div>
        <div className="mt-32 flex h-full w-full items-center justify-center">
          <FlatMap />
        </div>
      </ParallaxLayer>

      <ParallaxLayer offset={5} className="-z-10">
        <footer className="absolute bottom-0 w-full bg-zinc-900 py-8 text-gray-300">
          <div className="container mx-auto flex flex-col items-center space-y-4">
            <div className="text-center">
              <p className="font-body text-sm">
                &copy; {new Date().getFullYear()}{' '}
                <span className="font-semibold text-white">TransitWorks</span>. All rights reserved.
              </p>
              <p className="font-body text-xs">
                Icons provided by{' '}
                <a
                  href="https://icons8.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Icons8
                </a>
                .
              </p>
            </div>
            <div className="flex space-x-6">
              <Link
                href="/privacy"
                className="text-sm text-gray-300 transition duration-200 hover:text-primary"
              >
                Privacy Policy
              </Link>
              <Link
                href="/docs"
                className="text-sm text-gray-300 transition duration-200 hover:text-primary"
              >
                Documentation
              </Link>
              <Link
                href="/contact"
                className="text-sm text-gray-300 transition duration-200 hover:text-primary"
              >
                Contact Us
              </Link>
            </div>
            <div className="flex space-x-4">
              <a
                href="https://github.com/yourgithubprofile"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-2 transition duration-200 hover:opacity-75"
              >
                <img src="/assets/icons/github.png" alt="GitHub" className="h-5 w-5" />
                <span className="text-sm text-gray-300">GitHub</span>
              </a>
            </div>
          </div>
        </footer>
      </ParallaxLayer>
    </Parallax>
  );
}
