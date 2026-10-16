// Шахматные часы. Чистая логика без React и таймеров: время передаётся снаружи (now),
// поэтому всё легко тестируется. Тик интерфейса лишь перерисовывает значения.
import type { Color } from 'chess.js'

export type TimeControl = {
  /** Начальное время в миллисекундах (null — часы отключены). */
  whiteMs: number | null
  blackMs: number | null
  /** Добавка после каждого хода (Фишер). */
  incrementMs: number
  /** Задержка: первые delayMs хода часы не идут. */
  delayMs: number
}

export type Preset = { id: string; label: string; minutes: number; incrementSec: number }
export type PresetGroup = { category: 'Bullet' | 'Blitz' | 'Rapid' | 'Classical'; items: Preset[] }

const p = (minutes: number, incrementSec: number): Preset => ({
  id: `${minutes}+${incrementSec}`, label: `${minutes}+${incrementSec}`, minutes, incrementSec,
})

export const TIME_PRESETS: PresetGroup[] = [
  { category: 'Bullet', items: [p(1, 0), p(1, 1), p(2, 1)] },
  { category: 'Blitz', items: [p(3, 0), p(3, 2), p(5, 0), p(5, 3)] },
  { category: 'Rapid', items: [p(10, 0), p(10, 5), p(15, 10)] },
  { category: 'Classical', items: [p(30, 0), p(45, 15), p(90, 30)] },
]

export const NO_CLOCK: TimeControl = { whiteMs: null, blackMs: null, incrementMs: 0, delayMs: 0 }

export function fromPreset(preset: Preset): TimeControl {
  const ms = preset.minutes * 60_000
  return { whiteMs: ms, blackMs: ms, incrementMs: preset.incrementSec * 1000, delayMs: 0 }
}

export type ClockSnapshot = { white: number; black: number }

/**
 * Часы партии. Работает только у стороны `active`; время вычитается лениво
 * по метке `startedAt` (с учётом задержки), а не накоплением тиков.
 */
export class ChessClock {
  private white: number
  private black: number
  private active: Color | null = null
  private startedAt = 0

  constructor(private readonly tc: TimeControl & { whiteMs: number; blackMs: number }) {
    this.white = tc.whiteMs
    this.black = tc.blackMs
  }

  get activeSide(): Color | null { return this.active }

  /** Оставшееся время стороны на момент now. */
  remaining(color: Color, now: number): number {
    const base = color === 'w' ? this.white : this.black
    if (this.active !== color) return base
    const elapsed = Math.max(0, now - this.startedAt - this.tc.delayMs)
    return Math.max(0, base - elapsed)
  }

  /** Запуск часов стороны (начало партии или смена хода). */
  start(color: Color, now: number) {
    this.active = color
    this.startedAt = now
  }

  /** Остановка часов (конец партии): списываем затраченное время. */
  stop(now: number) {
    if (!this.active) return
    this.set(this.active, this.remaining(this.active, now))
    this.active = null
  }

  /** Сторона `mover` сделала ход: списываем время, добавляем добавку, запускаем часы соперника. */
  press(mover: Color, now: number) {
    const left = this.active === mover ? this.remaining(mover, now) : (mover === 'w' ? this.white : this.black)
    this.set(mover, left + this.tc.incrementMs)
    this.start(mover === 'w' ? 'b' : 'w', now)
  }

  /** Сторона, у которой закончилось время (если есть). */
  flagged(now: number): Color | null {
    if (!this.active) return null
    return this.remaining(this.active, now) <= 0 ? this.active : null
  }

  snapshot(now: number): ClockSnapshot {
    return { white: this.remaining('w', now), black: this.remaining('b', now) }
  }

  /** Восстановление значений (отмена хода) и запуск часов стороны `toMove`. */
  restore(snap: ClockSnapshot, toMove: Color, now: number) {
    this.white = snap.white
    this.black = snap.black
    this.start(toMove, now)
  }

  private set(color: Color, ms: number) {
    if (color === 'w') this.white = ms
    else this.black = ms
  }
}

/** 4:05, 1:02:03, а в последние 10 секунд — с десятыми: 0:09.4. */
export function formatClock(ms: number): string {
  const total = Math.max(0, ms)
  if (total < 10_000) {
    const s = Math.floor(total / 1000)
    const tenth = Math.floor((total % 1000) / 100)
    return `0:0${s}.${tenth}`
  }
  const sec = Math.ceil(total / 1000)
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
