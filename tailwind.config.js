/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./extension/src/**/*.{html,ts,tsx}",
    "./extension/src/dashboard/**/*.{html,ts,tsx}",
    "./extension/src/popup/**/*.{html,ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d'
        }
      }
    },
  },
  plugins: [],
}
