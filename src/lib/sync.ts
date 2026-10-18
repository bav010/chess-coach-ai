// Облачная синхронизация: один JSON-снимок прогресса на пользователя. Слияние только «добавляющее»
// (объединение партий, карточек, уроков; из двух значений берётся более продвинутое), поэтому синхронизация
// с другого устройства ничего не стирает. Чистые функции здесь, сетевой слой — в cloud.ts.
import { loadSessions, replaceSessions, type SavedSession } from '../storage'
import { loadGames, mergeGames, saveGames, type GameStat } from './gameStats'
import { loadPrefs, savePrefs, type Prefs } from './prefs'
import { loadProfiles, updateProfile, pk, type Avatar } from './profile'
import { loadPuzzleStats, savePuzzleStats, type PuzzleStats } from './puzzleStats'
import { loadOpenings, saveOpenings, type OpeningsData } from './openingsStore'
import type { Repertoire } from './repertoire'

export type Snapshot = {
  v: 1
  updatedAt: string
  profile: { name: string; avatar: Avatar }
  prefs: Prefs
  games: GameStat[]
  sessions: SavedSession[]
  puzzles: PuzzleStats
  openings: OpeningsData
  /** Когда статистика партий последний раз сбрасывалась: партии не позднее этого момента отбрасываются при слиянии. */
  gamesResetAt: string | null
}

// ---------- служебные данные синхронизации (на профиль) ----------
type Meta = { resetAt: string | null; pushedHash: string | null; lastPushAt: number; lastSyncAt: number }
const META = 'chess-coach-ai:syncmeta:v1'
export function loadMeta(): Meta {
  try {
    const d = JSON.parse(localStorage.getItem(pk(META)) ?? 'null') as Partial<Meta> | null
    return { resetAt: d?.resetAt ?? null, pushedHash: d?.pushedHash ?? null, lastPushAt: d?.lastPushAt ?? 0, lastSyncAt: d?.lastSyncAt ?? 0 }
  } catch { return { resetAt: null, pushedHash: null, lastPushAt: 0, lastSyncAt: 0 } }
}
export function saveMeta(m: Partial<Meta>) {
  try { localStorage.setItem(pk(META), JSON.stringify({ ...loadMeta(), ...m })) } catch { /* ничего */ }
}

/** Отмечает сброс статистики партий, чтобы он дошёл и до облака, и до других устройств. */
export function markGamesReset() { saveMeta({ resetAt: new Date().toISOString(), pushedHash: null }) }

// ---------- снимок ----------
export function collectSnapshot(): Snapshot {
  const st = loadProfiles()
  const me = st.list.find(p => p.id === st.current) ?? st.list[0]
  return {
    v: 1, updatedAt: new Date().toISOString(), profile: { name: me.name, avatar: me.avatar }, prefs: loadPrefs(),
    games: loadGames(), sessions: loadSessions(), puzzles: loadPuzzleStats(), openings: loadOpenings(), gamesResetAt: loadMeta().resetAt,
  }
}

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  if (v && typeof v === 'object') return `{${Object.keys(v as object).sort().map(k => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`
  return JSON.stringify(v) ?? 'null'
}

/** Хэш содержимого снимка (без времени создания) — чтобы понять, изменилось ли что-то. */
export function snapshotHash(s: Snapshot): string {
  const { updatedAt: _u, ...rest } = s
  void _u
  const text = stable({ ...rest, games: [...rest.games].sort((a, b) => a.key.localeCompare(b.key)) })
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return `${(h >>> 0).toString(36)}-${text.length}`
}

export function isSnapshot(d: unknown): d is Snapshot {
  const s = d as Partial<Snapshot> | null
  return !!s && s.v === 1 && Array.isArray(s.games) && Array.isArray(s.sessions) && !!s.puzzles && !!s.openings && Array.isArray(s.openings.repertoires)
}

// ---------- слияние ----------
const union = <T,>(a: readonly T[], b: readonly T[]): T[] => { const s = new Set(a); return [...a, ...b.filter(x => !s.has(x))] }

