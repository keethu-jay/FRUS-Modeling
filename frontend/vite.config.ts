import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// For GitHub Project Pages (https://user.github.io/REPO/) set VITE_BASE_PATH=/REPO/ at build time.
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react(), tailwindcss()],
  // shpjs + but-unzip use async iteration; pre-bundling breaks at runtime ("but-unzip~2").
  optimizeDeps: {
    exclude: ['shpjs'],
  },
})
