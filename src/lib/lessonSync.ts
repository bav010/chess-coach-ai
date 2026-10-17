// Пройденные уроки автоматически попадают в репертуар «Из уроков» и считаются выученными дебютами.
import { LESSONS, lessonLine } from './lessons'
import { addLine, newRepertoire, type Repertoire } from './repertoire'
import type { OpeningsData } from './openingsStore'

export const lessonRepName = (side: 'w' | 'b') => `Из уроков (${side === 'w' ? 'белые' : 'чёрные'})`

const startsWith = (a: readonly string[], b: readonly string[]) => b.length <= a.length && b.every((m, i) => a[i] === m)

/** Возвращает те же данные, если менять нечего. */
export function syncLessons(d: OpeningsData): OpeningsData {
  let repertoires = d.repertoires
  let activeId = d.activeId
  let changed = false
  for (const l of LESSONS) {
    if (!d.lessons[l.id]?.done) continue
    const name = lessonRepName(l.side)
    let rep: Repertoire | undefined = repertoires.find(r => r.name === name && r.side === l.side)
    if (rep?.lines.some(x => x.lessons?.includes(l.id))) continue
    const moves = lessonLine(l)
    if (!rep) { rep = newRepertoire(name, l.side); repertoires = [...repertoires, rep]; }
    const res = addLine(rep, moves, l.title)
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
    if (!cur || cur.lines.length === 0) activeId = repertoires.find(r => r.name.startsWith('Из уроков') && r.lines.length > 0)?.id ?? activeId
  }
  return changed ? { ...d, repertoires, activeId } : d
}
