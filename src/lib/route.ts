// Маршруты на хэш-адресах (#/analysis, #/tactics/<id>…): кнопка «Назад» в браузере работает, обновление страницы не сбрасывает режим.
// Хэш подходит для статического хостинга (GitHub Pages) без настройки сервера.
import { useSyncExternalStore } from 'react'

export const ROUTES = ['home', 'analysis', 'play', 'tactics', 'openings', 'stats', 'profile', 'account', 'settings', 'help'] as const
export type RouteName = (typeof ROUTES)[number]
export type Route = { name: RouteName; arg: string | null }
/** Режимы, у которых состояние (партия, часы, позиция) сохраняется при уходе со страницы. */
export const MODES = ['analysis', 'play', 'tactics', 'openings'] as const
export type ModeName = (typeof MODES)[number]

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean)
  const name = (ROUTES as readonly string[]).includes(parts[0]) ? (parts[0] as RouteName) : 'home'
  return { name, arg: parts[1] ? decodeURIComponent(parts[1]) : null }
}
export const hrefFor = (name: RouteName, arg?: string | null): string => (name === 'home' ? '#/' : `#/${name}${arg ? `/${encodeURIComponent(arg)}` : ''}`)
export function navigate(name: RouteName, arg?: string | null) { window.location.hash = hrefFor(name, arg) }

let snap: Route = typeof window === 'undefined' ? { name: 'home', arg: null } : parseHash(window.location.hash)
const subs = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    const n = parseHash(window.location.hash)
    if (n.name !== snap.name || n.arg !== snap.arg) { snap = n; subs.forEach(f => f()) }
  })
}
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
export const useRoute = (): Route => useSyncExternalStore(subscribe, () => snap, () => snap)
