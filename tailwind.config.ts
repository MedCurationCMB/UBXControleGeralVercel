import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#F63366',
          50:  '#fff0f4',
          100: '#ffe0ea',
          200: '#ffc6d9',
          300: '#ff9ab8',
          400: '#ff6090',
          500: '#F63366',
          600: '#e0174d',
          700: '#bd0f3e',
          800: '#9c1038',
          900: '#841236',
        },
        sidebar: {
          DEFAULT: '#0f172a',
          foreground: '#94a3b8',
          active: '#1e293b',
        },
      },
      borderRadius: {
        lg: '0.625rem',
        md: '0.5rem',
        sm: '0.375rem',
      },
    },
  },
  plugins: [],
}

export default config
