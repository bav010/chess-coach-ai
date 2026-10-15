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

export function clearSessions(): SavedSession[] {
  persist([])
  return []
}

export function summarize(list: SavedSession[]) {
  return { sessions: list.length, plies: list.reduce((sum, s) => sum + s.plies, 0) }
}
