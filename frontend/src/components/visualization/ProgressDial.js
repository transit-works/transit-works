export default function ProgressDial({ percentage, name }) {
  // Constants
  const RADIUS = 90; // Radius of the circle
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS; // Circle circumference
  const strokeDashoffset = CIRCUMFERENCE * (1 - percentage / 100); // Calculate offset based on percentage
  const size = 100;

  // Determine color based on percentage
  let color;
  if (percentage === 0) {
    color = "#555555"
  } else if (percentage < 33) {
    color = "#fd4861"; // Red
  } else if (percentage < 66) {
    color = "#ffd700"; // Yellow
  } else {
    color = "#9beb34"; // Green
  }

  let percentageStr = percentage.toString();
  if (percentageStr.length == 1) {
    percentageStr = `0${  percentageStr}`;
  }

  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{
        width: '100%',  // Makes the container take full width of the parent
        height: '100%', // Makes the container take full height of the parent
        maxWidth: `${size + 40}px`, // Set a maximum size for responsiveness
        maxHeight: `${size + 40}px`,
      }}
    >
      <svg
        width="100%"  // Makes the SVG width responsive
        height="100%" // Makes the SVG height responsive
        viewBox="-25 -25 250 250"
        version="1.1"
        xmlns="http://www.w3.org/2000/svg"
        style={{ transform: 'rotate(-90deg)', maxWidth: `${size}px` }} // Adjusts the SVG's max size
      >
        {/* Background Circle */}
        <circle
          r={RADIUS}
          cx="100"
          cy="100"
          fill="transparent"
          stroke="#222222"
          strokeWidth="40"
          strokeDasharray={`${CIRCUMFERENCE}px`}
          strokeDashoffset="0"
        />

        {/* Foreground Circle */}
        <circle
          r={RADIUS}
          cx="100"
          cy="100"
          fill="transparent"
          stroke={color}
          strokeWidth="40"
          strokeLinecap="round"
          strokeDasharray={`${CIRCUMFERENCE}px`}
          strokeDashoffset={`${strokeDashoffset}px`}
        />

        {/* Percentage Text */}
        <text
          x="67px"
          y="116px"
          fill={color}
          fontSize="54px"
          fontWeight="bold"
          style={{ transform: 'rotate(90deg) translate(0px, -196px)' }}
        >
          {percentageStr}
        </text>
      </svg>
      <h2 className="font-medium text-xs pt-1 text-white">{name}</h2>
    </div>
  );
}
