import { useState } from 'react'
import { parsePgn, type ParsedPgn } from '../lib/pgn'
import { useI18n } from '../i18n'
import { errorText } from '../i18n/errors'

type Props = { onLoad: (p: ParsedPgn) => void }

/** Загрузка партии из PGN: вставка текста или файл .pgn. */
export default function PgnImport({ onLoad }: Props) {
  const [text, setText] = useState('')
  const { t } = useI18n()
  // ошибка хранится как объект и переводится при показе, чтобы следовать за языком
  const [error, setError] = useState<{ e: unknown } | null>(null)

  function load(source: string) {
    try {
      onLoad(parsePgn(source))
      setError(null)
      setText('')
    } catch (e) {
      setError({ e })
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    const content = await file.text()
    setText(content)
    load(content)
  }

  return <div className="pgn-import" data-testid="pgn-import">
    <textarea value={text} onChange={e => setText(e.target.value)} rows={5} placeholder={t('analysis.pgn.placeholder')} aria-label="PGN" />
    <div className="board-actions">
      <button className="btn primary" onClick={() => load(text)}>{t('analysis.pgn.load')}</button>
      <label className="btn file-btn">{t('analysis.pgn.file')}
        <input type="file" accept=".pgn,.txt,text/plain" hidden onChange={e => { void onFile(e.target.files?.[0]); e.target.value = '' }} />
      </label>
    </div>
    {error && <p className="error-text" role="alert">{errorText(error.e, 'analysis.pgn.failed')}</p>}
  </div>
}
