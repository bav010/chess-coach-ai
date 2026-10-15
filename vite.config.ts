import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' — сайт использует относительные пути, поэтому работает из любой подпапки
// (например https://user.github.io/любое-имя-репозитория/) без дополнительных настроек.
export default defineConfig({
  base: '/chess-coach-ai/',
  plugins: [react()],
})
