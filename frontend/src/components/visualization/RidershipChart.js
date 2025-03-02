'use client';

import { useMemo, useRef, useEffect, useState } from 'react';
import { Bar } from '@visx/shape';
import { Group } from '@visx/group';
import { scaleBand, scaleLinear } from '@visx/scale';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { GridRows } from '@visx/grid';
import { useTooltip } from '@visx/tooltip';
import { LinearGradient } from '@visx/gradient';

export default function RidershipChart({ data, width = 250, height = 160 }) {
  const [dimensions, setDimensions] = useState({ width, height });
  const containerRef = useRef(null);
  const { showTooltip, hideTooltip, tooltipData, tooltipLeft, tooltipTop } = useTooltip();

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
  }, []);

  // Graph dimensions and margins
  const margin = { top: 20, right: 0, bottom: 40, left: 30 }; // Reduced left margin
  const innerWidth = dimensions.width - margin.left - margin.right;
  const innerHeight = dimensions.height - margin.top - margin.bottom;

  // Scales
  const xScale = useMemo(() => {
    return scaleBand({
      range: [0, innerWidth],
      domain: data.map((_, i) => i),
      padding: 0.2
    });
  }, [innerWidth, data]);

  const yScale = useMemo(() => {
    const maxValue = Math.max(...data);
    return scaleLinear({
      range: [innerHeight, 0],
      domain: [0, maxValue + (maxValue * 0.1)], // Add 10% padding at the top
      nice: true
    });
  }, [innerHeight, data]);

  if (!data || data.length === 0) {
    return <div className="flex items-center justify-center w-full h-[150px] text-white">No data available</div>;
  }

  return (
    <div className="relative" ref={containerRef}>
      <svg width={dimensions.width} height={dimensions.height}>
        <LinearGradient
          id="bar-gradient"
          from="#CC0050"
          to="#ffa826"
          vertical={false}
        />
        <rect width={dimensions.width} height={dimensions.height} fill="rgb(24 24 27 / 0%)" rx={4} />
        <Group left={margin.left} top={margin.top}>
          <GridRows
            scale={yScale}
            width={innerWidth}
            strokeDasharray="2,2"
            stroke="#374151"
            strokeOpacity={0.6}
          />
          <AxisLeft
            scale={yScale}
            numTicks={4}  // Set this to 3-5 for good spacing
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
          {data.map((d, i) => {
            const barWidth = xScale.bandwidth();
            const barHeight = innerHeight - yScale(d);
            const barX = xScale(i);
            const barY = yScale(d);
            
            return (
              <Bar
                key={`bar-${i}`}
                x={barX}
                y={barY}
                width={barWidth}
                height={barHeight}
                fill="url(#bar-gradient)"
                onMouseLeave={hideTooltip}
                onMouseMove={() => {
                  showTooltip({
                    tooltipData: d,
                    tooltipLeft: barX + barWidth / 2,
                    tooltipTop: barY - 10,
                  });
                }}
              />
            );
          })}
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
          <strong>Riders: {tooltipData}</strong>
        </div>
      )}
    </div>
  );
}
