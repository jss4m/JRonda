/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,css}",
    "./*.html"
  ],
  theme: {
    extend: {
      colors: {
        primary: 'var(--primary)',
        secondary: 'var(--secondary)',
        bg: 'var(--bg)',
        'bg-soft': 'var(--bg-soft)',
        'bg-elevated': 'var(--bg-elevated)',
        'text-main': 'var(--text-main)',
        'text-muted': 'var(--text-muted)',
        'text-invert': 'var(--text-invert)',
        border: 'var(--border)',
        'border-hover': 'var(--border-hover)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius)',
        lg: 'var(--radius-lg)',
      },
    },
  },
  plugins: [],
}

