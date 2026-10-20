import type { Config } from 'tailwindcss'
import defaultTheme from 'tailwindcss/defaultTheme'

// Tokens do design system (navy #0A1938 como único destaque). Valores HSL em globals.css.
const token = (nome: string) => `hsl(var(--${nome}))`

const navy = {
  50: '#F1F4F9', 100: '#E3E8F2', 200: '#C8D0E3', 300: '#A9B6D3', 400: '#6C7FAF',
  500: '#33477A', 600: '#0A1938', 700: '#0A1938', 800: '#0A1938', 900: '#0A1938',
}
const cinza = {
  50: '#F4F6F9', 100: '#EEF0F4', 200: '#D5DBE6', 300: '#C5CCDA', 400: '#8793A6',
  500: '#6B7690', 600: '#4B5568', 700: '#3B4559', 800: '#2A3347', 900: '#1A2338',
}
// Badge "pendente" do kit: fundo #FBF0DA, texto #7A4E00.
const pendente = {
  50: '#FDF8EC', 100: '#FBF0DA', 200: '#EFD9A6', 300: '#E3C277', 400: '#C9962B',
  500: '#A8700A', 600: '#8F5C00', 700: '#7A4E00', 800: '#633F00', 900: '#4D3100',
}
// "Aguardando ajuste" convive com "aguardando autorização" na mesma tela: precisa ser distinguível do pendente.
const ajuste = {
  50: '#FCF1E6', 100: '#F9E3CF', 200: '#F0C9A3', 300: '#E6AB75', 400: '#D98A45',
  500: '#B05F18', 600: '#A4560F', 700: '#8A4300', 800: '#6F3500', 900: '#552900',
}

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
        // Cores de destaque das telas antigas, trazidas para o kit (tabela de migração do README):
        // azul, roxo e esmeralda -> navy; teal -> cinza; amarelo e âmbar -> "pendente"; laranja -> "pendente" mais forte.
        blue: navy,
        purple: navy,
        emerald: navy,
        teal: cinza,
        amber: pendente,
        yellow: pendente,
        orange: ajuste,
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
