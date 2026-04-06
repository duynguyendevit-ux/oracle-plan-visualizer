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
        primary: '#094cb2',
        'primary-container': '#d6e3ff',
        tertiary: '#6d5e00',
        'tertiary-container': '#f7e287',
        background: '#fef7ff',
        surface: '#fef7ff',
        'surface-dim': '#e0d9e0',
        'surface-bright': '#fef7ff',
        'surface-container-lowest': '#ffffff',
        'surface-container-low': '#faf2fa',
        'surface-container': '#f4ecf4',
        'surface-container-high': '#eee6ee',
        'surface-container-highest': '#e8e1e8',
        'on-surface': '#1d1b20',
        'on-surface-variant': '#49454e',
        'outline': '#7a757f',
        'outline-variant': '#cbc4cf',
      },
      fontFamily: {
        serif: ['Noto Serif', 'serif'],
        sans: ['Inter', 'sans-serif'],
        label: ['Public Sans', 'sans-serif'],
      },
      boxShadow: {
        'editorial': '0 4px 24px rgba(29, 27, 32, 0.04)',
        'editorial-lg': '0 24px 40px rgba(29, 27, 32, 0.06)',
      },
      borderRadius: {
        DEFAULT: '12px',
        sm: '8px',
        lg: '16px',
      },
      backdropBlur: {
        'glass': '20px',
      }
    },
  },
  plugins: [],
}
