// Расчёты статистики: фильтры, внутренний рейтинг, сводки, повторяющиеся проблемы и рекомендации.
import type { Phase } from './game'
import type { GameStat, Outcome } from './gameStats'
import { weakThemes, type PuzzleStats } from './puzzleStats'
import { THEME_LABEL } from './puzzleThemes'
import { t, tn } from '../i18n'

export type Filters = {
  period: 'all' | '7' | '30' | '90' | '365'
  color: 'all' | 'w' | 'b'
  result: 'all' | Outcome
  mode: 'all' | 'bot' | 'botClock' | 'botNoClock' | 'analysis'
}
export const DEFAULT_FILTERS: Filters = { period: 'all', color: 'all', result: 'all', mode: 'all' }

export function applyFilters(games: readonly GameStat[], f: Filters, now = Date.now()): GameStat[] {
  const from = f.period === 'all' ? 0 : now - Number(f.period) * 86_400_000
  return games.filter(g => {
    if (Date.parse(g.at) < from) return false
    if (f.color !== 'all' && g.color !== f.color) return false
    if (f.result !== 'all' && g.outcome !== f.result) return false
    if (f.mode === 'bot' && g.src !== 'bot') return false
    if (f.mode === 'analysis' && g.src !== 'analysis') return false
    if (f.mode === 'botClock' && !(g.src === 'bot' && g.tc !== null && g.tc !== '-')) return false
    if (f.mode === 'botNoClock' && !(g.src === 'bot' && g.tc === '-')) return false
    return true
  }).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
}

// ---------- внутренний рейтинг приложения (не FIDE и не Chess.com) ----------
export const RATING_START = 1000
export type RatingPoint = { key: string; at: string; rating: number; delta: number; opp: number }

/** Рейтинг по формуле Эло против номинальной силы бота; считается заново по всем партиям, поэтому не зависит от порядка сохранения. */
export function ratingSeries(games: readonly GameStat[]): RatingPoint[] {
  const list = games.filter(g => g.src === 'bot' && g.outcome && g.opp !== null).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  let r = RATING_START
  return list.map((g, i) => {
    const k = i < 10 ? 40 : i < 30 ? 28 : 20
    const e = 1 / (1 + 10 ** (((g.opp as number) - r) / 400))
    const s = g.outcome === 'win' ? 1 : g.outcome === 'draw' ? 0.5 : 0
    const delta = k * (s - e)
    r = Math.max(100, r + delta)
    return { key: g.key, at: g.at, rating: r, delta, opp: g.opp as number }
  })
}

