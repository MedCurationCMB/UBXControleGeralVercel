import type { Config } from 'tailwindcss'
import defaultTheme from 'tailwindcss/defaultTheme'

// Tokens do design system (navy #0A1938 como único destaque). Valores HSL em globals.css.
const token = (nome: string) => `hsl(var(--${nome}))`

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', ...defaultTheme.fontFamily.sans],
      },
      colors: {
        canvas: token('canvas'),
        background: token('background'),
        foreground: token('foreground'),
        card: { DEFAULT: token('card'), foreground: token('card-foreground') },
        popover: { DEFAULT: token('popover'), foreground: token('popover-foreground') },
        secondary: { DEFAULT: token('secondary'), foreground: token('secondary-foreground') },
        muted: { DEFAULT: token('muted'), foreground: token('muted-foreground') },
        accent: { DEFAULT: token('accent'), foreground: token('accent-foreground') },
        destructive: { DEFAULT: token('destructive'), foreground: token('destructive-foreground') },
        border: token('border'),
        input: token('input'),
        ring: token('ring'),
        // `primary-NNN` continua valendo nas telas antigas, agora na escala navy.
        primary: {
          DEFAULT: token('primary'),
          foreground: token('primary-foreground'),
          50: '#F1F4F9',
          100: '#E3E8F2',
          200: '#C8D0E3',
          300: '#A9B6D3',
          400: '#6C7FAF',
          500: '#0A1938',
          600: '#0A1938',
          700: '#0A1938',
          800: '#0A1938',
          900: '#0A1938',
        },
        // Neutros do kit no lugar do slate padrão: 1.400 usos nas telas mudam de uma vez.
        slate: {
          50: '#F1F4F9',
          100: '#E3E8F2',
          200: '#D5DBE6',
          300: '#C5CCDA',
          400: '#6B7690',
          500: '#4B5568',
          600: '#3B4559',
          700: '#2A3347',
          800: '#1A2338',
          900: '#0F172A',
        },
        // O azul das telas antigas vira navy (tabela de migração do kit: blue-* -> primary/secondary).
        blue: {
          50: '#F1F4F9',
          100: '#E3E8F2',
          200: '#C8D0E3',
          300: '#A9B6D3',
          400: '#6C7FAF',
          500: '#33477A',
          600: '#0A1938',
          700: '#0A1938',
          800: '#0A1938',
          900: '#0A1938',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
}

export default config
