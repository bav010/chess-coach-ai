import { useMemo, useState } from 'react'
import { Chess, type Color, type Square } from 'chess.js'
import { puzzleEngine } from '../engine'
import Board, { type ArrowSpec } from './Board'
import PromoPicker from './PromoPicker'
import { useBoardInput } from '../hooks/useBoardInput'
import { chessAtPly, splitUci } from '../lib/game'
import { formatScore, toWhite } from '../lib/eval'
import { continuations, openingAt, sanRows, searchOpenings, type Catalog, type Opening } from '../lib/openings'
import { ruName } from '../lib/openingNames'
import { addLine, newRepertoire, posKey, removeLine, repMovesAt, setNote, updateLine, type Repertoire } from '../lib/repertoire'
import { pvToSan, uciToSan } from '../lib/san'
import type { OpeningsData } from '../lib/openingsStore'

type Props = {
  catalog: Catalog | null
  data: OpeningsData
  update: (fn: (d: OpeningsData) => OpeningsData) => void
}

type Tab = 'catalog' | 'next' | 'rep'
type EngineLine = { san: string; score: string }

const START = new Chess().fen()

/** Изучение дебютов: каталог, дерево вариантов, доска и редактор репертуара. */
export default function OpeningsStudy({ catalog, data, update }: Props) {
  const [path, setPath] = useState<string[]>([])
  const [cursor, setCursor] = useState(0)
  const [orientation, setOrientation] = useState<Color>('w')
  const [tab, setTab] = useState<Tab>('catalog')
  const [query, setQuery] = useState('')
  const [eco, setEco] = useState<string | null>(null)
  const [limit, setLimit] = useState(40)
  const [engine, setEngine] = useState<EngineLine[] | 'loading' | 'error' | null>(null)
  const [lineName, setLineName] = useState('')
  const [info, setInfo] = useState('')
  const [newName, setNewName] = useState('')
  const [newSide, setNewSide] = useState<Color>('w')
  const [title, setTitle] = useState('')
  const [showAhead, setShowAhead] = useState(true)

  const shown = useMemo(() => path.slice(0, cursor), [path, cursor])
  const chess = useMemo(() => chessAtPly(START, shown, shown.length), [shown])
  const fen = chess.fen()
  const rep = data.repertoires.find(r => r.id === data.activeId) ?? null

  const input = useBoardInput(chess, chess.turn(), play)

  function play(uci: string) {
    const next = [...shown, uci]
    setPath(next); setCursor(next.length); setEngine(null); setInfo(''); setTitle('')
  }
  /** Загружает линию на доску с начала: стрелки с номерами показывают все её ходы по порядку. */
  function load(moves: string[], name = '') { setPath(moves); setCursor(0); setEngine(null); setInfo(''); setTitle(name); input.clear() }
  function goto(i: number) { setCursor(Math.max(0, Math.min(path.length, i))); setEngine(null); input.clear() }

  const found = catalog ? openingAt(catalog.root, shown) : null
  const conts = useMemo(() => (catalog ? continuations(catalog.root, shown) : []), [catalog, shown])
  const rows = useMemo(() => sanRows(START, path), [path])
  const search = useMemo(() => (catalog ? searchOpenings(catalog.list, { query, eco, limit }) : { items: [] as Opening[], total: 0 }), [catalog, query, eco, limit])
  const repMoves = rep ? repMovesAt(rep, shown) : []
  const note = rep ? rep.notes[posKey(fen)] ?? '' : ''
  // стрелки с номерами: ближайшие ходы линии по порядку (светлые — ходы белых, оранжевые — чёрных)
  const aheadArrows = useMemo<ArrowSpec[]>(() => {
    if (!showAhead) return []
    const c = new Chess(fen)
    const out: ArrowSpec[] = []
    for (const [i, u] of path.slice(cursor, cursor + 6).entries()) {
      const { from, to } = splitUci(u)
      out.push({ from: from as Square, to: to as Square, rank: i, label: String(i + 1), color: c.turn() === 'w' ? '#d3ff72' : '#ffb066' })
      try { c.move(splitUci(u)) } catch { break }
    }
    return out
  }, [fen, path, cursor, showAhead])
  const last = shown.length ? splitUci(shown[shown.length - 1]) : null

  async function askEngine() {
    setEngine('loading')
    try {
      await puzzleEngine.start()
      const a = await puzzleEngine.analyse(fen, { depth: 14, movetime: 1500, multipv: 3 })
      setEngine(a.lines.map(l => ({ san: pvToSan(fen, l.pv, 4).join(' '), score: formatScore(toWhite({ cp: l.cp, mate: l.mate }, chess.turn())) })))
    } catch { setEngine('error') }
  }

  function withRep(fn: (r: Repertoire) => Repertoire) {
    update(d => ({ ...d, repertoires: d.repertoires.map(r => (r.id === d.activeId ? fn(r) : r)) }))
  }

  function addCurrent() {
    if (!rep || path.length === 0) return
    const name = lineName.trim() || (title ? title.replace(/^[A-E]\d\d · /, '').replace(/ — .*$/, '') : found ? ruName(found.opening.name) : 'Моя линия')
    const res = addLine(rep, path, name)
    if (res.status === 'exists') { setInfo('Эта линия уже есть в репертуаре.'); return }
    if (res.status === 'invalid') { setInfo('Линию не удалось добавить.'); return }
    withRep(() => res.rep)
    setLineName('')
    setInfo(res.status === 'extended' ? 'Линия продолжена в репертуаре.' : `Линия добавлена в «${rep.name}».`)
  }

  function createRep() {
    const r = newRepertoire(newName.trim() || (newSide === 'w' ? 'Белые' : 'Чёрные'), newSide)
    update(d => ({ ...d, repertoires: [...d.repertoires, r], activeId: r.id }))
    setNewName(''); setOrientation(newSide)
  }

  function deleteRep() {
    if (!rep || !window.confirm(`Удалить репертуар «${rep.name}» и прогресс его повторений?`)) return
    update(d => {
      const cards = { ...d.cards }
      for (const k of Object.keys(cards)) if (k.startsWith(`${rep.id}|`)) delete cards[k]
      const rest = d.repertoires.filter(r => r.id !== rep.id)
      return { ...d, repertoires: rest, cards, activeId: rest[0]?.id ?? null }
    })
  }

  const sanOf = (uci: string) => uciToSan(fen, uci) ?? uci

  return <div className="main-grid" data-testid="openings-study">
    <section className="panel board-panel" data-testid="study-board">
      <div className="panel-head">
        <div><div className="eyebrow">ДЕБЮТЫ</div><h2>Изучение дебютов</h2></div>
        <span className="pill" data-testid="opening-name">{found ? `${found.opening.eco} · ${ruName(found.opening.name)}${found.exact ? '' : ' …'}` : shown.length ? 'вне каталога' : 'начальная позиция'}</span>
      </div>
      {title && <p className="line-title-bar" data-testid="line-title">{title}</p>}
      <div className="board-wrap">
        <Board chess={chess} orientation={orientation} selected={input.selected} legal={input.legal} lastMove={last ? { from: last.from as Square, to: last.to as Square } : null}
          arrows={aheadArrows} onSquareClick={input.onSquare} />
      </div>
      {aheadArrows.length > 0 && <p className="tiny" data-testid="arrow-legend">Стрелки с номерами — следующие ходы линии по порядку: <b style={{ color: '#d3ff72' }}>светлые — белые</b>, <b style={{ color: '#ffb066' }}>оранжевые — чёрные</b>. Нажимайте ▶, чтобы идти по ходам.</p>}
      {input.promo && <PromoPicker color={chess.turn()} onPick={input.pickPromo} onCancel={input.cancelPromo} />}

      <div className="line-moves" data-testid="line-moves">
        {rows.length === 0 && <span className="tiny">Сделайте ход на доске, выберите дебют в каталоге или продолжение справа.</span>}
        {rows.map(r => <span key={r.no} className="line-row">
          <i>{r.no}.</i>
          {r.white !== undefined && <button className={`line-move ${r.wi! + 1 === cursor ? 'active' : ''}`} onClick={() => goto(r.wi! + 1)}>{r.white}</button>}
          {r.black !== undefined && <button className={`line-move ${r.bi! + 1 === cursor ? 'active' : ''}`} onClick={() => goto(r.bi! + 1)}>{r.black}</button>}
        </span>)}
      </div>

      <div className="nav-row">
        <button className="btn" onClick={() => goto(0)} disabled={cursor === 0} aria-label="В начало">⏮</button>
        <button className="btn" onClick={() => goto(cursor - 1)} disabled={cursor === 0} aria-label="Назад" data-testid="study-prev">◀</button>
        <button className="btn" onClick={() => goto(cursor + 1)} disabled={cursor >= path.length} aria-label="Вперёд" data-testid="study-next">▶</button>
        <button className="btn" onClick={() => goto(path.length)} disabled={cursor >= path.length} aria-label="В конец">⏭</button>
        <button className="btn" onClick={() => setOrientation(o => (o === 'w' ? 'b' : 'w'))} data-testid="study-flip">⇅ Перевернуть</button>
        <label className="chip"><input type="checkbox" checked={showAhead} onChange={e => setShowAhead(e.target.checked)} data-testid="ahead-toggle" /> Стрелки ходов</label>
        <button className="btn" onClick={() => load([])} disabled={path.length === 0} data-testid="study-reset">Сбросить</button>
      </div>
      <div className="chip-group" style={{ marginTop: 10 }}><small>СМОТРЮ ЗА</small>
        {(['w', 'b'] as const).map(c => <button key={c} className={`chip ${orientation === c ? 'active' : ''}`} onClick={() => setOrientation(c)} data-testid={`side-${c}`}>{c === 'w' ? 'Белых' : 'Чёрных'}</button>)}
      </div>
      {rep && repMoves.length > 0 && <p className="rep-here" data-testid="rep-here">В репертуаре «{rep.name}» отсюда: <b>{repMoves.map(sanOf).join(', ')}</b></p>}
      {note && <p className="rep-note" data-testid="pos-note-view">📝 {note}</p>}
      {info && <p className="tiny" data-testid="study-info">{info}</p>}
    </section>

    <aside className="right-column">
      <div className="tabs" role="tablist">
        {([['catalog', 'Каталог'], ['next', 'Продолжения'], ['rep', 'Репертуар']] as const).map(([k, label]) =>
          <button key={k} role="tab" className={`tab ${tab === k ? 'active' : ''}`} aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`otab-${k}`}>{label}</button>)}
      </div>

      {tab === 'catalog' && <section className="panel" data-testid="catalog-panel">
        <div className="panel-head"><div><div className="eyebrow">КАТАЛОГ</div><h2>Дебюты и коды ECO</h2></div><span className="pill">{catalog ? `${search.total} из ${catalog.list.length}` : 'загрузка…'}</span></div>
        <input className="search" value={query} onChange={e => { setQuery(e.target.value); setLimit(40) }} placeholder="Поиск: Сицилианская, Najdorf, C60…" aria-label="Поиск дебюта" data-testid="catalog-search" />
        <div className="chips" style={{ margin: '10px 0' }}>
          <button className={`chip ${eco === null ? 'active' : ''}`} onClick={() => { setEco(null); setLimit(40) }}>Все</button>
          {['A', 'B', 'C', 'D', 'E'].map(l => <button key={l} className={`chip ${eco === l ? 'active' : ''}`} onClick={() => { setEco(l); setLimit(40) }} data-testid={`eco-${l}`}>{l}</button>)}
        </div>
        <ul className="opening-list" data-testid="opening-list">
          {search.items.map((o, i) => <li key={`${o.eco}${o.name}${i}`}>
            <button className="opening-item" onClick={() => load(o.moves, `${o.eco} · ${ruName(o.name)} — ${Math.ceil(o.moves.length / 2)} х.`)} title={o.name}>
              <span className="eco">{o.eco}</span><span className="oname">{ruName(o.name)}</span><span className="olen">{Math.ceil(o.moves.length / 2)} х.</span>
            </button>
          </li>)}
        </ul>
        {catalog && search.total > search.items.length && <button className="btn full" onClick={() => setLimit(l => l + 60)}>Показать ещё ({search.total - search.items.length})</button>}
        <p className="tiny">Источник: lichess-org/chess-openings (CC0). Названия семейств переведены, варианты — как в каталоге.</p>
      </section>}

      {tab === 'next' && <section className="panel" data-testid="next-panel">
        <div className="panel-head"><div><div className="eyebrow">ДЕРЕВО ВАРИАНТОВ</div><h2>Продолжения</h2></div><span className="pill">{conts.length} вар.</span></div>
        {conts.length === 0
          ? <p className="muted">{catalog ? 'Дальше линий каталога нет — продолжайте ходить на доске сами.' : 'Каталог загружается…'}</p>
          : <ul className="cont-list" data-testid="cont-list">
            {conts.map(c => <li key={c.uci}>
              <button className={`cont-item ${c.recommended ? 'rec' : ''}`} onClick={() => play(c.uci)} data-testid={c.recommended ? 'cont-rec' : 'cont-item'}>
                <b>{sanOf(c.uci)}</b>{c.recommended && <em>★ рекомендуется</em>}
                {repMoves.includes(c.uci) && <em className="inrep">в репертуаре</em>}
                <span>{c.opening ? ruName(c.opening.name) : 'продолжение линии'}</span><small>{c.lines} лин.</small>
              </button>
            </li>)}
          </ul>}
        <p className="tiny">★ — самое разработанное продолжение в каталоге (в нём больше всего названных линий). Это справка по каталогу, а не оценка силы хода.</p>
        <div className="engine-box">
          <b>Оценка Stockfish — отдельно от каталога</b>
          <button className="btn" onClick={() => void askEngine()} disabled={engine === 'loading'} data-testid="ask-engine">{engine === 'loading' ? 'Считаю…' : 'Спросить Stockfish'}</button>
          {engine === 'error' && <p className="error-text">Движок недоступен.</p>}
          {Array.isArray(engine) && <ul className="engine-lines" data-testid="engine-lines">{engine.map((l, i) => <li key={i}><b>{l.score}</b> {l.san}</li>)}</ul>}
          {Array.isArray(engine) && <p className="tiny">Оценка для белых, глубина 14.</p>}
        </div>
      </section>}

      {tab === 'rep' && <section className="panel" data-testid="rep-panel">
        <div className="panel-head"><div><div className="eyebrow">МОЙ РЕПЕРТУАР</div><h2>Репертуар</h2></div>{rep && <span className="pill">{rep.side === 'w' ? 'за белых' : 'за чёрных'} · {rep.lines.length} лин.</span>}</div>
        <div className="rep-select">
          {data.repertoires.length > 0 && <select value={data.activeId ?? ''} onChange={e => { update(d => ({ ...d, activeId: e.target.value })); const r = data.repertoires.find(x => x.id === e.target.value); if (r) setOrientation(r.side) }} aria-label="Репертуар" data-testid="rep-select">
            {data.repertoires.map(r => <option key={r.id} value={r.id}>{r.name} ({r.side === 'w' ? 'белые' : 'чёрные'})</option>)}
          </select>}
          {rep && <button className="btn" onClick={deleteRep} data-testid="rep-delete">Удалить репертуар</button>}
        </div>
        <div className="rep-new">
          <input className="search" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Название нового репертуара" aria-label="Название репертуара" data-testid="rep-new-name" />
          <div className="chips">
            {(['w', 'b'] as const).map(c => <button key={c} className={`chip ${newSide === c ? 'active' : ''}`} onClick={() => setNewSide(c)} data-testid={`rep-new-${c}`}>{c === 'w' ? 'За белых' : 'За чёрных'}</button>)}
            <button className="btn primary" onClick={createRep} data-testid="rep-create">＋ Создать</button>
          </div>
        </div>

        <div className="help-box" data-testid="rep-help"><b>Что такое репертуар?</b> Это ваш личный набор дебютных линий — тех, которые вы хотите помнить: например, «мои белые» или «мои чёрные против 1.e4». Откройте линию из каталога или сыграйте её на доске → «Добавить текущую линию». Потом на вкладке «Тренировка» программа покажет позицию из репертуара, а вы вспоминаете свой ход. Ошибки повторяются чаще. Если вам нужно просто выучить дебют с объяснениями — начните с вкладки «Уроки».</div>
        {!rep && <p className="muted">Создайте репертуар за белых или за чёрных, затем добавляйте в него линии с доски.</p>}
        {rep && <>
          <div className="rep-add">
            <input className="search" value={lineName} onChange={e => setLineName(e.target.value)} placeholder={found ? ruName(found.opening.name) : 'Название линии'} aria-label="Название линии" data-testid="line-name" />
            <button className="btn primary" onClick={addCurrent} disabled={path.length === 0} data-testid="add-line">Добавить линию на доске ({path.length} п.)</button>
          </div>
          <label className="note-label">Заметка к этой позиции
            <textarea rows={3} value={note} onChange={e => withRep(r => setNote(r, posKey(fen), e.target.value))} placeholder="Идея, план, ловушка…" data-testid="pos-note" />
          </label>
          <ul className="rep-lines" data-testid="rep-lines">
            {rep.lines.length === 0 && <li className="muted">В репертуаре пока нет линий.</li>}
            {rep.lines.map(l => <li key={l.id} data-testid="rep-line">
              <input className="line-title" value={l.name} onChange={e => withRep(r => updateLine(r, l.id, { name: e.target.value }))} aria-label="Название линии" />
              <code>{sanRows(START, l.moves).map(r => `${r.no}.${r.white ?? '…'}${r.black ? ` ${r.black}` : ''}`).join(' ')}</code>
              <textarea rows={2} value={l.note} onChange={e => withRep(r => updateLine(r, l.id, { note: e.target.value }))} placeholder="Заметка к линии" aria-label="Заметка к линии" />
              <div className="board-actions">
                <button className="btn" onClick={() => load(l.moves, l.name)} data-testid="rep-open">Открыть на доске</button>
                <button className="btn" onClick={() => withRep(r => removeLine(r, l.id))} data-testid="rep-remove">Удалить</button>
              </div>
            </li>)}
          </ul>
        </>}
      </section>}
    </aside>
  </div>
}
