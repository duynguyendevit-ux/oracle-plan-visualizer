/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#c2652a',
        background: '#faf5ee',
        tertiary: '#8c3c3c',
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
        }
      },
      fontFamily: {
        serif: ['EB Garamond', 'serif'],
        sans: ['Manrope', 'sans-serif'],
      },
      boxShadow: {
        'warm': '0 2px 16px rgba(58, 48, 42, 0.04)',
        'warm-lg': '0 4px 24px rgba(58, 48, 42, 0.06)',
      },
      borderRadius: {
        DEFAULT: '8px',
      }
    },
  },
  plugins: [],
}
