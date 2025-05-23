import React, { useState, useEffect, useRef } from 'react';
import { Group } from '@visx/group';
import { BarGroup } from '@visx/shape';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { useTooltip, defaultStyles } from '@visx/tooltip';
import { scaleBand, scaleLinear, scaleOrdinal } from '@visx/scale';
import { LinearGradient } from '@visx/gradient';

const blue = '#f43f5e';
export const green = '#c4a76e';
const grey = '#555555'; // Grey color for coming soon cities

const tooltipStyles = {
  ...defaultStyles,
  backgroundColor: 'rgba(0,0,0,0.9)',
  color: 'white',
  borderRadius: '4px',
  padding: '5px',
};

const defaultMargin = { top: 40, right: 0, bottom: 80, left: 50 };

const colorScale = scaleOrdinal({
  range: [blue, green],
});

export default function MultiBarChart({ width, height, events = false, margin = defaultMargin }) {
  const [data, setData] = useState([]);
  const [keys, setKeys] = useState([]);
  const containerRef = useRef(null);

  const { tooltipOpen, tooltipLeft, tooltipTop, tooltipData, hideTooltip, showTooltip } =
    useTooltip();

  useEffect(() => {
    async function fetchData() {
      const response = await fetch('/data/city_stats.json');
      const jsonData = await response.json();

      setData(jsonData);
      setKeys(['transitScore', 'economicScore']);
    }

    fetchData();
  }, []);

  if (!data.length) return null;

  const getName = (d) => d.name;

  const xMax = width - margin.left - margin.right;
  const yMax = height - margin.top - margin.bottom;

  const nameScale = scaleBand({
    domain: data.map(getName),
    padding: 0.2,
  });
  const keyScale = scaleBand({
    domain: keys,
    padding: 0.1,
  });
  const valueScale = scaleLinear({
    domain: [0, Math.max(...data.map((d) => Math.max(...keys.map((key) => d[key]))))],
  });

  nameScale.rangeRound([margin.left, width - margin.right]);
  keyScale.rangeRound([0, nameScale.bandwidth()]);
  valueScale.range([yMax, 0]);

  colorScale.domain(keys);

  return width < 10 ? null : (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <svg width={width} height={height}>
        <defs>
          {keys.map((key, index) => (
            <LinearGradient
              id={`bar-gradient-${index}`}
              from={colorScale(key)}
              to={`${colorScale(key)}99`}
              key={key}
            />
          ))}
          {/* Add a grey gradient for coming soon */}
          <LinearGradient
            id="bar-gradient-coming-soon"
            from={grey}
            to={`${grey}99`}
            key="coming-soon"
          />
        </defs>

        <Group top={margin.top}>
          <BarGroup
            data={data}
            keys={keys}
            height={yMax}
            x0={getName}
            x0Scale={nameScale}
            x1Scale={keyScale}
            yScale={valueScale}
            color={colorScale}
          >
            {(barGroups) =>
              barGroups.map((barGroup) => {
                // Check if this city is coming soon
                const cityData = data[barGroup.index];
                const isComingSoon = cityData.coming_soon;
                
                return (
                  <Group key={`bar-group-${barGroup.index}-${barGroup.x0}`} left={barGroup.x0}>
                    {barGroup.bars.map((bar, index) => (
                      <rect
                        key={`bar-group-bar-${barGroup.index}-${bar.index}-${bar.value}-${bar.key}`}
                        x={bar.x}
                        y={isComingSoon ? yMax - 15 : bar.y} // Set a small fixed height for coming soon
                        width={bar.width}
                        height={isComingSoon ? 15 : bar.height} // Set a small fixed height for coming soon
                        fill={isComingSoon ? `url(#bar-gradient-coming-soon)` : `url(#bar-gradient-${index % keys.length})`}
                        rx={4}
                        onMouseMove={(event) => {
                          if (!containerRef.current) return;
                          const rect = containerRef.current.getBoundingClientRect();
                          
                          showTooltip({
                            tooltipLeft: event.clientX - rect.left,
                            tooltipTop: event.clientY - rect.top,
                            tooltipData: { 
                              key: isComingSoon ? "Coming Soon" : bar.key, 
                              value: isComingSoon ? "Data not available yet" : bar.value 
                            },
                          });
                        }}
                        onMouseLeave={hideTooltip}
                        onClick={() => {
                          if (!events) return;
                          const { key, value } = bar;
                          alert(JSON.stringify({ key, value }));
                        }}
                      />
                    ))}
                  </Group>
                );
              })
            }
          </BarGroup>

          <AxisLeft
            left={margin.left}
            scale={valueScale}
            stroke={green}
            tickStroke={green}
            tickLabelProps={{
              fill: green,
              fontSize: 11,
              textAnchor: 'end',
              dy: '0.33em',
            }}
          />
        </Group>

        <AxisBottom
          top={yMax + margin.top}
          scale={nameScale}
          stroke={green}
          tickStroke={green}
          hideAxisLine
          tickLabelProps={{
            fill: green,
            fontSize: 11,
            textAnchor: 'middle',
          }}
        />
      </svg>

      {tooltipOpen && tooltipData && (
        <div
          style={{
            ...tooltipStyles,
            top: tooltipTop,
            left: tooltipLeft,
            position: 'absolute',
          }}
        >
          <div>
            <strong>{tooltipData.key}</strong>: {tooltipData.value}
          </div>
        </div>
      )}
    </div>
  );
}
