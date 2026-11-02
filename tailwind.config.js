/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        aac: {
          bg: '#0F172A', // High contrast dark slate
          card: '#1E293B',
          cardHover: '#334155',
          primary: '#38BDF8',
          accent: '#F59E0B',
          success: '#10B981',
          danger: '#EF4444',
          text: '#F8FAFC'
        }
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
