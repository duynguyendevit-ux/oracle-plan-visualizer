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
        // Carbon Design System - Gray 10 light theme
        primary: '#0f62fe',
        'primary-container': '#d0e2ff',
        background: '#f4f4f4',
        tertiary: '#da1e28',
        'tertiary-container': '#ffd7d9',
        
        // Carbon Design System - Gray 100 dark theme
        'dark-primary': '#4589ff',
        'dark-primary-container': '#001d6c',
        'dark-surface': '#161616',
        'dark-surface-container-lowest': '#0f0f0f',
        'dark-surface-container-low': '#262626',
        'dark-surface-container': '#393939',
        'dark-surface-container-high': '#525252',
        'dark-surface-container-highest': '#6f6f6f',
        'dark-on-surface': '#f4f4f4',
        'dark-on-primary': '#ffffff',
        'dark-outline-variant': '#525252',
        'dark-secondary-container': '#262626',
        'dark-on-secondary-container': '#c6c6c6',
        'dark-error': '#ff8389',
        
        warm: {
          50: '#ffffff',
          100: '#f4f4f4',
          200: '#e0e0e0',
          300: '#c6c6c6',
          400: '#a8a8a8',
          500: '#8d8d8d',
          600: '#525252',
          700: '#393939',
          800: '#262626',
          900: '#161616',
        },
        
        // Surface tokens for light mode
        'surface-container-lowest': '#ffffff',
        'surface-container-low': '#ffffff',
        'surface-container': '#f4f4f4',
        'surface-container-high': '#e0e0e0',
        'surface-container-highest': '#c6c6c6',
        'on-surface': '#161616',
        'on-surface-variant': '#525252',
        'outline-variant': '#c6c6c6',
      },
      fontFamily: {
        serif: ['IBM Plex Sans', 'sans-serif'],
        sans: ['IBM Plex Sans', 'sans-serif'],
        label: ['IBM Plex Sans', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
      boxShadow: {
        'warm': '0 1px 2px rgba(0, 0, 0, 0.12)',
        'warm-lg': '0 2px 6px rgba(0, 0, 0, 0.16)',
        'editorial': '0 1px 2px rgba(0, 0, 0, 0.12)',
        // Dark mode shadows
        'dark-ambient': '0 2px 6px rgba(0, 0, 0, 0.42)',
        'dark-float': '0 1px 4px rgba(0, 0, 0, 0.5)',
      },
      borderRadius: {
        DEFAULT: '0',
        'md': '0',
        'full': '9999px',
      },
      backdropBlur: {
        'glass': '20px',
      }
    },
  },
  plugins: [],
}
