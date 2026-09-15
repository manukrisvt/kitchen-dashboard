/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0a0e14',
          900: '#10161f',
          800: '#1a2230',
          700: '#2a3444'
        },
        accent: {
          DEFAULT: '#4fc3f7',
          warm: '#ffb74d'
        }
      }
    }
  },
  plugins: []
};
