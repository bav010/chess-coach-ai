import { CLASS_LABEL, CLASS_MARK, type MoveClass } from '../lib/classify'

type Props = { cls: MoveClass; className?: string }

// Контуры значков (Material Icons, Apache-2.0), viewBox 24×24
const PATHS: Partial<Record<MoveClass, string>> = {
  best: 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
  excellent: 'M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z',
  good: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
  book: 'M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z',
  miss: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
}

/** Значок оценки хода: цветной кружок с символом или рисунком (как в разборах партий на популярных шахматных сайтах). */
export default function MoveMark({ cls, className = '' }: Props) {
  const path = PATHS[cls]
  return <span className={`mark mark-${cls} ${className}`} title={CLASS_LABEL[cls]} role="img" aria-label={CLASS_LABEL[cls]} data-cls={cls}>
    {path
      ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d={path} fill="currentColor" /></svg>
      : <span className="mark-text">{CLASS_MARK[cls]}</span>}
  </span>
}
