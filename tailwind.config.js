/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './views/**/*.html',
    './public/js/**/*.js',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          blue: '#2563eb',
          lightBlue: '#3b82f6',
          dark: '#0f172a',
        },
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgb(15 23 42 / 0.04)',
        card: '0 1px 2px rgb(15 23 42 / 0.03), 0 8px 24px -16px rgb(15 23 42 / 0.18)',
      },
      keyframes: {
        'subtle-pulse': {
          '0%, 100%': { opacity: '.9', transform: 'scale(1)' },
          '50%': { opacity: '.6', transform: 'scale(1.15)' },
        },
        shine: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'subtle-pulse': 'subtle-pulse 3s infinite ease-in-out',
      },
    },
  },
  plugins: [],
};
