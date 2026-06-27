import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev stays at '/'. Production build uses './' so the app works from a GitHub Pages sub-path
// (e.g. https://user.github.io/blank-space/).
export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  plugins: [react()],
}))
