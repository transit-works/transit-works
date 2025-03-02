'use client';

import { useState } from 'react';
import { Parallax, ParallaxLayer } from '@react-spring/parallax';
import Spline from '@splinetool/react-spline';

export default function FAQ() {
  // State to manage expanded questions
  const [expanded, setExpanded] = useState(null);

  const toggleExpand = (index) => {
    setExpanded(expanded === index ? null : index); // Toggle the expansion of the clicked FAQ
  };

  const faqs = [
    {
      question: "Why optimize?",
      answer: "Good for environment and saves time for passengers."
    },
    {
      question: "Which geographical locations does this app support?",
      answer: "Locations all over the world."
    },
    {
      question: "What kind of routes gets optimized?",
      answer: "Bus and bike routes."
    },
  ];

  return (
    <div style={{ height: '100vh', width: '100vw', position: 'relative', overflow: 'hidden' }}>
      <Parallax pages={1}>
        
        {/* Background Layer */}
        <ParallaxLayer
          offset={0}
          style={{ zIndex: -1 }}
          className="bg-background-dk bg-opacity-10 backdrop-blur-md"
        >
        </ParallaxLayer>
        
        {/* Spline background animation */}
        <ParallaxLayer 
          offset={0} 
          speed={0.5} 
          style={{ 
            zIndex: -2, 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            width: '100%', 
            height: '100%' 
          }}
        >
          <Spline scene="https://prod.spline.design/PV5Y02E7OKwYploF/scene.splinecode" />
        </ParallaxLayer>

        {/* Page content */}
        <ParallaxLayer 
          offset={0} 
          speed={0.5} 
          style={{ 
            zIndex: 1, 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            width: '100%', 
            height: '100%',
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center',
            color: 'white', 
            textAlign: 'center' 
          }}
        >
          <div className="flex h-screen flex-col items-center justify-center space-y-8">
            <h1 className="font-heading text-5xl bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Frequently Asked Questions
            </h1>

            {/* FAQ Section */}
            <div className="flex flex-col items-center space-y-6 w-full max-w-4xl px-4">
              {faqs.map((faq, index) => (
                <div key={index} className="w-full">
                  {/* Question Section */}
                  <div 
                    onClick={() => toggleExpand(index)}
                    className="cursor-pointer bg-transparent p-5 border-b border-gray-300 hover:bg-gray-400 transition-all duration-300 ease-in-out"
                  >
                    <h2 className="font-heading text-3xl text-text">{faq.question}</h2>
                  </div>

                  {/* Answer Section */}
                  {expanded === index && (
                    <div className="p-5 rounded-md mt-2">
                      <p className="font-body text-xl text-text-2">{faq.answer}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </ParallaxLayer>
        
      </Parallax>
    </div>
  );
}