export function mergePuzzles(a: PuzzleStats, b: PuzzleStats): PuzzleStats {
  const base = b.attempted > a.attempted ? b : a
  const other = base === a ? b : a
  const solvedIds = union(base.solvedIds, other.solvedIds)
  const solved = new Set(solvedIds)
  const byTheme = { ...other.byTheme, ...base.byTheme }
  for (const [k, v] of Object.entries(other.byTheme)) {
    const cur = byTheme[k as keyof typeof byTheme]
    if (!cur || v.tried > cur.tried) byTheme[k as keyof typeof byTheme] = v
  }
  return { ...base, solvedIds, failedIds: union(base.failedIds, other.failedIds).filter(id => !solved.has(id)), byTheme }
}

function mergeRep(x: Repertoire, y: Repertoire): Repertoire {
  const lines = x.lines.map(l => {
    const o = y.lines.find(m => m.id === l.id)
    const lessons = union(l.lessons ?? [], o?.lessons ?? [])
    return lessons.length ? { ...l, lessons } : l
  })
  return { ...x, lines: [...lines, ...y.lines.filter(l => !x.lines.some(m => m.id === l.id))], notes: { ...y.notes, ...x.notes } }
}

export function mergeOpenings(a: OpeningsData, b: OpeningsData): OpeningsData {
  const repertoires = [
    ...a.repertoires.map(r => { const o = b.repertoires.find(m => m.id === r.id); return o ? mergeRep(r, o) : r }),
    ...b.repertoires.filter(r => !a.repertoires.some(m => m.id === r.id)),
  ]
  const cards = { ...b.cards, ...a.cards }
  for (const [k, c] of Object.entries(b.cards)) if (a.cards[k] && c.last > a.cards[k].last) cards[k] = c
  const lessons = { ...b.lessons, ...a.lessons }
  for (const [k, l] of Object.entries(b.lessons)) {
    const m = a.lessons[k]
    if (m) lessons[k] = { done: m.done || l.done, runs: Math.max(m.runs, l.runs), mistakes: l.runs > m.runs ? l.mistakes : m.mistakes }
  }
  const max = (k: keyof OpeningsData['stats']) => Math.max(a.stats[k], b.stats[k])
  return {
    ...a, repertoires, cards, lessons,
    stats: { answered: max('answered'), correct: max('correct'), timeMs: max('timeMs'), sessions: max('sessions') },
    activeId: a.activeId && repertoires.some(r => r.id === a.activeId) ? a.activeId : (b.activeId && repertoires.some(r => r.id === b.activeId) ? b.activeId : repertoires[0]?.id ?? null),
  }
}

/** Объединяет локальный и облачный снимки. Настройки и профиль берутся у локального, если не сказано иначе. */
export function mergeSnapshots(local: Snapshot, remote: Snapshot, preferRemoteSettings = false): Snapshot {
  const resetAt = [local.gamesResetAt, remote.gamesResetAt].filter((x): x is string => !!x).sort().pop() ?? null
  const games = mergeGames(local.games, remote.games).filter(g => !resetAt || g.at > resetAt)
  const sessionsMap = new Map<string, SavedSession>()
  for (const s of [...local.sessions, ...remote.sessions]) if (s && typeof s.pgn === 'string' && !sessionsMap.has(s.pgn)) sessionsMap.set(s.pgn, s)
  const sessions = [...sessionsMap.values()].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 200)
  const pref = preferRemoteSettings ? remote : local
  return {
    v: 1, updatedAt: new Date().toISOString(), profile: pref.profile, prefs: pref.prefs,
    games, sessions, puzzles: mergePuzzles(local.puzzles, remote.puzzles), openings: mergeOpenings(local.openings, remote.openings), gamesResetAt: resetAt,
  }
}

/** Записывает объединённый снимок в локальное хранилище текущего профиля. */
export function applySnapshot(s: Snapshot) {
  saveGames(s.games)
  replaceSessions(s.sessions)
  savePuzzleStats(s.puzzles)
  saveOpenings(s.openings)
  savePrefs(s.prefs)
  saveMeta({ resetAt: s.gamesResetAt })
  const st = loadProfiles()
  updateProfile(st.current, { name: s.profile.name, avatar: s.profile.avatar })
}

