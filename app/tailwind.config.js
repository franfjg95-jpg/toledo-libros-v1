/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#eef2f6',
          100: '#d9e2eb',
          200: '#b6c8d9',
          300: '#8ba6c1',
          400: '#5e82a6',
          500: '#3f678e',
          600: '#325275',
          700: '#28415d',
          800: '#1e3a8a', // The requested Navy Blue
          900: '#1d2c42',
        }
      }
    },
  },
  plugins: [],
}
