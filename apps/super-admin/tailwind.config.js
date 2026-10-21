/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        // Brand accent: professional indigo/slate instead of pink
        brand:        '#4F6EF7', // indigo-500-ish
        brandHover:   '#3B58EB',
        brandLight:   '#EEF2FF', // indigo-50
        brandMuted:   '#C7D2FE', // indigo-200
        sidebar:      '#0F172A', // slate-900
        sidebarHover: '#1E293B', // slate-800
        sidebarActive:'#4F6EF7', // same as brand
      },
      keyframes: {
        fadeUp: {
          '0%':   { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fadeUp 0.3s ease-out both',
      },
    },
  },
  plugins: [],
};
