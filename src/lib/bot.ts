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

export function calibrate(rawElo: number): BotSettings {
  const elo = clampElo(rawElo)
  if (elo > ENGINE_MAX_ELO) {
    return { limitStrength: false, uciElo: ENGINE_MAX_ELO, depth: null, multipv: 1, slipChance: 0 }
  }
  if (elo >= ENGINE_MIN_ELO) {
    return { limitStrength: true, uciElo: elo, depth: null, multipv: 1, slipChance: 0 }
  }
  const slipChance = Math.max(0, Math.min(0.92, (ENGINE_MIN_ELO - elo) / 900))
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
