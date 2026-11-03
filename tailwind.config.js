/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./dashboard.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        wa: {
          dark: '#111b21',
          panel: '#202c33',
          panelLight: '#f0f2f5',
          green: '#25D366',
          teal: '#00a884',
          tealDark: '#008069',
          border: '#2a3942',
          textMuted: '#8696a0',
        }
      }
    },
  },
  plugins: [],
}
