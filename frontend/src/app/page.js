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
              <Link href="#overview" className="p-5 font-body text-text hover:text-primary">
                Overview
              </Link>
              <Link href="/support" className="p-5 font-body text-text hover:text-primary">
                Documentation
              </Link>
              <Link href="/faq" className="p-5 font-body text-text hover:text-primary">
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
        <div className="flex flex-col md:flex-row items-center h-screen px-6 md:px-0">
          <div className="w-full md:w-1/2 flex flex-col justify-center">
            <div className="relative">
              <div className="absolute -left-6 top-0 h-full w-1 bg-accent rounded-full"></div>
              <h1 className="ml-8 md:ml-36 mt-12 md:mt-36 w-full text-left font-heading text-5xl md:text-7xl text-accent">
                Optimize & Visualize
                <br />
                <span className="text-white">Bus Routes</span>
              </h1>
              <p className="ml-8 md:ml-36 mt-6 md:mt-10 w-full md:w-2/3 text-left font-body text-text/80 leading-relaxed">
                Our advanced algorithms analyze traffic patterns, passenger demand, and existing infrastructure to identify the most efficient transit solutions. Visualize impact with interactive 3D models that help stakeholders understand proposed changes and their benefits.
              </p>
              <div className="ml-8 md:ml-36 mt-8">
                <Link href="/city-select" className="inline-flex items-center text-primary hover:text-accent transition-colors">
                  <span>Explore Cities</span>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-2" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </ParallaxLayer>

      {/* Bento Grid Section */}
      <ParallaxLayer offset={2}>
        <div className="flex h-screen items-center justify-center">
          <div className="grid h-5/6 w-5/6 grid-cols-4 grid-rows-6 gap-4 p-4">
            <div id="overview" className="col-span-2 row-span-2 flex items-center justify-center rounded-xl bg-text-2">
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
        <div className="relative flex h-screen items-center justify-center px-6 md:px-12">
          {/* Enhanced background elements */}
          <div className="absolute left-0 top-1/4 h-1/2 w-1/3 rounded-r-full bg-accent/10 blur-3xl"></div>
          <div className="absolute right-0 bottom-1/4 h-1/3 w-1/4 rounded-l-full bg-primary/5 blur-3xl"></div>
          
          <div className="mx-auto flex w-full max-w-7xl flex-col md:flex-row items-center gap-8 md:gap-16">
            {/* Chart container with enhanced styling */}
            <div className="w-full md:w-3/5 p-4">
              <div className="rounded-xl bg-background-dk/30 p-6 backdrop-blur-sm shadow-lg border border-accent/10 relative overflow-hidden">
                {/* Decorative accent */}
                <div className="absolute -top-10 -right-10 h-20 w-20 rounded-full bg-primary/10 blur-xl"></div>
                
                <h4 className="mb-4 font-heading text-lg flex items-center text-primary">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z" />
                    <path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z" />
                  </svg>
                  Interactive Comparison Tool
                </h4>
                
                {/* Note about chart - addressing text overlap */}
                <div className="mb-2 text-xs text-text/70 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  Hover over bars to view statistics
                </div>
                
                <div className="p-1">
                  <MultiBarChart width={700} height={420} /> {/* Reduced height slightly to help with text overlap */}
                </div>
                
                <div className="mt-4 flex justify-between items-center">
                  <span className="text-xs text-text/70">Scores Generated Using a Custom Algorithm</span>
                  <button 
                    onClick={() => {
                      fetch('/data/city_stats.json')
                        .then(response => response.json())
                        .then(data => {
                          // Format data as CSV
                          const headers = ['City', 'Transit Score', 'Economic Score'];
                          const csvRows = [headers.join(',')];
                          
                          data.forEach(city => {
                            csvRows.push(`${city.name},${city.transitScore},${city.economicScore}`);
                          });
                          
                          const csvContent = csvRows.join('\n');
                          
                          // Create download link
                          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                          const url = URL.createObjectURL(blob);
                          const link = document.createElement('a');
                          link.setAttribute('href', url);
                          link.setAttribute('download', 'transit_economic_scores.csv');
                          link.style.visibility = 'hidden';
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                        });
                    }}
                    className="px-3 py-1 text-xs bg-primary/20 hover:bg-primary/30 text-primary rounded-full transition-colors"
                  >
                    Export Data
                  </button>
                </div>
              </div>
            </div>
            
            {/* Text content with improved hierarchy */}
            <div className="w-full md:w-1/2 flex flex-col">
              <div className="relative">
                <div className="absolute -left-4 top-0 h-full w-1 bg-accent rounded-full"></div>
                <h1 className="pl-6 w-full text-left font-heading text-4xl md:text-6xl bg-gradient-to-r from-accent to-primary bg-clip-text text-transparent">
                  Transit & Economic Score Comparison
                </h1>
              </div>
              
              <p className="mt-6 md:mt-8 pl-6 w-full md:w-5/6 text-left font-body text-text/80 leading-relaxed">
                Our analysis reveals the powerful correlation between transit accessibility and economic prosperity. 
                Cities with higher transit scores consistently show stronger economic growth, lower unemployment, 
                and improved quality of life metrics.
              </p>
              
              <div className="mt-6 pl-6">
                <div className="flex items-center">
                  <span className="h-3 w-3 rounded-full bg-[#f43f5e] mr-2"></span>
                  <span className="text-xs text-text/80 mr-4">Transit Score</span>
                  <span className="h-3 w-3 rounded-full bg-[#c4a76e] mr-2"></span>
                  <span className="text-xs text-text/80">Economic Score</span>
                </div>
                
                <Link href="/city-select" className="mt-6 inline-flex items-center text-primary hover:text-accent transition-colors">
                  <span>View More Cities</span>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-2" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </ParallaxLayer>

      {/* FlatMap Section */}
      <ParallaxLayer offset={4}>
        <div id="get-started" className="mx-36 mt-8 mb-0 flex flex-col">
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
