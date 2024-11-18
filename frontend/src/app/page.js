'use client'

import Link from 'next/link'
import {Parallax, ParallaxLayer} from '@react-spring/parallax';
import Spline from '@splinetool/react-spline';
import React from 'react';
import ScrollIndicator from "@/components/common/ScrollIndicator";
import ProgressDial from '@/components/visualization/ProgressDial';
import ReactGlobe from '@/components/visualization/Globe';

export default function Home() {
    const N = 10;
    const gData = [...Array(N).keys()].map(() => ({
        lat: (Math.random() - 0.5) * 180,
        lng: (Math.random() - 0.5) * 360,
        maxR: Math.random() * 20 + 3,
        propagationSpeed: (Math.random() - 0.5) * 20 + 1,
        repeatPeriod: Math.random() * 2000 + 200
    }));

    const colorInterpolator = t => `rgba(255,100,50,${Math.sqrt(1-t)})`;

  return (
      <Parallax pages={3} style={{ top: 0, left: 0 }}>
          <ParallaxLayer offset={0} style={{ zIndex: -1}} className="bg-background-dk bg-opacity-10 backdrop-blur-md">
              <ScrollIndicator />
          </ParallaxLayer>
          <ParallaxLayer offset={0} speed={0.5} style={{ zIndex: -2}} >
              <Spline scene="https://prod.spline.design/PV5Y02E7OKwYploF/scene.splinecode" />
          </ParallaxLayer>
          <ParallaxLayer offset={0}>
              <header className="relative w-full h-[7%] grid grid-cols-[auto_1fr_auto] items-center px-3">
                  {/* Left Div */}
                  <div className="flex items-center space-x-2">
                      <img src="/logo_path.png" width={45} height={45} alt="Logo" className="pr-2"/>
                      <p className="text-text font-logo text-2xl">TransitWorks</p>
                  </div>

                  {/* Center Div */}
                  <div className="flex justify-center">
                      <div className="flex space-x-4 md:space-x-6">
                          <Link href="/features" className="text-text font-body p-5 hover:text-primary">Features</Link>
                          <Link href="/support" className="text-text font-body p-5 hover:text-primary">Support</Link>
                          <Link href="/pricing" className="text-text font-body p-5 hover:text-primary">Pricing</Link>
                      </div>
                  </div>

                  {/* Right Div */}
                  <div className="flex items-center space-x-2 ml-10">
                      <Link href="/login" className="text-text font-body p-2 hover:text-primary">Login</Link>
                      <Link href="/map"
                            className="px-4 py-1.5 bg-background text-black font-body rounded-lg hover:bg-primary hover:text-text">
                          Sign Up
                      </Link>
                  </div>
              </header>


              <div className="flex flex-col items-center justify-center h-screen space-y-8">
                  <h1 className="font-heading text-text text-8xl flex flex-col items-center">
                      <span>Better Transit for</span>
                      <span>
                  <span className="bg-clip-text bg-gradient-to-r from-primary to-accent text-transparent">
                    Future
                  </span>
                          &nbsp;Cities
                  </span>
                  </h1>
                  <p className="text-text-2 font-body text-xl">Optimize your transit networks with TransitWorks.</p>
                  <Link href="/map"
                        className="mt-16 px-8 py-3 bg-primary text-text font-body rounded-lg hover:bg-background hover:text-black">
                      Get Started
                  </Link>
              </div>
          </ParallaxLayer>
          <ParallaxLayer offset={1} speed={0.75}>
              <div className="fixed -right-1/2 -top-1/4">
                  <Spline
                      scene="https://prod.spline.design/N65bCqhDNa1MQxts/scene.splinecode"
                  />
              </div>
          </ParallaxLayer>
          <ParallaxLayer offset={1}>
              <div className="w-1/2 flex flex-col justify-center">
                  <h1 className="text-accent font-heading text-7xl text-left w-full ml-36 mt-36">
                      Optimize & Visualize<br/>Bus Routes
                  </h1>
                  <p className="text-text font-body text-left w-2/3 mx-36 mt-10">
                      Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum
                  </p>
              </div>
          </ParallaxLayer>
          <ParallaxLayer offset={2}>
              <div className="flex justify-center items-center h-screen">
                  <div className="w-5/6 h-5/6 grid grid-cols-4 grid-rows-6 gap-4 p-4">
                      <div className="col-span-2 row-span-2 flex justify-center items-center rounded-xl bg-text-2">
                          <h1 className="font-logo text-9xl text-transparent bg-gradient-to-r from-primary to-accent bg-clip-text"> Overview </h1>
                      </div>

                      <div className="flex flex-col col-span-2 row-span-6 flex justify-center items-center rounded-xl bg-accent">
                          <img src="/assets/imgs/map.png" />
                          <p className="p-4 mt-auto mb-4">Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo. Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse quam nihil molestiae consequatur, vel illum qui dolorem eum fugiat quo voluptas nulla pariatur.</p>
                      </div>

                      <div
                        className="globe flex flex-col col-span-1 row-span-4 justify-between items-center relative rounded-xl bg-secondary p-4">
                          <ReactGlobe />
                          <div className="mt-auto">
                              <p className="text-white font-body text-sm">View transit data and optimize routes from all over the world.</p>
                          </div>
                      </div>


                      <div className="col-span-1 row-span-2 flex justify-center items-center rounded-xl bg-primary p-4">
                          <div
                            className="bg-black bg-opacity-90 backdrop-blur-md rounded-lg p-4">
                              <ProgressDial percentage={83} name="Transit Score" />
                          </div>
                          <div className="w-1/2 my-auto">
                              <p className="text-white font-body text-sm p-4">View transit scores for real-time route
                                                                              evaluations.</p>
                          </div>
                      </div>
                      <div className="col-span-1 row-span-2 flex justify-center items-center rounded-xl bg-text-2">
                          <Spline scene="https://prod.spline.design/9jYOc1cUoGV4nrzj/scene.splinecode" />
                      </div>
                  </div>
              </div>


          </ParallaxLayer>
      </Parallax>
  );
}
