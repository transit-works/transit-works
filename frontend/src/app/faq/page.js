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
      question: "What kind of transit routes gets optimized?",
      answer: "Bus routes"
    },
    {
      question: "What data does the software use?",
      answer: "The software utilizes publicly available data, including transit schedules (GTFS), road network details (OpenStreetMap), population demographics, and land-use information."
    },
    {
      question: "What kind of simulation does the software perform?",
      answer: "The software leverages real-world data and meta-heuristic algorithms like Ant Colony Optimization to simulate improvements in bus routes. Routes are evaluated against multiple commuter-focused metrics such as minimizing total travel time, reducing transfers, improving service frequency, and enhancing geographic coverage."
    },
    {
      question: "How does the software determine commuter flow and population density?",
      answer: "The software calculates commuter flow between geographic zones using the Gravity Model, which estimates travel demand based on factors like population density, land use, and the distance between zones. This approach allows the software to accurately reflect real-world travel patterns and optimize bus routes to directly address commuter needs."
    },
    {
      question: "Why use Ant Colony Optimization (ACO)?",
      answer: "Ant Colony Optimization is chosen for its efficiency in solving complex routing problems involving multiple constraints and optimization criteria. ACO mimics the natural behavior of ants finding optimal paths, allowing our software to explore numerous potential transit solutions and converge quickly on effective route improvements."
    },
    {
      question: "Which geographical locations does this app support?",
      answer: "Currently, Austin, Toronto, Vancouver, and San Francisco are supported for optimization. More cities will be added in the future!"
    },
    {
      question: "How quickly can transit agencies expect to see results?",
      answer: "Transit agencies can expect to see insights and initial recommendations shortly after inputting their data. Since the software builds upon existing infrastructure, improvements in transit efficiency can typically be done with minimal investment."
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
