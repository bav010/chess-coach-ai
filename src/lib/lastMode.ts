import { pk } from './profile'
import { MODES, type ModeName } from './route'

export type LastMode = { name: ModeName; arg: string | null; at: number }
const KEY = 'chess-coach-ai:last:v1'

export function saveLast(l: LastMode) { try { localStorage.setItem(pk(KEY), JSON.stringify(l)) } catch { /* ничего */ } }
export function loadLast(): LastMode | null {
  try {
    const d = JSON.parse(localStorage.getItem(pk(KEY)) ?? 'null') as Partial<LastMode> | null
    return d && (MODES as readonly string[]).includes(d.name ?? '') ? { name: d.name as ModeName, arg: d.arg ?? null, at: Number(d.at) || 0 } : null
  } catch { return null }
}
