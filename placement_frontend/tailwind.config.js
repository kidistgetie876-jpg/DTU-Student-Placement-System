module.exports = {
  darkMode: ['class', '.dark-mode'],
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      keyframes: {
        'login-enter': {
          from: { opacity: '0', transform: 'translateY(16px) scale(0.985)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        'login-enter': 'login-enter 500ms cubic-bezier(0.16, 1, 0.3, 1) both',
      },
    },
  },
  plugins: [],
};