// ---------- сводка ----------
export type Wdl = { w: number; d: number; l: number }
export type Summary = {
  total: number
  finished: number
  /** Партии, в которых результат считается для пользователя (с ботом). */
  decided: number
  wdl: Wdl
  scorePct: number | null
  reviewed: number
  acc: number | null
  reviewedMoves: number
  errors: { inaccuracy: number; mistake: number; miss: number; blunder: number }
  /** Ошибок на 100 ходов по разобранным партиям. */
  per100: { inaccuracy: number; mistake: number; miss: number; blunder: number; all: number } | null
  hung: number
  missed: number
  phases: Record<Phase, { n: number; acc: number | null; bad: number }>
  endgame: { games: number; wdl: Wdl; scorePct: number | null; acc: number | null; strong: { n: number; won: number } }
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const score = (w: Wdl) => { const n = w.w + w.d + w.l; return n ? Math.round(((w.w + w.d / 2) / n) * 100) : null }
const wdlOf = (gs: readonly GameStat[]): Wdl => ({ w: gs.filter(g => g.outcome === 'win').length, d: gs.filter(g => g.outcome === 'draw').length, l: gs.filter(g => g.outcome === 'loss').length })

export function summarize(games: readonly GameStat[]): Summary {
  const decided = games.filter(g => g.outcome)
  const wdl = wdlOf(decided)
  const rev = games.filter(g => g.review)
  const moves = rev.reduce((s, g) => s + (g.review?.moves ?? 0), 0)
  const cnt = (k: 'inaccuracy' | 'mistake' | 'miss' | 'blunder') => rev.reduce((s, g) => s + (g.review?.counts[k] ?? 0), 0)
  const errors = { inaccuracy: cnt('inaccuracy'), mistake: cnt('mistake'), miss: cnt('miss'), blunder: cnt('blunder') }
  const p100 = (n: number) => Math.round((n / moves) * 1000) / 10
  const phases = Object.fromEntries((['opening', 'middlegame', 'endgame'] as Phase[]).map(ph => {
    const items = rev.map(g => g.review!.phases[ph]).filter(p => p && p.n > 0)
    const accs = items.map(p => p.acc).filter((x): x is number => x !== null)
    return [ph, { n: items.reduce((s, p) => s + p.n, 0), acc: mean(accs), bad: items.reduce((s, p) => s + p.bad, 0) }]
  })) as Summary['phases']
  const eg = decided.filter(g => g.endgame)
  const egWdl = wdlOf(eg)
  const strong = rev.filter(g => g.outcome && g.review!.endEntry !== null && (g.review!.endEntry as number) >= 65)
  return {
    total: games.length,
    finished: games.filter(g => g.result !== 'in_progress').length,
    decided: decided.length,
    wdl, scorePct: score(wdl),
    reviewed: rev.length,
    acc: mean(rev.map(g => g.review!.acc).filter((x): x is number => x !== null)),
    reviewedMoves: moves,
    errors,
    per100: moves > 0 ? { inaccuracy: p100(errors.inaccuracy), mistake: p100(errors.mistake), miss: p100(errors.miss), blunder: p100(errors.blunder), all: p100(errors.inaccuracy + errors.mistake + errors.miss + errors.blunder) } : null,
    hung: rev.reduce((s, g) => s + g.review!.hung, 0),
    missed: rev.reduce((s, g) => s + g.review!.missed, 0),
    phases,
    endgame: {
      games: eg.length, wdl: egWdl, scorePct: score(egWdl),
      acc: phases.endgame.acc,
      strong: { n: strong.length, won: strong.filter(g => g.outcome === 'win').length },
    },
  }
}

export function movingAverage(xs: readonly number[], w = 5): number[] {
  return xs.map((_, i) => { const s = xs.slice(Math.max(0, i - w + 1), i + 1); return s.reduce((a, b) => a + b, 0) / s.length })
}

// ---------- рекомендации ----------
export const MIN_REVIEWED = 5

export type Rec = {
  id: string
  title: string
  text: string
  /** На каких данных основан вывод — показывается пользователю. */
  basis: string
  keys: string[]
  action: { label: string; go: 'tactics' | 'openings' | 'analysis' | 'play' }
}

const games_ = (n: number) => tn('stats.rec.inGames', n)

export type RecResult = { recs: Rec[]; reviewed: number; needMore: number }

/** Рекомендации по повторяющимся проблемам. Без вывода, пока разобрано меньше MIN_REVIEWED партий. */
export function recommend(games: readonly GameStat[], puzzles: PuzzleStats): RecResult {
  const rev = games.filter(g => g.review && g.color)
  const recs: Rec[] = []
  const n = rev.length

  // по задачам вывод строится независимо от партий
  const weak = weakThemes(puzzles, 5)
  if (weak.length > 0) {
    const w = weak[0]
    recs.push({
      id: 'puzzle-theme', title: t('stats.rec.puzzleTheme.title', { theme: THEME_LABEL[w.theme].toLowerCase() }),
      text: t('stats.rec.puzzleTheme.text', { pct: w.percent }),
      basis: t('stats.rec.puzzleTheme.basis', { n: w.tried }), keys: [],
      action: { label: t('stats.act.puzzles'), go: 'tactics' },
    })
  }
  if (n < MIN_REVIEWED) return { recs, reviewed: n, needMore: MIN_REVIEWED - n }

  const blunders = rev.filter(g => (g.review!.counts.blunder ?? 0) > 0)
  const totBlunders = rev.reduce((s, g) => s + (g.review!.counts.blunder ?? 0), 0)
  const moves = rev.reduce((s, g) => s + g.review!.moves, 0)
  if (totBlunders >= 4 && blunders.length >= Math.ceil(n * 0.5) && totBlunders / moves >= 0.02) {
    recs.push({
      id: 'blunders', title: t('stats.rec.blunders.title'),
      text: t('stats.rec.blunders.text'),
      basis: t('stats.rec.blunders.basis', { blunders: totBlunders, games: games_(blunders.length), n, rate: (totBlunders / moves * 100).toFixed(1) }),
      keys: blunders.map(g => g.key), action: { label: t('stats.act.review'), go: 'analysis' },
    })
  }
  const hungGames = rev.filter(g => g.review!.hung > 0)
  const hung = rev.reduce((s, g) => s + g.review!.hung, 0)
  if (hung >= 3 && hungGames.length >= 3) {
    recs.push({
      id: 'hung', title: t('stats.rec.hung.title'),
      text: t('stats.rec.hung.text'),
      basis: t('stats.rec.hung.basis', { hung, games: games_(hungGames.length), n }),
      keys: hungGames.map(g => g.key), action: { label: t('stats.act.puzzles'), go: 'tactics' },
    })
  }
  const missGames = rev.filter(g => g.review!.missed > 0)
  const missed = rev.reduce((s, g) => s + g.review!.missed, 0)
  if (missed >= 3 && missGames.length >= 3) {
    recs.push({
      id: 'missed', title: t('stats.rec.missed.title'),
      text: t('stats.rec.missed.text'),
      basis: t('stats.rec.missed.basis', { missed, games: games_(missGames.length), n }),
      keys: missGames.map(g => g.key), action: { label: t('stats.act.puzzles'), go: 'tactics' },
    })
  }
  const adv = rev.filter(g => g.outcome && (g.review!.peakWin ?? 0) >= 80)
  const notWon = adv.filter(g => g.outcome !== 'win')
  if (adv.length >= 4 && notWon.length >= 3 && notWon.length / adv.length >= 0.4) {
    recs.push({
      id: 'convert', title: t('stats.rec.convert.title'),
      text: t('stats.rec.convert.text'),
      basis: t('stats.rec.convert.basis', { notWon: notWon.length, adv: adv.length }),
      keys: notWon.map(g => g.key), action: { label: t('stats.act.play'), go: 'play' },
    })
  }
  const s = summarize(rev)
  const overall = s.acc
  const ph: { p: Phase; go: Rec['action']['go'] }[] = [
    { p: 'opening', go: 'openings' }, { p: 'middlegame', go: 'tactics' }, { p: 'endgame', go: 'play' },
  ]
  if (overall !== null) {
    for (const x of ph) {
      const v = s.phases[x.p]
      if (v.acc !== null && v.n >= 25 && overall - v.acc >= 10) {
        const phase = t(`stats.rec.phase.${x.p}`)
        recs.push({
          id: `phase-${x.p}`, title: t('stats.rec.phase.title', { phase }),
          text: t('stats.rec.phase.text', { phase, gap: Math.round(overall - v.acc), tip: t(`stats.rec.phase.tip.${x.p}`) }),
          basis: t('stats.rec.phase.basis', { phase, moves: v.n, n, acc: Math.round(v.acc), overall: Math.round(overall) }),
          keys: rev.filter(g => g.review!.phases[x.p].n > 0).map(g => g.key), action: { label: x.go === 'openings' ? t('stats.act.openings') : x.go === 'tactics' ? t('stats.act.puzzles') : t('stats.act.play'), go: x.go },
        })
      }
    }
  }
  const eg = s.endgame
  if (eg.games >= 4 && eg.scorePct !== null && eg.scorePct < 40) {
    recs.push({
      id: 'endgame-score', title: t('stats.rec.endgame.title'),
      text: t('stats.rec.endgame.text'),
      basis: t('stats.rec.endgame.basis', { games: eg.games, pct: eg.scorePct }),
      keys: rev.filter(g => g.endgame).map(g => g.key), action: { label: t('stats.act.play'), go: 'play' },
    })
  }
  return { recs, reviewed: n, needMore: 0 }
}
