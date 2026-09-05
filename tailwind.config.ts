import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Deep aubergine, the colour of a jewellery case lining — not pure black.
        velvet: {
          950: '#120D15',
          900: '#17111A',
          800: '#211826',
          700: '#2E2233',
          600: '#3D2E44',
        },
        champagne: '#E2C68B',
        gilt: '#A87F3C',
        bone: '#F2EDE4',
        ash: '#9A8FA0',
        oxblood: '#6B2233',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        hallmark: '0.28em',
      },
      boxShadow: {
        case: '0 40px 80px -32px rgba(0,0,0,0.85), inset 0 1px 0 rgba(226,198,139,0.08)',
        lift: '0 12px 32px -12px rgba(0,0,0,0.7)',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        riseIn: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        shimmer: 'shimmer 2.4s linear infinite',
        riseIn: 'riseIn 420ms cubic-bezier(0.2, 0.7, 0.2, 1) both',
      },
    },
  },
  plugins: [],
};

export default config;
