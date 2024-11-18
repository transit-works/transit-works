/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      boxShadow: {
        'bubble': '0 5px 10px rgba(0, 0, 0, 0.15), 0 10px 20px rgba(0, 0, 0, 0.1)',
      },
      colors: {
        'accent-1': '#ff1643',
        'accent-2': '#9beb34',
        // Custom Colors
        'background': '#f5f5f0',
        'background-dk': '#060606',
        'text': '#f2e0e0',
        'text-2': '#d1b99e',
        'primary': '#ca2848',
        'secondary': '#775631',
        'accent': "#c4a76e",
      },
      fontFamily: {
        'heading': ["Fjalla One", "sans-serif"],
        'body': ["Poppins", "sans-serif"],
        'logo': ["Staatliches", 'sans-serif'],
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
