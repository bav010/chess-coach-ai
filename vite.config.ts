import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { pwa } from './pwa/vite-plugin'

// base: '/chess-coach-ai/' — адрес на GitHub Pages (https://user.github.io/chess-coach-ai/); при другом имени репозитория поменяйте его здесь.
// pwa() добавляет в сборку sw.js (офлайн-режим); манифест и иконки лежат в public/.
export default defineConfig({
  base: '/chess-coach-ai/',
  plugins: [react(), pwa()],
})
