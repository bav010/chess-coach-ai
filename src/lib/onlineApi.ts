// Сетевой слой онлайн-партий: функции Supabase (см. docs/supabase.sql) и подписка на изменения.
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getClient } from './cloud'
import type { OnlineGame, Side } from './online'

async function rpc(fn: string, args: Record<string, unknown>): Promise<OnlineGame> {
  const c = await getClient()
  const { data, error } = await c.rpc(fn, args)
  if (error) throw error
  return data as OnlineGame
}

export const createGame = (name: string, color: Side | 'r', baseS: number, incS: number) => rpc('online_create', { p_name: name, p_color: color, p_base_s: baseS, p_inc_s: incS })
export const joinGame = (code: string, name: string) => rpc('online_join', { p_code: code, p_name: name })
export const getGame = (id: string) => rpc('online_get', { p_id: id })
export const sendMove = (id: string, uci: string) => rpc('online_move', { p_id: id, p_uci: uci })
export const sendFinish = (id: string, result: string, reason: string) => rpc('online_finish', { p_id: id, p_result: result, p_reason: reason })
export const resignGame = (id: string) => rpc('online_resign', { p_id: id })
export const offerDraw = (id: string) => rpc('online_offer_draw', { p_id: id })
export const declineDraw = (id: string) => rpc('online_decline_draw', { p_id: id })
export const claimFlag = (id: string) => rpc('online_flag', { p_id: id })
export const abortGame = (id: string) => rpc('online_abort', { p_id: id })

/** Мои партии: активные и последние завершённые. */
export async function listMine(uid: string): Promise<OnlineGame[]> {
  const c = await getClient()
  const { data, error } = await c.from('online_games').select('*').or(`white.eq.${uid},black.eq.${uid},creator.eq.${uid}`).order('updated_at', { ascending: false }).limit(20)
  if (error) throw error
  return (data ?? []) as OnlineGame[]
}

/** Подписка на изменения партии (Realtime). Возвращает функцию отписки. Приложение дополнительно опрашивает сервер, если события не приходят. */
export async function subscribeGame(id: string, onRow: (g: OnlineGame) => void): Promise<() => void> {
  const c = await getClient()
  const ch: RealtimeChannel = c.channel(`online-${id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'online_games', filter: `id=eq.${id}` }, p => { if (p.new && 'id' in p.new) onRow(p.new as OnlineGame) })
    .subscribe()
  return () => { void c.removeChannel(ch) }
}
