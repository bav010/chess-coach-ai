import { describe, it, expect, beforeEach, vi } from 'vitest'
import { dictionaries, DEFAULT_LANG, LANG_KEY, getLang, setLang, t, tn, type Key } from './index'

const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',')

describe('локализация: словари', () => {
  const en = dictionaries.en, ru = dictionaries.ru
  it('в русском есть все ключи английского и наоборот (кроме форм множественного числа)', () => {
    const base = (k: string) => k.replace(/_(one|few|many|other)$/, '')
    const missingRu = Object.keys(en).filter(k => !(k in ru))
    expect(missingRu).toEqual([])
    const enBases = new Set(Object.keys(en).map(base))
    expect(Object.keys(ru).filter(k => !enBases.has(base(k)))).toEqual([])
  })
  it('нет пустых строк, а подстановки {…} совпадают в обоих языках', () => {
    for (const [k, v] of Object.entries(en)) {
      expect(v.trim(), k).not.toBe('')
      if (ru[k] !== undefined) expect(ph(ru[k]), `placeholders ${k}`).toBe(ph(v))
    }
    for (const [k, v] of Object.entries(ru)) expect(v.trim(), k).not.toBe('')
  })
  it('в английском нет кириллицы', () => {
    for (const [k, v] of Object.entries(en)) expect(/[А-Яа-яЁё]/.test(v), k).toBe(false)
  })
})

describe('локализация: механизм', () => {
  beforeEach(() => {
    const store: Record<string, string> = {}
    vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v }, removeItem: (k: string) => { delete store[k] } })
    setLang('en')
  })
  it('по умолчанию английский', () => { expect(DEFAULT_LANG).toBe('en') })
  it('смена языка меняет тексты и сохраняется', () => {
    expect(t('app.mode.play')).toBe('Play vs bot')
    setLang('ru')
    expect(getLang()).toBe('ru')
    expect(t('app.mode.play')).toBe('Игра с ботом')
    expect(localStorage.getItem(LANG_KEY)).toBe('ru')
  })
  it('подставляет параметры', () => { expect(t('app.account.aria', { name: 'Anna' })).toBe('Account: Anna') })
  it('безопасный fallback: нет ключа — возвращается сам ключ, не падает', () => {
    expect(t('no.such.key' as Key)).toBe('no.such.key')
  })
  it('нет русского перевода — берётся английский', () => {
    dictionaries.en['test.only.en'] = 'Only English'
    expect(t('test.only.en' as Key)).toBe('Only English')
    setLang('ru')
    expect(t('test.only.en' as Key)).toBe('Only English')
    delete dictionaries.en['test.only.en']
  })
  it('множественное число: английский one/other, русский one/few/many', () => {
    dictionaries.en['test.g_one'] = '{n} game'; dictionaries.en['test.g_other'] = '{n} games'
    dictionaries.ru['test.g_one'] = '{n} партия'; dictionaries.ru['test.g_few'] = '{n} партии'; dictionaries.ru['test.g_many'] = '{n} партий'; dictionaries.ru['test.g_other'] = '{n} партии'
    expect(tn('test.g' as never, 1)).toBe('1 game'); expect(tn('test.g' as never, 5)).toBe('5 games')
    setLang('ru')
    expect(tn('test.g' as never, 1)).toBe('1 партия'); expect(tn('test.g' as never, 3)).toBe('3 партии'); expect(tn('test.g' as never, 5)).toBe('5 партий'); expect(tn('test.g' as never, 21)).toBe('21 партия')
    for (const k of ['test.g_one', 'test.g_other']) delete dictionaries.en[k]
    for (const k of ['test.g_one', 'test.g_few', 'test.g_many', 'test.g_other']) delete dictionaries.ru[k]
  })
})
