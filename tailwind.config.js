import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'src/**/*.{js,ts,jsx,tsx}'),
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        readest: {
          dark: '#13161a',
          darker: '#0e1114',
          card: '#181c21',
          cardBorder: '#232830',
          canvas: '#ffffff',
          canvasWarm: '#faf8f5',
          canvasSepia: '#f4ecd8',
          canvasDark: '#1e2329',
          teal: '#2dd4bf',
          tealDark: '#0f766e',
          textMuted: '#8b96a5',
          textSubtle: '#5a6575',
        },
      },
      fontFamily: {
        serif: ['Merriweather', 'Georgia', 'Cambria', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        dyslexic: ['OpenDyslexic', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
