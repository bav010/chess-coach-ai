// Установка как приложение и офлайн-режим: регистрация сервис-воркера (public sw.js собирается из pwa/sw.template.js),
// запрос на установку, обновления и состояние сети. Состояние читается через usePwa().
import { useSyncExternalStore } from 'react'

export type PwaState = { updateReady: boolean; canInstall: boolean; installed: boolean; ios: boolean; online: boolean; offlineReady: boolean }
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

const isStandalone = (): boolean => {
  try { return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true } catch { return false }
}
const isIos = (): boolean => /iphone|ipad|ipod/i.test(navigator.userAgent) && !('MSStream' in window)

let state: PwaState = { updateReady: false, canInstall: false, installed: false, ios: false, online: true, offlineReady: false }
const subs = new Set<() => void>()
let deferred: InstallEvent | null = null
let registration: ServiceWorkerRegistration | null = null
const set = (p: Partial<PwaState>) => { state = { ...state, ...p }; subs.forEach(f => f()) }

/** Вызывается один раз при старте приложения. В разработке (vite dev) воркер не регистрируется. */
export function initPwa(prod: boolean = import.meta.env.PROD) {
  if (typeof window === 'undefined') return
  set({ installed: isStandalone(), ios: isIos(), online: navigator.onLine !== false })
  window.addEventListener('online', () => set({ online: true }))
  window.addEventListener('offline', () => set({ online: false }))
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as InstallEvent; set({ canInstall: true }) })
  window.addEventListener('appinstalled', () => { deferred = null; set({ canInstall: false, installed: true }) })
  if (!prod || !('serviceWorker' in navigator)) return
  const base = import.meta.env.BASE_URL
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).then(reg => {
      registration = reg
      if (reg.active && !navigator.serviceWorker.controller) set({ offlineReady: true })
      if (reg.waiting && navigator.serviceWorker.controller) set({ updateReady: true })
      reg.addEventListener('updatefound', () => {
        const w = reg.installing
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed') { if (navigator.serviceWorker.controller) set({ updateReady: true }); else set({ offlineReady: true }) }
        })
      })
      // проверка новой версии при возвращении на вкладку
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void reg.update().catch(() => undefined) })
    }).catch(() => undefined)
  })
}

/** Показывает системный запрос установки. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable'
  const ev = deferred; deferred = null; set({ canInstall: false })
  try { await ev.prompt(); return (await ev.userChoice).outcome } catch { return 'dismissed' }
}

/** Активирует скачанную версию и перезагружает страницу. */
export function applyUpdate() {
  const w = registration?.waiting
  if (!w) { window.location.reload(); return }
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true })
  w.postMessage('SKIP_WAITING')
}

export function usePwa(): PwaState {
  return useSyncExternalStore(cb => { subs.add(cb); return () => { subs.delete(cb) } }, () => state, () => state)
}
