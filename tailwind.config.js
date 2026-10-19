/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        sos: {
          primary: '#E17726',
          primaryDark: '#C86419',
          primaryLight: '#FDF2E9',
          secondary: '#51344D',
          secondaryDark: '#3B2538',
          secondaryLight: '#F4EEF3',
          bg: '#f5f2f0',
          dark: '#2e1f14',
        },
      },
      fontFamily: {
        sans: ['Poppins', 'Roboto', 'Helvetica Neue', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
