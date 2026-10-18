// Хранилище прогресса в localStorage браузера: данные остаются на устройстве пользователя,
// сервер не нужен — поэтому сайт целиком работает на GitHub Pages.

export type SessionResult = 'in_progress' | '1-0' | '0-1' | '1/2-1/2'

export type SavedSession = {
  id: number
  created_at: string // ISO 8601
  result: SessionResult
  plies: number
  pgn: string
}

const KEY = 'chess-coach-ai:sessions:v1'
const MAX_SESSIONS = 200

export function loadSessions(): SavedSession[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const data: unknown = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return data.filter((s): s is SavedSession =>
      typeof s?.id === 'number' && typeof s?.plies === 'number' && typeof s?.pgn === 'string')
  } catch {
    return []
  }
}

function persist(list: SavedSession[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* приватный режим или переполнение */ }
}

/** Добавляет сессию (новые — в начале списка) и возвращает обновлённый список. */
export function addSession(s: Pick<SavedSession, 'result' | 'plies' | 'pgn'>): SavedSession[] {
  const entry: SavedSession = { id: Date.now(), created_at: new Date().toISOString(), ...s }
  const list = [entry, ...loadSessions()].slice(0, MAX_SESSIONS)
  persist(list)
  return list
}

/** Объединяет сессии из резервной копии с имеющимися (без дублей по PGN), новые сверху. */
export function mergeSessions(extra: readonly SavedSession[]): SavedSession[] {
  const cur = loadSessions()
  const seen = new Set(cur.map(s => s.pgn))
  const add = extra.filter(s => typeof s?.pgn === 'string' && typeof s?.plies === 'number' && typeof s?.id === 'number' && !seen.has(s.pgn))
  const list = [...cur, ...add].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, MAX_SESSIONS)
  persist(list)
  return list
}

export function clearSessions(): SavedSession[] {
  persist([])
  return []
}

export function summarize(list: SavedSession[]) {
  return { sessions: list.length, plies: list.reduce((sum, s) => sum + s.plies, 0) }
}

// ---------------------------------------------------------------------------------------------
// Сохранённые разборы партий и прогресс тренировки ошибок (тоже только в localStorage).

export type StoredLine = { multipv: number; depth: number; cp: number | null; mate: number | null; pv: string[] }
/** Результат анализа одной позиции (с точки зрения стороны, чей ход) или null, если не анализировалась. */
export type StoredEval = { depth: number; lines: StoredLine[] } | null

export type TrainerEntry = {
  attempts: number
  solved: boolean
  firstTry: boolean
  hints: number
  revealed: boolean
}

export type StoredReview = {
  key: string
  created_at: string
  startFen: string
  ucis: string[]
  userColor: 'w' | 'b' | null
  evals: StoredEval[]
  trainer: Record<string, TrainerEntry>
}

const REVIEWS_KEY = 'chess-coach-ai:reviews:v1'
const MAX_REVIEWS = 8

/** Устойчивый короткий ключ партии (стартовая позиция + ходы). */
export function gameKey(startFen: string, ucis: readonly string[]): string {
  const text = `${startFen}|${ucis.join(' ')}`
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return `${(h >>> 0).toString(36)}-${ucis.length}`
}

function readReviews(): StoredReview[] {
  try {
    const raw = localStorage.getItem(REVIEWS_KEY)
    const data: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(data) ? data.filter((r): r is StoredReview => typeof r?.key === 'string' && Array.isArray(r?.evals)) : []
  } catch {
    return []
  }
}

export function loadReview(key: string): StoredReview | null {
  return readReviews().find(r => r.key === key) ?? null
}

export function saveReview(review: StoredReview) {
  const list = [review, ...readReviews().filter(r => r.key !== review.key)].slice(0, MAX_REVIEWS)
  try { localStorage.setItem(REVIEWS_KEY, JSON.stringify(list)) } catch { /* переполнение — не критично */ }
}
