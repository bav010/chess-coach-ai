// Калибровка силы бота по приблизительному рейтингу ELO.
//
// Stockfish умеет честно ослабляться только в диапазоне UCI_Elo 1320–3190 (опции UCI_LimitStrength и UCI_Elo):
// это реальное ограничение силы движка, а не подпись на экране. Ниже 1320 такой опции нет, поэтому для
// 400–1319 используется приближённая калибровка: ход ослабленного движка (как при 1320) плюс «человеческие»
// промахи — с вероятностью, растущей при снижении рейтинга, вместо хода движка выбирается другой вариант
// из его пятёрки лучших. Так бот строго слабее режима 1320, а сила монотонно падает с рейтингом
// (проверено матчами движка против самого себя). Рейтинг ориентировочный: реальная сила зависит от
// времени на ход, позиции и настроек.

export const ELO_MIN = 400
export const ELO_MAX = 3200
export const ENGINE_MIN_ELO = 1320
export const ENGINE_MAX_ELO = 3190

export const ELO_PRESETS: { label: string; elo: number }[] = [
  { label: 'Новичок', elo: 600 },
  { label: 'Любитель', elo: 1000 },
  { label: 'Клубный игрок', elo: 1400 },
  { label: 'Сильный любитель', elo: 1800 },
  { label: 'Эксперт', elo: 2200 },
  { label: 'Мастер', elo: 2600 },
  { label: 'Максимум', elo: 3200 },
]

export type BotSettings = {
  /** Включить встроенное ослабление Stockfish (UCI_LimitStrength). */
  limitStrength: boolean
  uciElo: number
  /** Ограничение глубины поиска (null — без ограничения). */
  depth: number | null
  /** Сколько линий запрашивать у движка (для «человеческих» промахов нужно больше одной). */
  multipv: number
  /** Вероятность выбрать вместо хода движка другой вариант из его линий. */
  slipChance: number
}

export function clampElo(elo: number): number {
  if (!Number.isFinite(elo)) return 1500
  return Math.max(ELO_MIN, Math.min(ELO_MAX, Math.round(elo)))
}

/**
 * Вероятность «промаха» (выбор другого хода из пятёрки лучших вместо хода движка) для слабых уровней.
 * Ниже 1320 у Stockfish нет встроенного ограничения, поэтому сила снижается именно так.
 *
 * Таблица подобрана по обратной связи: прежний «600» (промах в 80% ходов) играл слабее настоящего новичка
 * (игрок около 300 по рейтингу chess.com обыгрывал его с лёгкостью), поэтому слабые уровни стали сильнее.
 * Промежуточные значения — линейная интерполяция. Если бот кажется слишком сильным или слабым, правьте
 * вторые числа пар: чем больше вероятность промаха, тем слабее бот. Строго убывает с ростом рейтинга.
 */
export const LOW_ELO_SLIP: readonly (readonly [elo: number, slip: number])[] = [
  [400, 0.45], [600, 0.25], [800, 0.12], [1000, 0.05], [1200, 0.015], [1320, 0],
]

export function slipForElo(elo: number): number {
  const t = LOW_ELO_SLIP
  if (elo <= t[0][0]) return t[0][1]
  for (let i = 1; i < t.length; i++) {
    const [e1, s1] = t[i]
    if (elo <= e1) {
      const [e0, s0] = t[i - 1]
      return Math.round((s0 + ((s1 - s0) * (elo - e0)) / (e1 - e0)) * 1e4) / 1e4
    }
  }
  return 0
}

export function calibrate(rawElo: number): BotSettings {
  const elo = clampElo(rawElo)
  if (elo > ENGINE_MAX_ELO) {
    return { limitStrength: false, uciElo: ENGINE_MAX_ELO, depth: null, multipv: 2, slipChance: 0 }
  }
  if (elo >= ENGINE_MIN_ELO) {
    return { limitStrength: true, uciElo: elo, depth: null, multipv: 2, slipChance: 0 }
  }
  const slipChance = slipForElo(elo)
  return { limitStrength: true, uciElo: ENGINE_MIN_ELO, depth: null, multipv: 5, slipChance }
}

/** Время на ход, мс, с учётом часов бота (null — без часов). */
export function thinkTimeMs(elo: number, remainingMs: number | null, incrementMs: number): number {
  const base = 700 + (clampElo(elo) / ELO_MAX) * 1300
  if (remainingMs === null) return Math.round(base)
  const byClock = remainingMs / 40 + incrementMs * 0.7
  const t = Math.min(base * 2, byClock, remainingMs * 0.5)
  return Math.max(100, Math.round(t))
}

export type BotLine = { uci: string }

/**
 * Выбор хода: по умолчанию — ход движка (`bestUci`); с вероятностью `slipChance` — случайный другой вариант
 * из его линий (имитация человеческой ошибки). `rnd` — генератор [0,1).
 */
export function pickBotMove(
  bestUci: string | null,
  lines: readonly BotLine[],
  slipChance: number,
  rnd: () => number = Math.random,
): string | null {
  const chosen = bestUci ?? lines[0]?.uci ?? null
  const others = lines.filter(l => l.uci !== chosen)
  if (chosen && others.length > 0 && rnd() < slipChance) return others[Math.floor(rnd() * others.length)].uci
  return chosen
}

export type DelayInput = {
  elo: number
  /** Число легальных ходов в позиции. */
  legalMoves: number
  inCheck: boolean
  /** Разрыв между первой и второй линиями движка, сантипешки (null — вторая линия неизвестна). */
  gapCp: number | null
  /** Номер полухода (с 0). */
  ply: number
  remainingMs: number | null
  incrementMs: number
  rnd?: () => number
}

/**
 * «Человеческая» пауза перед ходом бота, мс. Растёт с рейтингом (сильный бот «думает» дольше) и со
 * сложностью позиции (много ходов, близкие по силе варианты), сокращается для вынужденных ходов,
 * очевидных ответов и начала партии, и никогда не съедает больше доли оставшегося времени.
 */
export function humanDelayMs(i: DelayInput): number {
  const rnd = i.rnd ?? Math.random
  const cap = i.remainingMs === null ? Infinity : Math.min(i.remainingMs / 12 + i.incrementMs * 0.6, i.remainingMs * 0.4)
  if (i.legalMoves <= 1) return Math.max(250, Math.min(cap, Math.round(400 + rnd() * 300)))
  const base = 1200 + (clampElo(i.elo) / ELO_MAX) * 3300
  let c = Math.max(0.6, Math.min(1.5, i.legalMoves / 30))
  if (i.inCheck) c *= 0.6
  if (i.gapCp !== null) {
    if (i.gapCp >= 300) c *= 0.45
    else if (i.gapCp >= 120) c *= 0.7
    else if (i.gapCp <= 25) c *= 1.45
  }
  if (i.ply < 12) c *= 0.55
  c *= 0.75 + rnd() * 0.5
  return Math.round(Math.max(300, Math.min(base * c, 12_000, cap)))
}

/** Разрыв (сантипешки) между первой и второй линиями; мат считается очень большой оценкой. */
export function lineGapCp(lines: readonly { cp: number | null; mate: number | null }[]): number | null {
  if (lines.length < 2) return null
  const v = (l: { cp: number | null; mate: number | null }) => (l.mate !== null ? (l.mate > 0 ? 10_000 : -10_000) : l.cp ?? 0)
  return Math.abs(v(lines[0]) - v(lines[1]))
}
