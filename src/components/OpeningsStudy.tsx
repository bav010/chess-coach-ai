import { useMemo, useState } from 'react'
import { Chess, type Color, type Square } from 'chess.js'
import { puzzleEngine } from '../engine'
import Board, { type ArrowSpec } from './Board'
import PromoPicker from './PromoPicker'
import { useBoardInput } from '../hooks/useBoardInput'
import { chessAtPly, splitUci } from '../lib/game'
import { formatScore, toWhite } from '../lib/eval'
import { continuations, openingAt, sanRows, searchOpenings, type Catalog, type Opening } from '../lib/openings'
import { useI18n, type Key, type Params } from '../i18n'
import { lineLabel, repLabel } from '../lib/lessonSync'
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
/** Информационное сообщение хранится ключом, чтобы переводиться при смене языка. */
type Info = { key: Key; p?: Params } | null
/** Заголовок загруженной линии: из каталога (код ECO + оригинальное название) или линия репертуара. */
type Title = { eco: string; name: string; plies: number } | { rep: string } | null
type EngineLine = { san: string; score: string }

const START = new Chess().fen()

// Названия дебютов в каталоге — английские; для русского языка семейства переводятся (openingNames.ts).


/** Изучение дебютов: каталог, дерево вариантов, доска и редактор репертуара. */
export default function OpeningsStudy({ catalog, data, update }: Props) {
  const { t, tn, lang } = useI18n()
  const [path, setPath] = useState<string[]>([])
  const [cursor, setCursor] = useState(0)
  const [orientation, setOrientation] = useState<Color>('w')
  const [tab, setTab] = useState<Tab>('catalog')
  const [query, setQuery] = useState('')
  const [eco, setEco] = useState<string | null>(null)
  const [limit, setLimit] = useState(40)
  const oname = (n: string) => (lang === 'ru' ? ruName(n) : n)
  const [engine, setEngine] = useState<EngineLine[] | 'loading' | 'error' | null>(null)
  const [lineName, setLineName] = useState('')
  const [info, setInfo] = useState<Info>(null)
  const [newName, setNewName] = useState('')
  const [newSide, setNewSide] = useState<Color>('w')
  const [title, setTitle] = useState<Title>(null)
  const [showAhead, setShowAhead] = useState(true)

  const shown = useMemo(() => path.slice(0, cursor), [path, cursor])
  const chess = useMemo(() => chessAtPly(START, shown, shown.length), [shown])
  const fen = chess.fen()
  const rep = data.repertoires.find(r => r.id === data.activeId) ?? null

  const input = useBoardInput(chess, chess.turn(), play)

  function play(uci: string) {
    // ход совпал со следующим ходом загруженной линии — идём по ней дальше, стрелки и название линии сохраняются
    if (cursor < path.length && path[cursor] === uci) { setCursor(cursor + 1); setEngine(null); setInfo(null); return }
    const next = [...shown, uci]
    setPath(next); setCursor(next.length); setEngine(null); setInfo(null); setTitle(null)
  }
  /** Загружает линию на доску с начала: стрелки с номерами показывают все её ходы по порядку. */
  function load(moves: string[], name: Title = null) { setPath(moves); setCursor(0); setEngine(null); setInfo(null); setTitle(name); input.clear() }
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
    if (out.length > 0) return out
    // линия закончилась или это свой ход: подсказка — продолжения из каталога (самое разработанное — №1)
    const seen = new Set<string>()
    for (const m of repMoves) {
      const { from, to } = splitUci(m)
      seen.add(m); out.push({ from: from as Square, to: to as Square, rank: out.length, label: '★', color: '#ff7ad9' })
    }
    for (const cn of conts.slice(0, 4)) {
      if (seen.has(cn.uci)) continue
      const { from, to } = splitUci(cn.uci)
      out.push({ from: from as Square, to: to as Square, rank: out.length, label: String(out.length + 1 - repMoves.length), color: '#6cb8ff' })
    }
    return out
  }, [fen, path, cursor, showAhead, conts, repMoves])
  const lineAhead = cursor < path.length
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
    // пользовательское имя или название дебюта; если ничего нет — код «Моя линия» (переводится при показе)
    const name = lineName.trim() || (title ? ('eco' in title ? oname(title.name) : title.rep) : found ? oname(found.opening.name) : '@line:mine')
    const res = addLine(rep, path, name)
    if (res.status === 'exists') { setInfo({ key: 'openings.study.lineExists' }); return }
    if (res.status === 'invalid') { setInfo({ key: 'openings.study.lineInvalid' }); return }
    withRep(() => res.rep)
    setLineName('')
    setInfo(res.status === 'extended' ? { key: 'openings.study.lineExtended' } : { key: 'openings.study.lineAdded', p: { name: rep.name } })
  }

  function createRep() {
    const r = newRepertoire(newName.trim() || `@side:${newSide}`, newSide)
    update(d => ({ ...d, repertoires: [...d.repertoires, r], activeId: r.id }))
    setNewName(''); setOrientation(newSide)
  }

  function deleteRep() {
    if (!rep || !window.confirm(t('openings.study.deleteConfirm', { name: repLabel(rep) }))) return
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
        <div><div className="eyebrow">{t('openings.study.eyebrow')}</div><h2>{t('openings.study.title')}</h2></div>
        <span className="pill" data-testid="opening-name">{found ? `${found.opening.eco} · ${oname(found.opening.name)}${found.exact ? '' : ' …'}` : shown.length ? t('openings.study.outOfCatalog') : t('openings.study.startPos')}</span>
      </div>
      {title && <p className="line-title-bar" data-testid="line-title">{'eco' in title ? `${title.eco} · ${oname(title.name)} — ${tn('openings.study.movesShort', Math.ceil(title.plies / 2))}` : lineLabel({ name: title.rep })}</p>}
      <div className="board-wrap">
        <Board chess={chess} orientation={orientation} selected={input.selected} legal={input.legal} lastMove={last ? { from: last.from as Square, to: last.to as Square } : null}
          arrows={aheadArrows} onSquareClick={input.onSquare} />
      </div>
      {aheadArrows.length > 0 && lineAhead && <p className="tiny" data-testid="arrow-legend">{t('openings.study.legendA')} <b style={{ color: '#d3ff72' }}>{t('openings.study.legendLight')}</b>, <b style={{ color: '#ffb066' }}>{t('openings.study.legendOrange')}</b>. {t('openings.study.legendB')}</p>}
      {aheadArrows.length > 0 && !lineAhead && <p className="tiny" data-testid="hint-legend">{t('openings.study.hintA')} <b style={{ color: '#6cb8ff' }}>{t('openings.study.hintBlue')}</b> {t('openings.study.hintB')}{repMoves.length > 0 && <>, <b style={{ color: '#ff7ad9' }}>{t('openings.study.hintRep')}</b></>}.</p>}
      {showAhead && aheadArrows.length === 0 && !lineAhead && shown.length > 0 && <p className="tiny" data-testid="hint-none">{t('openings.study.hintNone')}</p>}
      {!showAhead && <p className="tiny">{t('openings.study.hintsHidden')}</p>}
      {input.promo && <PromoPicker color={chess.turn()} onPick={input.pickPromo} onCancel={input.cancelPromo} />}

      <div className="line-moves" data-testid="line-moves">
        {rows.length === 0 && <span className="tiny">{t('openings.study.empty')}</span>}
        {rows.map(r => <span key={r.no} className="line-row">
          <i>{r.no}.</i>
          {r.white !== undefined && <button className={`line-move ${r.wi! + 1 === cursor ? 'active' : ''}`} onClick={() => goto(r.wi! + 1)}>{r.white}</button>}
          {r.black !== undefined && <button className={`line-move ${r.bi! + 1 === cursor ? 'active' : ''}`} onClick={() => goto(r.bi! + 1)}>{r.black}</button>}
        </span>)}
      </div>

      <div className="nav-row">
        <button className="btn" onClick={() => goto(0)} disabled={cursor === 0} aria-label={t('openings.study.toStart')}>⏮</button>
        <button className="btn" onClick={() => goto(cursor - 1)} disabled={cursor === 0} aria-label={t('openings.study.back')} data-testid="study-prev">◀</button>
        <button className="btn" onClick={() => goto(cursor + 1)} disabled={cursor >= path.length} aria-label={t('openings.study.forward')} data-testid="study-next">▶</button>
        <button className="btn" onClick={() => goto(path.length)} disabled={cursor >= path.length} aria-label={t('openings.study.toEnd')}>⏭</button>
        <button className="btn" onClick={() => setOrientation(o => (o === 'w' ? 'b' : 'w'))} data-testid="study-flip">{t('openings.study.flip')}</button>
        <button className={`btn ${showAhead ? 'primary' : ''}`} onClick={() => setShowAhead(v => !v)} aria-pressed={showAhead} data-testid="ahead-toggle" title={t('openings.study.hintToggleTitle')}>{t('openings.hint')}{showAhead ? t('openings.study.on') : ''}</button>
        <button className="btn" onClick={() => load([])} disabled={path.length === 0} data-testid="study-reset">{t('openings.study.reset')}</button>
      </div>
      <div className="chip-group" style={{ marginTop: 10 }}><small>{t('openings.study.watching')}</small>
        {(['w', 'b'] as const).map(c => <button key={c} className={`chip ${orientation === c ? 'active' : ''}`} onClick={() => setOrientation(c)} data-testid={`side-${c}`}>{c === 'w' ? t('openings.study.sideW') : t('openings.study.sideB')}</button>)}
      </div>
      {rep && repMoves.length > 0 && <p className="rep-here" data-testid="rep-here">{t('openings.study.repHere', { name: repLabel(rep) })} <b>{repMoves.map(sanOf).join(', ')}</b></p>}
      {note && <p className="rep-note" data-testid="pos-note-view">📝 {note}</p>}
      {info && <p className="tiny" data-testid="study-info">{t(info.key, info.p ? { ...info.p, ...(info.p.name !== undefined ? { name: repLabel({ name: String(info.p.name), side: rep?.side ?? 'w' }) } : {}) } : undefined)}</p>}
    </section>

    <aside className="right-column">
      <div className="tabs" role="tablist">
        {(['catalog', 'next', 'rep'] as const).map(k =>
          <button key={k} role="tab" className={`tab ${tab === k ? 'active' : ''}`} aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`otab-${k}`}>{t(`openings.study.tab.${k}`)}</button>)}
      </div>

      {tab === 'catalog' && <section className="panel" data-testid="catalog-panel">
        <div className="panel-head"><div><div className="eyebrow">{t('openings.catalog.eyebrow')}</div><h2>{t('openings.catalog.title')}</h2></div><span className="pill">{catalog ? t('openings.catalog.count', { n: search.total, total: catalog.list.length }) : t('openings.catalog.loading')}</span></div>
        <input className="search" value={query} onChange={e => { setQuery(e.target.value); setLimit(40) }} placeholder={t('openings.catalog.searchPh')} aria-label={t('openings.catalog.searchAria')} data-testid="catalog-search" />
        <div className="chips" style={{ margin: '10px 0' }}>
          <button className={`chip ${eco === null ? 'active' : ''}`} onClick={() => { setEco(null); setLimit(40) }}>{t('openings.catalog.all')}</button>
          {['A', 'B', 'C', 'D', 'E'].map(l => <button key={l} className={`chip ${eco === l ? 'active' : ''}`} onClick={() => { setEco(l); setLimit(40) }} data-testid={`eco-${l}`}>{l}</button>)}
        </div>
        <ul className="opening-list" data-testid="opening-list">
          {search.items.map((o, i) => <li key={`${o.eco}${o.name}${i}`}>
            <button className="opening-item" onClick={() => load(o.moves, { eco: o.eco, name: o.name, plies: o.moves.length })} title={o.name}>
              <span className="eco">{o.eco}</span><span className="oname">{oname(o.name)}</span><span className="olen">{tn('openings.study.movesShort', Math.ceil(o.moves.length / 2))}</span>
            </button>
          </li>)}
        </ul>
        {catalog && search.total > search.items.length && <button className="btn full" onClick={() => setLimit(l => l + 60)}>{t('openings.catalog.more', { n: search.total - search.items.length })}</button>}
        <p className="tiny">{t('openings.catalog.source')}</p>
      </section>}

      {tab === 'next' && <section className="panel" data-testid="next-panel">
        <div className="panel-head"><div><div className="eyebrow">{t('openings.next.eyebrow')}</div><h2>{t('openings.next.title')}</h2></div><span className="pill">{t('openings.next.count', { n: conts.length })}</span></div>
        {conts.length === 0
          ? <p className="muted">{catalog ? t('openings.next.none') : t('openings.next.loading')}</p>
          : <ul className="cont-list" data-testid="cont-list">
            {conts.map(c => <li key={c.uci}>
              <button className={`cont-item ${c.recommended ? 'rec' : ''}`} onClick={() => play(c.uci)} data-testid={c.recommended ? 'cont-rec' : 'cont-item'}>
                <b>{sanOf(c.uci)}</b>{c.recommended && <em>{t('openings.next.recommended')}</em>}
                {repMoves.includes(c.uci) && <em className="inrep">{t('openings.next.inRep')}</em>}
                <span>{c.opening ? oname(c.opening.name) : t('openings.next.lineContinues')}</span><small>{t('openings.next.lines', { n: c.lines })}</small>
              </button>
            </li>)}
          </ul>}
        <p className="tiny">{t('openings.next.note')}</p>
        <div className="engine-box">
          <b>{t('openings.next.engineTitle')}</b>
          <button className="btn" onClick={() => void askEngine()} disabled={engine === 'loading'} data-testid="ask-engine">{engine === 'loading' ? t('openings.next.thinking') : t('openings.next.askEngine')}</button>
          {engine === 'error' && <p className="error-text">{t('openings.next.engineError')}</p>}
          {Array.isArray(engine) && <ul className="engine-lines" data-testid="engine-lines">{engine.map((l, i) => <li key={i}><b>{l.score}</b> {l.san}</li>)}</ul>}
          {Array.isArray(engine) && <p className="tiny">{t('openings.next.engineNote')}</p>}
        </div>
      </section>}

      {tab === 'rep' && <section className="panel" data-testid="rep-panel">
        <div className="panel-head"><div><div className="eyebrow">{t('openings.rep.eyebrow')}</div><h2>{t('openings.rep.title')}</h2></div>{rep && <span className="pill">{rep.side === 'w' ? t('openings.rep.forWhite') : t('openings.rep.forBlack')} · {t('openings.next.lines', { n: rep.lines.length })}</span>}</div>
        <div className="rep-select">
          {data.repertoires.length > 0 && <select value={data.activeId ?? ''} onChange={e => { update(d => ({ ...d, activeId: e.target.value })); const r = data.repertoires.find(x => x.id === e.target.value); if (r) setOrientation(r.side) }} aria-label={t('openings.rep.title')} data-testid="rep-select">
            {data.repertoires.map(r => <option key={r.id} value={r.id}>{repLabel(r)} ({r.side === 'w' ? t('openings.side.whiteLc') : t('openings.side.blackLc')})</option>)}
          </select>}
          {rep && <button className="btn" onClick={deleteRep} data-testid="rep-delete">{t('openings.rep.delete')}</button>}
        </div>
        <div className="rep-new">
          <input className="search" value={newName} onChange={e => setNewName(e.target.value)} placeholder={t('openings.rep.newNamePh')} aria-label={t('openings.rep.nameAria')} data-testid="rep-new-name" />
          <div className="chips">
            {(['w', 'b'] as const).map(c => <button key={c} className={`chip ${newSide === c ? 'active' : ''}`} onClick={() => setNewSide(c)} data-testid={`rep-new-${c}`}>{c === 'w' ? t('openings.rep.newWhite') : t('openings.rep.newBlack')}</button>)}
            <button className="btn primary" onClick={createRep} data-testid="rep-create">{t('openings.rep.create')}</button>
          </div>
        </div>

        <div className="help-box" data-testid="rep-help"><b>{t('openings.rep.helpTitle')}</b> {t('openings.rep.helpText')}</div>
        {!rep && <p className="muted">{t('openings.rep.createHint')}</p>}
        {rep && <>
          <div className="rep-add">
            <input className="search" value={lineName} onChange={e => setLineName(e.target.value)} placeholder={found ? oname(found.opening.name) : t('openings.rep.lineName')} aria-label={t('openings.rep.lineName')} data-testid="line-name" />
            <button className="btn primary" onClick={addCurrent} disabled={path.length === 0} data-testid="add-line">{t('openings.rep.addLine', { n: path.length })}</button>
          </div>
          <label className="note-label">{t('openings.rep.posNote')}
            <textarea rows={3} value={note} onChange={e => withRep(r => setNote(r, posKey(fen), e.target.value))} placeholder={t('openings.rep.posNotePh')} data-testid="pos-note" />
          </label>
          <ul className="rep-lines" data-testid="rep-lines">
            {rep.lines.length === 0 && <li className="muted">{t('openings.rep.noLines')}</li>}
            {rep.lines.map(l => <li key={l.id} data-testid="rep-line">
              <input className="line-title" value={lineLabel(l)} onChange={e => withRep(r => updateLine(r, l.id, { name: e.target.value }))} aria-label={t('openings.rep.lineName')} />
              <code>{sanRows(START, l.moves).map(r => `${r.no}.${r.white ?? '…'}${r.black ? ` ${r.black}` : ''}`).join(' ')}</code>
              <textarea rows={2} value={l.note} onChange={e => withRep(r => updateLine(r, l.id, { note: e.target.value }))} placeholder={t('openings.rep.lineNote')} aria-label={t('openings.rep.lineNote')} />
              <div className="board-actions">
                <button className="btn" onClick={() => load(l.moves, { rep: l.name })} data-testid="rep-open">{t('openings.rep.open')}</button>
                <button className="btn" onClick={() => withRep(r => removeLine(r, l.id))} data-testid="rep-remove">{t('openings.rep.remove')}</button>
              </div>
            </li>)}
          </ul>
        </>}
      </section>}
    </aside>
  </div>
}
