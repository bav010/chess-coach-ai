import { CLASS_LABEL, CLASS_MARK, type MoveClass } from '../lib/classify'

type Props = { cls: MoveClass; className?: string }

/** Значок оценки хода: цветной кружок с символом (как в разборе партий на популярных шахматных сайтах). */
export default function MoveMark({ cls, className = '' }: Props) {
  return <span className={`mark mark-${cls} ${className}`} title={CLASS_LABEL[cls]} role="img" aria-label={CLASS_LABEL[cls]} data-cls={cls}>
    {CLASS_MARK[cls]}
  </span>
}
