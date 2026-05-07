/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        soft: '0 10px 25px rgba(0,0,0,0.08)'
      }
    }
  },
  plugins: []
};
