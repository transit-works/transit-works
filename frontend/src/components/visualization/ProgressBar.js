import { useId } from 'react';

export default function ProgressBar({ percentage, name, startColor, endColor }) {
  // Constants
  const width = 200; // Width of the rectangle
  const height = 25; // Height of the rectangle
  const borderRadius = 10; // Rounded corners for a smoother look

  // Generate a unique gradient ID using React's useId hook
  const uniqueId = useId();
  const gradientId = `progressGradient-${uniqueId}`;

  // Format percentage string
  let percentageStr = percentage.toString();
  if (percentageStr.length === 1) {
    percentageStr = `0${percentageStr}`;
  }

  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{
        width: '100%', // Container takes full width of the parent
        height: '100%', // Container takes full height of the parent
        maxWidth: `${width + 40}px`, // Set a maximum size for responsiveness
        maxHeight: `${height + 40}px`,
      }}
    >
      <h2 className="self-start pt-1 text-xs font-medium text-white">{name}</h2>
      <svg
        width="100%" // Makes the SVG width responsive
        height="100%" // Makes the SVG height responsive
        viewBox={`0 0 ${width + 20} ${height + 20}`}
        version="1.1"
        xmlns="http://www.w3.org/2000/svg"
        style={{ maxWidth: `${width}px` }} // Adjusts the SVG's max size
      >
        {/* Define the Gradient */}
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={startColor} />
            <stop offset="100%" stopColor={endColor} />
          </linearGradient>
        </defs>

        {/* Background Rectangle */}
        <rect
          x="10"
          y="10"
          width={width}
          height={height}
          fill="#222222"
          rx={borderRadius} // Rounded corners
          ry={borderRadius}
        />

        {/* Foreground Rectangle with Gradient */}
        <rect
          x="10"
          y="10"
          width={(width * percentage) / 100} // Width based on percentage
          height={height}
          fill={`url(#${gradientId})`} // Use the unique gradient fill
          rx={borderRadius} // Rounded corners
          ry={borderRadius}
        />

        {/* Percentage Text */}
        <text
          x="50%"
          y="50%"
          fill="white"
          fontSize="16px"
          fontWeight="bold"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {percentageStr}
        </text>
      </svg>
    </div>
  );
}
