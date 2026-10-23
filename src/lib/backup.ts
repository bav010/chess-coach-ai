// Резервная копия всего прогресса одним JSON-файлом: партии, сессии, разборы, задачи, дебюты, ошибки, активность и (по желанию) настройки.
// Восстановление всегда ОБЪЕДИНЯЕТ данные с текущими (ничего не затирает и не дублирует). Файлы версии 1 читаются как раньше.
import { LocalizedError } from '../i18n/errors'
import { listReviews, loadSessions, mergeSessions, saveReview, type SavedSession, type StoredReview } from '../storage'
import { loadGames, mergeGames, saveGames, type GameStat } from './gameStats'
import { loadPuzzleStats, savePuzzleStats, type PuzzleStats } from './puzzleStats'
import { loadOpenings, saveOpenings, type OpeningsData } from './openingsStore'
import { loadActivity, mergeActivity, saveActivity, type Activity } from './activity'
import { loadMistakes, mergeMistakes, saveMistakes, type MistakeStore } from './mistakes'
import { loadPrefs, savePrefs, type Prefs } from './prefs'
import { getAppearance, setAppearance, type Appearance } from './appearance'
import { mergeOpenings, mergePuzzles } from './sync'

export type Backup = {
  app: 'chess-coach-ai'
  kind: 'backup'
  v: 1 | 2
  exportedAt: string
  games: GameStat[]
  sessions: SavedSession[]
  puzzles: PuzzleStats
  openings: OpeningsData
  /** С версии 2. */
  activity?: Activity
  mistakes?: MistakeStore
  reviews?: StoredReview[]
  prefs?: Prefs
  appearance?: Appearance
}

export function makeBackup(): Backup {
  return {
    app: 'chess-coach-ai', kind: 'backup', v: 2, exportedAt: new Date().toISOString(),
    games: loadGames(), sessions: loadSessions(), puzzles: loadPuzzleStats(), openings: loadOpenings(),
    activity: loadActivity(), mistakes: loadMistakes(), reviews: listReviews(), prefs: loadPrefs(), appearance: getAppearance(),
  }
}

export function parseBackup(text: string): Backup {
  let d: Partial<Backup>
  try { d = JSON.parse(text) as Partial<Backup> } catch { throw new LocalizedError('stats.backup.err.notJson') }
  if (!d || d.app !== 'chess-coach-ai' || d.kind !== 'backup' || (d.v !== 1 && d.v !== 2)) throw new LocalizedError('stats.backup.err.notBackup')
  return {
    ...(d as Backup),
    games: Array.isArray(d.games) ? d.games : [],
    sessions: Array.isArray(d.sessions) ? d.sessions : [],
  }
}

/** Что лежит в файле — показывается перед восстановлением. */
export type BackupInfo = { exportedAt: string; games: number; sessions: number; mistakes: number; repertoires: number; puzzlesSolved: number; hasSettings: boolean }
export function describeBackup(b: Backup): BackupInfo {
  return {
    exportedAt: typeof b.exportedAt === 'string' ? b.exportedAt : '',
    games: b.games.length, sessions: b.sessions.length,
    mistakes: b.mistakes && b.mistakes.v === 1 && b.mistakes.items ? Object.keys(b.mistakes.items).length : 0,
    repertoires: b.openings && b.openings.v === 1 && Array.isArray(b.openings.repertoires) ? b.openings.repertoires.length : 0,
    puzzlesSolved: b.puzzles && b.puzzles.v === 1 && typeof b.puzzles.solved === 'number' ? b.puzzles.solved : 0,
    hasSettings: !!b.prefs || !!b.appearance,
  }
}

export type ApplyOptions = { settings?: boolean }

/**
 * Восстановление: всё объединяется с текущими данными (партии и сессии без дублей, прогресс задач, дебютов и ошибок — по самой свежей
 * записи, дни активности — объединением). Настройки заменяются только при settings: true.
 */
export function applyBackup(b: Backup, o: ApplyOptions = {}): { games: number; sessions: number } {
  const games = mergeGames(loadGames(), b.games.filter(g => g && typeof g.key === 'string' && typeof g.at === 'string'))
  saveGames(games)
  const sessions = mergeSessions(b.sessions)
  if (b.puzzles && b.puzzles.v === 1) savePuzzleStats(mergePuzzles(loadPuzzleStats(), b.puzzles))
  if (b.openings && b.openings.v === 1 && Array.isArray(b.openings.repertoires)) saveOpenings(mergeOpenings(loadOpenings(), b.openings))
  if (b.activity && b.activity.v === 1) saveActivity(mergeActivity(loadActivity(), b.activity))
  if (b.mistakes && b.mistakes.v === 1 && b.mistakes.items && b.mistakes.cards) saveMistakes(mergeMistakes(loadMistakes(), b.mistakes))
  if (Array.isArray(b.reviews)) {
    const have = new Set(listReviews().map(r => r.key))
    for (const r of b.reviews) if (r && typeof r.key === 'string' && Array.isArray(r.evals) && !have.has(r.key)) saveReview(r)
  }
  if (o.settings) {
    if (b.prefs) savePrefs(b.prefs)
    if (b.appearance) setAppearance(b.appearance)
  }
  return { games: games.length, sessions: sessions.length }
}
