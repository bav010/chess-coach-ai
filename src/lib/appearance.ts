// Внешний вид: тема (светлая / тёмная / как в системе) и цвета доски. Хранится на устройстве (как и язык), применяется сразу.
import { useSyncExternalStore } from 'react'

export type ThemeChoice = 'system' | 'dark' | 'light'
export const BOARD_PRESETS = ['green', 'brown', 'blue', 'gray', 'purple', 'sand'] as const
export type BoardPreset = (typeof BOARD_PRESETS)[number]
export const BOARD_COLORS: Record<BoardPreset, [string, string]> = {
  green: ['#e2e2d7', '#78917f'], brown: ['#f0d9b5', '#b58863'], blue: ['#dee3e6', '#8ca2ad'],
  gray: ['#e6e6e6', '#9a9a9a'], purple: ['#ece6f3', '#9f84bd'], sand: ['#eeeed2', '#769656'],
}
export type Appearance = {
  theme: ThemeChoice
  /** Готовая схема доски или 'custom' (свои два цвета). */
  board: BoardPreset | 'custom'
  customLight: string
  customDark: string
  /** Подписи координат на доске. */
  coords: boolean
}
export const DEFAULT_APPEARANCE: Appearance = { theme: 'system', board: 'green', customLight: '#e2e2d7', customDark: '#78917f', coords: true }
const KEY = 'chess-coach-ai:appearance:v1'
const HEX = /^#[0-9a-fA-F]{6}$/

function read(): Appearance {
  try {
    const d = JSON.parse((typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY)) ?? 'null') as Partial<Appearance> | null
    if (!d) return DEFAULT_APPEARANCE
    return {
      theme: d.theme === 'dark' || d.theme === 'light' ? d.theme : 'system',
      board: d.board === 'custom' || (BOARD_PRESETS as readonly string[]).includes(d.board ?? '') ? (d.board as Appearance['board']) : 'green',
      customLight: HEX.test(d.customLight ?? '') ? d.customLight! : DEFAULT_APPEARANCE.customLight,
      customDark: HEX.test(d.customDark ?? '') ? d.customDark! : DEFAULT_APPEARANCE.customDark,
      coords: d.coords ?? true,
    }
  } catch { return DEFAULT_APPEARANCE }
}

let current = read()
const subs = new Set<() => void>()
const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null
export const resolveTheme = (c: ThemeChoice = current.theme): 'dark' | 'light' => (c === 'system' ? (mq?.matches ? 'light' : 'dark') : c)

export function applyAppearance(a: Appearance = current) {
  if (typeof document === 'undefined') return
  const r = document.documentElement
  r.dataset.theme = resolveTheme(a.theme)
  r.dataset.board = a.board === 'custom' ? 'custom' : a.board
  r.dataset.coords = a.coords ? 'on' : 'off'
  if (a.board === 'custom') { r.style.setProperty('--sq-l', a.customLight); r.style.setProperty('--sq-d', a.customDark) }
  else { r.style.removeProperty('--sq-l'); r.style.removeProperty('--sq-d') }
}
applyAppearance()
mq?.addEventListener?.('change', () => { if (current.theme === 'system') applyAppearance() })

export const getAppearance = (): Appearance => current
export function setAppearance(patch: Partial<Appearance>) {
  const next = { ...current, ...patch }
  for (const k of ['customLight', 'customDark'] as const) if (!HEX.test(next[k])) next[k] = DEFAULT_APPEARANCE[k]
  current = next
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* ничего */ }
  applyAppearance(next)
  subs.forEach(f => f())
}
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
export const useAppearance = (): [Appearance, typeof setAppearance] => [useSyncExternalStore(subscribe, getAppearance, getAppearance), setAppearance]
