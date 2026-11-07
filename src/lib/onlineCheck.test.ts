import { describe, expect, it } from 'vitest'
import { diagnose, isMissingFn, SERVER_VERSION, type RpcFn } from './onlineCheck'

const notFound = { code: 'PGRST202', message: 'Could not find the function public.x in the schema cache' }
const fake = (missing: string[], version: unknown = SERVER_VERSION, getErr: { code?: string; message?: string } | null = { message: 'not_found' }): RpcFn => async (fn) => {
  if (missing.includes(fn)) return { data: null, error: notFound }
  if (fn === 'online_version') return { data: version, error: null }
  if (fn === 'online_get') return { data: null, error: getErr }
  return { data: [], error: null }
}

describe('diagnose', () => {
  it('ok: все функции есть и версия актуальна (online_get вернул not_found — значит функция работает)', async () => {
    expect(await diagnose(fake([]))).toEqual({ status: 'ok', version: SERVER_VERSION, missing: [] })
  })
  it('outdated: нет online_version (SQL выполнялся до обновления)', async () => {
    const d = await diagnose(fake(['online_version']))
    expect(d.status).toBe('outdated'); expect(d.missing).toEqual(['online_version'])
  })
  it('outdated: версия ниже ожидаемой', async () => { expect((await diagnose(fake([], 2))).status).toBe('outdated') })
  it('missing: онлайн-части SQL нет совсем', async () => {
    expect((await diagnose(fake(['online_version', 'online_my_rating', 'online_open_list', 'online_get']))).status).toBe('missing')
  })
  it('error: сервер не ответил', async () => {
    expect((await diagnose(async () => { throw new Error('network') })).status).toBe('error')
  })
  it('isMissingFn различает «функции нет» и «функция вернула ошибку»', () => {
    expect(isMissingFn(notFound)).toBe(true)
    expect(isMissingFn({ code: '42883', message: 'function public.x(uuid) does not exist' })).toBe(true)
    expect(isMissingFn({ message: 'not_found' })).toBe(false)
    expect(isMissingFn(null)).toBe(false)
  })
})
