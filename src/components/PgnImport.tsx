import { useState } from 'react'
import { parsePgn, type ParsedPgn } from '../lib/pgn'

type Props = { onLoad: (p: ParsedPgn) => void }

/** Загрузка партии из PGN: вставка текста или файл .pgn. */
export default function PgnImport({ onLoad }: Props) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  function load(source: string) {
    try {
      onLoad(parsePgn(source))
      setError(null)
      setText('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось прочитать PGN')
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    const content = await file.text()
    setText(content)
    load(content)
  }

  return <div className="pgn-import" data-testid="pgn-import">
    <textarea value={text} onChange={e => setText(e.target.value)} rows={5} placeholder="Вставьте PGN партии…" aria-label="PGN" />
    <div className="board-actions">
      <button className="btn primary" onClick={() => load(text)}>Загрузить партию</button>
      <label className="btn file-btn">Выбрать файл .pgn
        <input type="file" accept=".pgn,.txt,text/plain" hidden onChange={e => { void onFile(e.target.files?.[0]); e.target.value = '' }} />
      </label>
    </div>
    {error && <p className="error-text" role="alert">{error}</p>}
  </div>
}
