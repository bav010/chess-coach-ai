// Самопроверка серверной части онлайна: приложение вызывает несколько функций Supabase и по ответам понимает,
// выполнен ли актуальный docs/supabase.sql. Ничего не создаёт и не меняет.
export const SERVER_VERSION = 3
export type RpcResult = { data: unknown; error: { code?: string; message?: string } | null }
export type RpcFn = (fn: string, args: Record<string, unknown>) => Promise<RpcResult>
/** ok — всё на месте; outdated — онлайн настроен, но SQL старее приложения; missing — онлайн-части SQL нет; error — сервер не ответил. */
export type Diagnosis = { status: 'ok' | 'outdated' | 'missing' | 'error'; version: number | null; missing: string[] }

const ZERO = '00000000-0000-0000-0000-000000000000'
/** Функция не найдена в базе (а не «нашлась, но вернула ошибку»). */
export const isMissingFn = (e: { code?: string; message?: string } | null): boolean =>
  !!e && (e.code === 'PGRST202' || e.code === '42883' || /could not find the function|function .* does not exist/i.test(e.message ?? ''))

export async function diagnose(rpc: RpcFn): Promise<Diagnosis> {
  const calls: [string, Record<string, unknown>][] = [['online_version', {}], ['online_my_rating', {}], ['online_open_list', {}], ['online_get', { p_id: ZERO }]]
  const missing: string[] = []
  let version: number | null = null
  try {
    for (const [fn, args] of calls) {
      const r = await rpc(fn, args)
      if (isMissingFn(r.error)) missing.push(fn)
      else if (fn === 'online_version' && !r.error && typeof r.data === 'number') version = r.data
      else if (r.error && !r.error.code && !r.error.message) throw new Error('empty error')
    }
  } catch { return { status: 'error', version, missing } }
  // нет даже базовой функции — онлайн-часть SQL не выполнялась; нет только online_version/новых — SQL устарел
  if (missing.includes('online_get')) return { status: 'missing', version, missing }
  if (missing.length > 0 || version === null || version < SERVER_VERSION) return { status: 'outdated', version, missing }
  return { status: 'ok', version, missing }
}
