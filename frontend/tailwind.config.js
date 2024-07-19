/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        'background': '#f5f5f0',
        'background-dk': '#090909',
        'accent-1': '#ff1643',
      },
      fontFamily: {
      }
    },
  },
  plugins: [
    function ({ addUtilities }) {
      addUtilities({
        '.custom-scrollbar': {
          '&::-webkit-scrollbar': {
            width: '8px',
          },
          '&::-webkit-scrollbar-track': {
            background: '#1a1a1a',
          },
          '&::-webkit-scrollbar-thumb': {
            background: '#444444',
            borderRadius: '4px',
          },
          '&::-webkit-scrollbar-thumb:hover': {
            background: '#555555',
          },
          'scrollbar-width': 'thin',
          'scrollbar-color': '#444444 #1a1a1a',
        },
        '.scrollbar-hidden': {
          'overflow': 'hidden',
        },
        '.scrollbar-auto': {
          'overflow': 'auto',
        },
      });
    },
  ],
};
