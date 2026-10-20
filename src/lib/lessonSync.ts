// Пройденные уроки автоматически попадают в репертуар «Из уроков» и считаются выученными дебютами.
import { t } from '../i18n'
import { LESSONS, lessonLine } from './lessons'
import { addLine, newRepertoire, type Repertoire } from './repertoire'
import type { OpeningsData } from './openingsStore'

// В хранилище лежат коды, а не переведённый текст: название показывается на текущем языке (см. repLabel / lineLabel).
// Прежние русские названия, сохранённые ранее, распознаются и тоже переводятся.
const LEGACY_LESSON_REP = /^Из уроков \((белые|чёрные)\)$/
const sideWord = (side: 'w' | 'b') => t(side === 'w' ? 'openings.side.white' : 'openings.side.black')

/** Код названия репертуара «Из уроков» для стороны. */
export const lessonRepCode = (side: 'w' | 'b') => `@lessons:${side}`
export const isLessonRep = (r: { name: string }) => r.name.startsWith('@lessons:') || LEGACY_LESSON_REP.test(r.name)

/** Название репертуара «Из уроков» на текущем языке. */
export const lessonRepName = (side: 'w' | 'b') => t('openings.rep.fromLessons', { side: sideWord(side).toLowerCase() })

/** Название репертуара для показа: коды переводятся, пользовательские названия остаются как есть. */
export function repLabel(r: { name: string; side: 'w' | 'b' }): string {
  if (r.name === '@lessons:w' || r.name === '@lessons:b') return lessonRepName(r.name.endsWith('w') ? 'w' : 'b')
  const m = LEGACY_LESSON_REP.exec(r.name)
  if (m) return lessonRepName(m[1] === 'белые' ? 'w' : 'b')
  if (r.name === '@side:w' || r.name === '@side:b') return sideWord(r.name.endsWith('w') ? 'w' : 'b')
  return r.name
}

/** Название линии для показа: коды («Моя линия», «Без названия», урок) переводятся. */
export function lineLabel(l: { name: string }): string {
  if (l.name === '@line:mine') return t('openings.line.mine')
  if (l.name === '@line:untitled') return t('openings.line.untitled')
  if (l.name.startsWith('@lesson:')) return LESSONS.find(x => x.id === l.name.slice(8))?.title ?? l.name
  return l.name
}

const startsWith = (a: readonly string[], b: readonly string[]) => b.length <= a.length && b.every((m, i) => a[i] === m)

/** Возвращает те же данные, если менять нечего. */
export function syncLessons(d: OpeningsData): OpeningsData {
  let repertoires = d.repertoires
  let activeId = d.activeId
  let changed = false
  for (const l of LESSONS) {
    if (!d.lessons[l.id]?.done) continue
    const name = lessonRepCode(l.side)
    let rep: Repertoire | undefined = repertoires.find(r => isLessonRep(r) && r.side === l.side)
    if (rep?.lines.some(x => x.lessons?.includes(l.id))) continue
    const moves = lessonLine(l)
    if (!rep) { rep = newRepertoire(name, l.side); repertoires = [...repertoires, rep]; }
    const res = addLine(rep, moves, `@lesson:${l.id}`)
    let next = res.rep
    // пометить линию (или линию, продолжающую урок), чтобы она считалась выученной
    next = { ...next, lines: next.lines.map(x => (startsWith(x.moves, moves) && !x.lessons?.includes(l.id) ? { ...x, lessons: [...(x.lessons ?? []), l.id] } : x)) }
    repertoires = repertoires.map(r => (r.id === rep!.id ? next : r))
    if (!repertoires.includes(next)) repertoires = [...repertoires, next]
    changed = true
  }
  if (changed) {
    // тренировка работает с активным репертуаром: если он пуст или не выбран — переключаемся на репертуар с уроками
    const cur = repertoires.find(r => r.id === activeId)
    if (!cur || cur.lines.length === 0) activeId = repertoires.find(r => isLessonRep(r) && r.lines.length > 0)?.id ?? activeId
  }
  return changed ? { ...d, repertoires, activeId } : d
}
