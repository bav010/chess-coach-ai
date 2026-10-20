// Резервная копия всего прогресса одним JSON-файлом: статистика партий, сессии, задачи, дебюты.
import { LocalizedError } from '../i18n/errors'
import { loadSessions, mergeSessions, type SavedSession } from '../storage'
import { loadGames, mergeGames, saveGames, type GameStat } from './gameStats'
import { loadPuzzleStats, savePuzzleStats, type PuzzleStats } from './puzzleStats'
import { loadOpenings, saveOpenings, type OpeningsData } from './openingsStore'

export type Backup = {
  app: 'chess-coach-ai'
  kind: 'backup'
  v: 1
  exportedAt: string
  games: GameStat[]
  sessions: SavedSession[]
  puzzles: PuzzleStats
  openings: OpeningsData
}

export function makeBackup(): Backup {
  return { app: 'chess-coach-ai', kind: 'backup', v: 1, exportedAt: new Date().toISOString(), games: loadGames(), sessions: loadSessions(), puzzles: loadPuzzleStats(), openings: loadOpenings() }
}

export function parseBackup(text: string): Backup {
  let d: Partial<Backup>
  try { d = JSON.parse(text) as Partial<Backup> } catch { throw new LocalizedError('stats.backup.err.notJson') }
  if (!d || d.app !== 'chess-coach-ai' || d.kind !== 'backup' || d.v !== 1) throw new LocalizedError('stats.backup.err.notBackup')
  return {
    ...(d as Backup),
    games: Array.isArray(d.games) ? d.games : [],
    sessions: Array.isArray(d.sessions) ? d.sessions : [],
  }
}

/**
 * Восстановление. Партии и сессии объединяются с текущими без дублей; прогресс задач и дебютов заменяется
 * данными из файла только по просьбе (restoreTrainers), потому что слить его по смыслу нельзя.
 */
export function applyBackup(b: Backup, restoreTrainers: boolean): { games: number; sessions: number } {
  const games = mergeGames(loadGames(), b.games.filter(g => g && typeof g.key === 'string' && typeof g.at === 'string'))
  saveGames(games)
  const sessions = mergeSessions(b.sessions)
  if (restoreTrainers) {
    if (b.puzzles && b.puzzles.v === 1) savePuzzleStats(b.puzzles)
    if (b.openings && b.openings.v === 1) saveOpenings(b.openings)
  }
  return { games: games.length, sessions: sessions.length }
}
