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

/** Быстрая игра: подбор открытого вызова с тем же контролем времени или создание своего открытого вызова. */
export const seekGame = (name: string, baseS: number, incS: number) => rpc('online_seek', { p_name: name, p_base_s: baseS, p_inc_s: incS })
export const sendEmote = (id: string, code: string) => rpc('online_emote', { p_id: id, p_code: code })
export const publishGame = (id: string, open: boolean) => rpc('online_publish', { p_id: id, p_open: open })

export type OpenChallenge = { code: string; name: string; side: Side; rating?: number; base_ms: number; inc_ms: number; created_at: string }
/** Открытые вызовы других игроков. */
export async function listOpen(): Promise<OpenChallenge[]> {
  const c = await getClient()
  const { data, error } = await c.rpc('online_open_list')
  if (error) throw error
  return (data ?? []) as OpenChallenge[]
}

/** Все завершённые партии аккаунта для статистики (до 500 последних). */
export async function listFinished(uid: string): Promise<OnlineGame[]> {
  const c = await getClient()
  const { data, error } = await c.from('online_games').select('*').eq('status', 'finished').or(`white.eq.${uid},black.eq.${uid}`).order('updated_at', { ascending: false }).limit(500)
  if (error) throw error
  return (data ?? []) as OnlineGame[]
}

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

import { diagnose, type Diagnosis } from './onlineCheck'
/** Проверка, выполнен ли на сервере актуальный docs/supabase.sql. */
export async function checkServer(): Promise<Diagnosis> {
  const c = await getClient()
  return diagnose(async (fn, args) => { const { data, error } = await c.rpc(fn, args); return { data, error } })
}

export type MyRating = { rating: number; peak: number; games: number }
/** Мой рейтинг внутри приложения (Эло, старт 1200; это не рейтинг FIDE и не Chess.com). */
export async function myRating(): Promise<MyRating> {
  const c = await getClient()
  const { data, error } = await c.rpc('online_my_rating')
  if (error) throw error
  return data as MyRating
}
