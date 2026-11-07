/* Chess Coach AI — сервис-воркер (офлайн-режим). Шаблон: сборка (pwa/vite-plugin.ts) подставляет список файлов и версию.
 * Стратегии:
 *  - оболочка приложения и файлы сборки (хэшированные) — кэшируются при установке, отдаются из кэша;
 *  - переходы по страницам — сначала сеть (свежая версия), при отсутствии сети — сохранённая index.html;
 *  - шрифты Google — «кэш + обновление в фоне»;
 *  - всё остальное (Supabase, lichess и т. д.) воркер НЕ перехватывает: онлайн-функции требуют сети.
 * Новая версия не активируется сама: страница показывает «Доступно обновление», по кнопке шлёт SKIP_WAITING. */
const VERSION = '__VERSION__'
const PRECACHE = '__PRECACHE__'
const CACHE = `chess-coach-${VERSION}`
const FONTS = 'chess-coach-fonts'
const BASE = new URL('./', self.location.href).pathname // например /chess-coach-ai/

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    // addAll атомарен: если один файл недоступен, установка не удаётся и остаётся прежняя версия
    await cache.addAll(PRECACHE.map(p => new Request(BASE + p, { cache: 'reload' })))
  })())
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('chess-coach-') && k !== CACHE && k !== FONTS) await caches.delete(k)
    await self.clients.claim()
  })())
})

self.addEventListener('message', event => { if (event.data === 'SKIP_WAITING') self.skipWaiting() })

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith((async () => {
      const cache = await caches.open(FONTS), hit = await cache.match(req)
      const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') cache.put(req, r.clone()); return r }).catch(() => hit)
      return hit || net
    })())
    return
  }
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try { const r = await fetch(req); if (r.ok) { (await caches.open(CACHE)).put(BASE + 'index.html', r.clone()) } return r }
      catch { return (await caches.match(BASE + 'index.html')) || (await caches.match(BASE)) || Response.error() }
    })())
    return
  }
  // файлы сборки и движок: из кэша, при промахе — из сети с сохранением
  event.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true })
    if (hit) return hit
    try { const r = await fetch(req); if (r.ok) (await caches.open(CACHE)).put(req, r.clone()); return r } catch { return Response.error() }
  })())
})
