'use client';

import { useMemo, useRef, useEffect, useState } from 'react';
import { Group } from '@visx/group';
import { curveBasis } from '@visx/curve';
import { LinePath } from '@visx/shape';
import { Threshold } from '@visx/threshold';
import { scaleBand, scaleLinear } from '@visx/scale';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { GridRows, GridColumns } from '@visx/grid';
import { useTooltip } from '@visx/tooltip';
import { LinearGradient } from '@visx/gradient';

export default function RidershipChart({ ridership = [], optRidership = [], width = 250, height = 160 }) {
  const [dimensions, setDimensions] = useState({ width, height });
  const containerRef = useRef(null);
  const { showTooltip, hideTooltip, tooltipData, tooltipLeft, tooltipTop } = useTooltip();

  // Pad arrays to ensure they have the same length
  const { paddedRidership, paddedOptRidership } = useMemo(() => {
    const maxLength = Math.max(ridership.length, optRidership.length);
    
    const paddedRidership = [...ridership];
    const paddedOptRidership = [...optRidership];
    
    // Pad the shorter array with zeros
    while (paddedRidership.length < maxLength) {
      paddedRidership.push(0);
    }
    
    while (paddedOptRidership.length < maxLength) {
      paddedOptRidership.push(0);
    }
    
    return { paddedRidership, paddedOptRidership };
  }, [ridership, optRidership]);

  // Use ResizeObserver to adjust chart size to container
  useEffect(() => {
    if (!containerRef.current) return;
    
    const resizeObserver = new ResizeObserver(entries => {
      if (!entries[0]) return;
      const { width: containerWidth } = entries[0].contentRect;
      if (containerWidth > 0) {
        setDimensions({ 
          width: Math.min(containerWidth - 10, width), // Subtract padding
          height 
        });
      }
    });
    
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [height, width]);

  // Graph dimensions and margins
  const margin = { top: 20, right: 10, bottom: 40, left: 40 };
  const innerWidth = dimensions.width - margin.left - margin.right;
  const innerHeight = dimensions.height - margin.top - margin.bottom;

  // Format data for display
  const data = useMemo(() => {
    return paddedRidership.map((value, index) => ({
      index,
      ridership: value,
      optRidership: paddedOptRidership[index]
    }));
  }, [paddedRidership, paddedOptRidership]);

  // Scales
  const xScale = useMemo(() => {
    return scaleBand({
      range: [0, innerWidth],
      domain: data.map(d => d.index),
      padding: 0.2
    });
  }, [innerWidth, data]);

  const yScale = useMemo(() => {
    const allValues = [...paddedRidership, ...paddedOptRidership];
    const maxValue = Math.max(...allValues);
    return scaleLinear({
      range: [innerHeight, 0],
      domain: [0, maxValue + (maxValue * 0.1)], // Add 10% padding at the top
      nice: true
    });
  }, [innerHeight, paddedRidership, paddedOptRidership]);

  // Add null check to prevent TypeError when d is undefined
  const getX = d => {
    if (!d) return 0;
    return xScale(d.index) + xScale.bandwidth() / 2;
  };
  
  if (!paddedRidership || paddedRidership.length === 0) {
    return <div className="flex items-center justify-center w-full h-[150px] text-white">No data available</div>;
  }

  return (
    <div className="relative" ref={containerRef}>
      <svg width={dimensions.width} height={dimensions.height}>
        <LinearGradient
          id="ridership-gradient"
          from="#CC0050"
          to="#ff4080"
          vertical={false}
        />
        <LinearGradient
          id="opt-gradient"
          from="#00CC50" 
          to="#40ff80"   
          vertical={false}
        />
        {/* Add separate gradients for the threshold areas */}
        <LinearGradient
          id="worse-gradient"
          from="rgba(204, 0, 80, 0.7)"
          to="rgba(204, 0, 80, 0.5)"
          vertical={false}
        />
        <LinearGradient
          id="better-gradient"
          from="rgba(0, 204, 80, 0.7)"
          to="rgba(0, 204, 80, 0.5)"
          vertical={false}
        />
        <rect 
          width={dimensions.width} 
          height={dimensions.height} 
          fill="rgb(24 24 27 / 0%)" 
          rx={4} 
        />
        <Group left={margin.left} top={margin.top}>
          <GridRows
            scale={yScale}
            width={innerWidth}
            strokeDasharray="2,2"
            stroke="#374151"
            strokeOpacity={0.6}
          />
          <GridColumns
            scale={xScale}
            height={innerHeight}
            strokeDasharray="2,2"
            stroke="#374151"
            strokeOpacity={0.3}
          />
          <AxisLeft
            scale={yScale}
            numTicks={4}
            tickStroke="#374151"
            stroke="#374151"
            tickLabelProps={() => ({
              fill: '#9ca3af',
              fontSize: 10,
              textAnchor: 'end',
              dx: '-0.25em',
              dy: '0.25em'
            })}
          />
          <AxisBottom
            scale={xScale}
            top={innerHeight}
            numTicks={Math.min(7, data.length)}
            tickFormat={value => {
              return `${value + 1}`;
            }}
            tickStroke="#374151"
            stroke="#374151"
            tickLabelProps={() => ({
              fill: '#9ca3af',
              fontSize: 10,
              textAnchor: 'middle',
              dy: '0.75em',
            })}
          />
          
          
          {/* Combined threshold area */}
          <Threshold
            id="ridership-threshold"
            data={data}
            x={d => getX(d)}
            y0={d => yScale(d.optRidership || 0)}
            y1={d => yScale(d.ridership || 0)}
            clipAboveTo={0}
            clipBelowTo={innerHeight}
            aboveAreaProps={{
              fill: 'url(#better-gradient)',
              fillOpacity: 0.8,
            }}
            belowAreaProps={{
              fill: 'url(#worse-gradient)',
              fillOpacity: 0.8,
            }}
          />
          
          {/* Optimized ridership line - drawn FIRST (underneath) */}
          <LinePath
            data={data}
            x={d => getX(d)}
            y={d => yScale(d.optRidership || 0)}
            stroke="url(#opt-gradient)"
            strokeWidth={2}
            strokeOpacity={0.8}
            curve={curveBasis}
          />
          
          {/* Original ridership line - drawn LAST (on top) */}
          <LinePath
            data={data}
            x={d => getX(d)}
            y={d => yScale(d.ridership || 0)}
            stroke="url(#ridership-gradient)"
            strokeWidth={2}
            strokeOpacity={0.8}
            curve={curveBasis}
            onTouchStart={(event, d) => {
              if (!d) return;
              hideTooltip();
              showTooltip({
                tooltipData: d,
                tooltipLeft: getX(d),
                tooltipTop: yScale(d.ridership || 0) - 10,
              });
            }}
            onTouchMove={(event, d) => {
              if (!d) return;
              showTooltip({
                tooltipData: d,
                tooltipLeft: getX(d),
                tooltipTop: yScale(d.ridership || 0) - 10,
              });
            }}
            onMouseMove={(event, d) => {
              if (!d) return;
              showTooltip({
                tooltipData: d,
                tooltipLeft: getX(d),
                tooltipTop: yScale(d.ridership || 0) - 10,
              });
            }}
            onMouseLeave={() => hideTooltip()}
            onTouchEnd={() => hideTooltip()}
          />
        </Group>
      </svg>
      
      {tooltipData && (
        <div
          className="absolute bg-black/85 text-white p-2 rounded text-sm pointer-events-none"
          style={{
            top: tooltipTop,
            left: tooltipLeft,
            transform: 'translate(-50%, -100%)'
          }}
        >
          <div>Current: {tooltipData.ridership}</div>
          <div>Optimized: {tooltipData.optRidership}</div>
        </div>
      )}
    </div>
  );
}
