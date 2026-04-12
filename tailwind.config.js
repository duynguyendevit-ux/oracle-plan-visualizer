/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Light mode (Sahara)
        primary: '#c2652a',
        'primary-container': '#c28e40',
        background: '#faf5ee',
        tertiary: '#8c3c3c',
        
        // Dark mode (Sahara Dark - Midnight Mirage)
        'dark-primary': '#f6bc69',
        'dark-primary-container': '#c28e40',
        'dark-surface': '#141312',
        'dark-surface-container-lowest': '#0f0e0d',
        'dark-surface-container-low': '#1c1b1a',
        'dark-surface-container': '#201f1e',
        'dark-surface-container-high': '#2b2a29',
        'dark-surface-container-highest': '#363433',
        'dark-on-surface': '#e6e2df',
        'dark-on-primary': '#452b00',
        'dark-outline-variant': '#504538',
        'dark-secondary-container': '#64421d',
        'dark-on-secondary-container': '#dfaf81',
        'dark-error': '#ffb4ab',
        
        warm: {
          50: '#faf5ee',
          100: '#f5ede0',
          200: '#ebe0d0',
          300: '#d8d0c8',
          400: '#b8a89a',
          500: '#8c7a6a',
          600: '#6a5a4a',
          700: '#4a3a2a',
          800: '#3a302a',
          900: '#2a201a',
        },
        
        // Surface tokens for light mode
        'surface-container-low': '#f5ede0',
        'surface-container': '#ebe0d0',
        'on-surface': '#3a302a',
        'outline-variant': '#d8d0c8',
      },
      fontFamily: {
        serif: ['EB Garamond', 'serif'],
        sans: ['Manrope', 'sans-serif'],
        label: ['Manrope', 'sans-serif'],
      },
      boxShadow: {
        'warm': '0 2px 16px rgba(58, 48, 42, 0.04)',
        'warm-lg': '0 4px 24px rgba(58, 48, 42, 0.06)',
        'editorial': '0 2px 16px rgba(58, 48, 42, 0.04)',
        // Dark mode shadows
        'dark-ambient': '0 30px 60px rgba(230, 226, 223, 0.05)',
        'dark-float': '0 20px 40px rgba(230, 226, 223, 0.05)',
      },
      borderRadius: {
        DEFAULT: '8px',
        'md': '0.375rem',
        'full': '9999px',
      },
      backdropBlur: {
        'glass': '20px',
      }
    },
  },
  plugins: [],
}
