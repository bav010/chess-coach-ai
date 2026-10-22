// Внешний вид: тема (светлая / тёмная / как в системе) и цвета доски. Хранится на устройстве (как и язык), применяется сразу.
import { useSyncExternalStore } from 'react'

export type ThemeChoice = 'system' | 'dark' | 'light'
export const BOARD_PRESETS = ['green', 'brown', 'blue', 'gray', 'purple', 'sand'] as const
export type BoardPreset = (typeof BOARD_PRESETS)[number]
export const BOARD_COLORS: Record<BoardPreset, [string, string]> = {
  green: ['#e2e2d7', '#78917f'], brown: ['#f0d9b5', '#b58863'], blue: ['#dee3e6', '#8ca2ad'],
  gray: ['#e6e6e6', '#9a9a9a'], purple: ['#ece6f3', '#9f84bd'], sand: ['#eeeed2', '#769656'],
}
export const PIECE_SETS = ['classic', 'merida', 'chessnut', 'flat', 'glyph'] as const
export type PieceSet = (typeof PIECE_SETS)[number]
export const HINT_STYLES = ['dot', 'ring'] as const
export type HintStyle = (typeof HINT_STYLES)[number]
export const LAST_MOVE_COLORS = ['yellow', 'green', 'blue', 'pink'] as const
export type LastMoveColor = (typeof LAST_MOVE_COLORS)[number]
export type Appearance = {
  /** Набор фигур. */
  pieces: PieceSet
  /** Размер фигуры относительно клетки, 0.7–1. */
  pieceScale: number
  pieceShadow: boolean
  /** Как показывать клетки, куда можно пойти. */
  hint: HintStyle
  /** Цвет подсветки последнего хода. */
  lastMove: LastMoveColor
  animate: boolean
  sound: boolean
  /** Громкость звуков, 0–1. */
  volume: number
  /** В списке ходов вместо букв фигур (N, B…) рисовать значки. */
  figurine: boolean
  theme: ThemeChoice
  /** Готовая схема доски или 'custom' (свои два цвета). */
  board: BoardPreset | 'custom'
  customLight: string
  customDark: string
  /** Подписи координат на доске. */
  coords: boolean
}
export const DEFAULT_APPEARANCE: Appearance = { pieces: 'classic', pieceScale: 0.92, pieceShadow: true, hint: 'dot', lastMove: 'yellow', animate: true, sound: false, volume: 0.6, figurine: false, theme: 'system', board: 'green', customLight: '#e2e2d7', customDark: '#78917f', coords: true }
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
      pieces: (PIECE_SETS as readonly string[]).includes(d.pieces ?? '') ? (d.pieces as PieceSet) : DEFAULT_APPEARANCE.pieces,
      pieceScale: typeof d.pieceScale === 'number' && d.pieceScale >= 0.7 && d.pieceScale <= 1 ? d.pieceScale : DEFAULT_APPEARANCE.pieceScale,
      pieceShadow: d.pieceShadow ?? DEFAULT_APPEARANCE.pieceShadow,
      hint: d.hint === 'ring' ? 'ring' : 'dot',
      lastMove: (LAST_MOVE_COLORS as readonly string[]).includes(d.lastMove ?? '') ? (d.lastMove as LastMoveColor) : 'yellow',
      animate: d.animate ?? true,
      sound: d.sound ?? false,
      volume: typeof d.volume === 'number' && d.volume >= 0 && d.volume <= 1 ? d.volume : DEFAULT_APPEARANCE.volume,
      figurine: d.figurine ?? false,
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
  r.dataset.pieces = a.pieces
  r.dataset.shadow = a.pieceShadow ? 'on' : 'off'
  r.dataset.hint = a.hint
  r.dataset.lastmove = a.lastMove
  r.dataset.anim = a.animate ? 'on' : 'off'
  r.style.setProperty('--piece-scale', String(a.pieceScale))
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
