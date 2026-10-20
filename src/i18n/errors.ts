// Ошибки с ключом перевода: текст строится заново при показе, поэтому смена языка обновляет и уже сохранённую в состоянии ошибку.
import { t, type Key, type Params } from './index'

export class LocalizedError extends Error {
  readonly key: Key
  readonly params?: Params
  constructor(key: Key, params?: Params) {
    super(t(key, params))
    this.key = key
    this.params = params
  }
}

/** Текст ошибки на текущем языке; для чужих ошибок — их сообщение, иначе запасной ключ. */
export function errorText(e: unknown, fallback: Key): string {
  if (e instanceof LocalizedError) return t(e.key, e.params)
  if (e instanceof Error && e.message) return e.message
  return t(fallback)
}

/** Сообщение, которое хранится как данные (ключ+параметры) и переводится при показе — смена языка обновляет его на экране. */
export type Msg = { key: Key; params?: Params; raw?: undefined } | { raw: string; key?: undefined; params?: undefined }
export const msgText = (m: Msg | null | undefined): string => (!m ? '' : m.raw !== undefined ? m.raw : t(m.key, m.params))
