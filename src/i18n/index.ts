// Единый механизм локализации. Все тексты интерфейса лежат в словарях src/i18n/en/* и src/i18n/ru/*.
// t('area.key', {param}) — перевод на текущий язык; если перевода нет — английский, если и его нет — сам ключ.
// Язык хранится в localStorage (общий для всех аккаунтов на устройстве) и меняется без перезагрузки страницы.
// Шахматная нотация (SAN/UCI/PGN, FEN) и технические идентификаторы не переводятся.
import { useSyncExternalStore } from 'react'
import { en as enApp } from './en/app'
import { en as enPlay } from './en/play'
import { en as enAnalysis } from './en/analysis'
import { en as enPuzzles } from './en/puzzles'
import { en as enOpenings } from './en/openings'
import { en as enStats } from './en/stats'
import { en as enHome } from './en/home'
import { en as enSettings } from './en/settings'
import { en as enHelp } from './en/help'
import { en as enPalette } from './en/palette'
import { ru as ruApp } from './ru/app'
import { ru as ruPlay } from './ru/play'
import { ru as ruAnalysis } from './ru/analysis'
import { ru as ruPuzzles } from './ru/puzzles'
import { ru as ruOpenings } from './ru/openings'
import { ru as ruStats } from './ru/stats'
import { ru as ruHome } from './ru/home'
import { ru as ruSettings } from './ru/settings'
import { ru as ruHelp } from './ru/help'
import { ru as ruPalette } from './ru/palette'

export type Lang = 'en' | 'ru'
export const LANGS: readonly Lang[] = ['en', 'ru']
export const LANG_NAMES: Record<Lang, string> = { en: 'English', ru: 'Русский' }
export const DEFAULT_LANG: Lang = 'en'
export const LANG_KEY = 'chess-coach-ai:lang:v1'

export const EN = { ...enApp, ...enPlay, ...enAnalysis, ...enPuzzles, ...enOpenings, ...enStats, ...enHome, ...enSettings, ...enHelp, ...enPalette }
export type Key = keyof typeof EN
type Dict = Record<string, string>
const DICTS: Record<Lang, Dict> = {
  en: EN,
  ru: { ...ruApp, ...ruPlay, ...ruAnalysis, ...ruPuzzles, ...ruOpenings, ...ruStats, ...ruHome, ...ruSettings, ...ruHelp, ...ruPalette },
}
/** Для тестов: словари целиком. */
export const dictionaries = DICTS

export type Params = Record<string, string | number>
/** Базовые ключи множественных форм: «foo» для foo_one / foo_other. */
export type PluralKey = Key extends infer K ? (K extends `${infer B}_other` ? B : never) : never

export function isLang(v: unknown): v is Lang { return v === 'en' || v === 'ru' }

function readStored(): Lang {
  try { const v = typeof localStorage === 'undefined' ? null : localStorage.getItem(LANG_KEY); if (isLang(v)) return v } catch { /* хранилище недоступно */ }
  return DEFAULT_LANG
}

let current: Lang = readStored()
const listeners = new Set<() => void>()
const applyDom = () => { try { if (typeof document !== 'undefined') document.documentElement.lang = current } catch { /* ничего */ } }
applyDom()

export const getLang = (): Lang => current
export function setLang(l: Lang) {
  if (!isLang(l) || l === current) return
  current = l
  try { localStorage.setItem(LANG_KEY, l) } catch { /* ничего */ }
  applyDom()
  listeners.forEach(f => f())
}
const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f) } }

function fill(s: string, p?: Params): string {
  return p ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in p ? String(p[k]) : m)) : s
}
const warned = new Set<string>()
function lookup(key: string, lang: Lang): string {
  const v = DICTS[lang][key] ?? DICTS.en[key]
  if (v !== undefined) return v
  if (!warned.has(key)) { warned.add(key); try { console.warn(`[i18n] missing key: ${key}`) } catch { /* ничего */ } }
  return key
}

/** Перевод по ключу на текущий язык. Подходит и для кода вне React (читает язык в момент вызова). */
export function t(key: Key, params?: Params): string { return fill(lookup(key, current), params) }

/** Перевод со множественным числом: ключи base_one / base_few / base_many / base_other (n подставляется как {n}). */
export function tn(base: PluralKey, n: number, params?: Params): string {
  let cat = 'other'
  try { cat = new Intl.PluralRules(current).select(n) } catch { /* ничего */ }
  const d = DICTS[current]
  const k = d[`${base}_${cat}`] !== undefined ? `${base}_${cat}` : `${base}_other`
  return fill(lookup(k, current), { n, ...params })
}

/** Код локали для чисел и дат. */
export const locale = (): string => (current === 'ru' ? 'ru-RU' : 'en-US')
export const fmtDateTime = (ms: number, o: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) => new Date(ms).toLocaleString(locale(), o)
export const fmtDate = (ms: number, o: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' }) => new Date(ms).toLocaleDateString(locale(), o)
export const fmtNum = (n: number, o?: Intl.NumberFormatOptions) => n.toLocaleString(locale(), o)

/**
 * Хук для компонентов: подписывает на смену языка (компонент перерисуется без потери состояния)
 * и возвращает t / tn. Любой компонент, показывающий текст, должен вызывать useI18n().
 * Значения в useMemo/useEffect, зависящие от переведённых строк, должны включать lang в зависимости.
 */
export function useI18n() {
  const lang = useSyncExternalStore(subscribe, getLang, getLang)
  return { lang, t, tn, setLang, locale: locale() }
}
