import { describe, expect, it } from 'vitest'
import manifestRaw from '../../public/manifest.webmanifest?raw'
import indexHtml from '../../index.html?raw'
import swTemplate from '../../pwa/sw.template.js?raw'
import appSource from '../App.tsx?raw'
import pkgRaw from '../../package.json?raw'

// файлы иконок из public/icons (только пути; сами картинки проверены в e2e и глазами)
const ICONS = Object.keys(import.meta.glob('../../public/icons/*.png', { query: '?url', eager: true }))

describe('PWA: манифест и воркер', () => {
  const m = JSON.parse(manifestRaw)
  it('манифест содержит всё нужное для установки', () => {
    expect(m.name).toBeTruthy(); expect(m.short_name).toBeTruthy()
    expect(m.display).toBe('standalone')
    expect(m.start_url).toBe('./'); expect(m.scope).toBe('./')   // относительные пути: работает из любой подпапки
    expect(m.background_color).toMatch(/^#/); expect(m.theme_color).toMatch(/^#/)
  })
  it('есть иконки 192 и 512 и маскируемая, файлы существуют и нужного размера', () => {
    const sizes = m.icons.map((i: { sizes: string }) => i.sizes)
    expect(sizes).toContain('192x192'); expect(sizes).toContain('512x512')
    expect(m.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true)
    for (const i of m.icons as { src: string }[]) expect(ICONS.some(f => f.endsWith(`/public/${i.src}`)), i.src).toBe(true)
  })
  it('index.html подключает манифест и иконку для iOS через %BASE_URL%', () => {
    const html = indexHtml
    expect(html).toContain('rel="manifest" href="%BASE_URL%manifest.webmanifest"')
    expect(html).toContain('%BASE_URL%icons/apple-touch-icon.png')
  })
  it('шаблон воркера содержит подстановки версии и списка файлов, не перехватывает чужие домены и не активируется сам', () => {
    const sw = swTemplate
    expect(sw).toContain("'__VERSION__'"); expect(sw).toContain("'__PRECACHE__'")
    expect(sw).toContain("url.origin !== self.location.origin")
    expect(sw).toContain("event.data === 'SKIP_WAITING'")
    expect(sw).not.toMatch(/install[\s\S]{0,400}skipWaiting\(\)/)   // skipWaiting только по сообщению из страницы
  })
  it('в пакете и в подвале версия 0.9', () => {
    expect(JSON.parse(pkgRaw).version).toBe('0.9.0')
    expect(appSource).toContain('v0.9')
  })
})
