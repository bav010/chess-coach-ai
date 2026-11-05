// Онлайн-партия с другом: лобби (создать / войти по коду или ссылке / мои партии) и сама партия.
// Состояние партии хранит сервер (docs/supabase.sql); экран показывает его, обновляется по Realtime и опросом раз в 2 с.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Color, Square } from 'chess.js'
import Board from '../components/Board'
import Icon from '../components/Icon'
import PlayerStrip from '../components/PlayerStrip'
import PromoPicker from '../components/PromoPicker'
import { useI18n, type Key } from '../i18n'
import type { CloudApi } from '../hooks/useCloud'
import { cloudConfigured } from '../lib/cloud'
import { captures, replay, splitUci, START_FEN } from '../lib/game'
import {
  chessOf, clockOffset, formatClock, hasClock, inviteLink, isMyTurn, isNewer, mySide, onlineErrorKey, outcomeFor, parseCode, remainingMs, ruleOutcome,
  tryMove, turnOf, type OnlineGame, type Side,
} from '../lib/online'
import {
  abortGame, claimFlag, createGame, declineDraw, getGame, joinGame, listMine, offerDraw, resignGame, sendFinish, sendMove, subscribeGame,
} from '../lib/onlineApi'
import { hrefFor, navigate } from '../lib/route'

const TIMES: { id: string; base: number; inc: number }[] = [
  { id: '3+2', base: 180, inc: 2 }, { id: '5+0', base: 300, inc: 0 }, { id: '5+3', base: 300, inc: 3 },
  { id: '10+0', base: 600, inc: 0 }, { id: '15+10', base: 900, inc: 10 }, { id: 'none', base: 0, inc: 0 },
]

export default function OnlineView({ cloud, shownName, arg }: { cloud: CloudApi; shownName: string; arg: string | null }) {
  const { t } = useI18n()
  if (!cloudConfigured) return <section className="panel online-note" data-testid="online-off"><h2>{t('online.off.title')}</h2><p>{t('online.off.text')}</p></section>
  if (cloud.status === 'loading') return <section className="panel online-note"><p>{t('online.loading')}</p></section>
  if (cloud.status !== 'in' || !cloud.user) {
    return <section className="panel online-note" data-testid="online-signin"><h2>{t('online.signin.title')}</h2><p>{t('online.signin.text')}</p>
      <a className="btn primary" href={hrefFor('account')}><Icon name="user" size={16} /> {t('app.signin')}</a></section>
  }
  const code = arg ? parseCode(arg) : null
  return code ? <GameScreen key={code} code={code} uid={cloud.user.id} name={shownName} /> : <Lobby uid={cloud.user.id} name={shownName} />
}

function Lobby({ uid, name }: { uid: string; name: string }) {
  const { t } = useI18n()
  const [color, setColor] = useState<Side | 'r'>('r')
  const [time, setTime] = useState('10+0')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [codeIn, setCodeIn] = useState('')
  const [mine, setMine] = useState<OnlineGame[] | null>(null)

  useEffect(() => {
    let live = true
    listMine(uid).then(r => { if (live) setMine(r) }).catch(() => { if (live) setMine([]) })
    return () => { live = false }
  }, [uid])

  async function create() {
    const tc = TIMES.find(x => x.id === time) ?? TIMES[3]
    setBusy(true); setErr(null)
    try { const g = await createGame(name, color, tc.base, tc.inc); navigate('online', g.code) } catch (e) { setErr(onlineErrorKey(e)) } finally { setBusy(false) }
  }
  function join() {
    const c = parseCode(codeIn)
    if (!c) { setErr('online.join.bad'); return }
    setErr(null); navigate('online', c)
  }

  return <div className="main-grid online-lobby" data-testid="online-lobby">
    <section className="panel">
      <div className="panel-head"><div><div className="eyebrow">{t('online.eyebrow')}</div><h2>{t('online.create.title')}</h2></div></div>
      <p className="muted">{t('online.friendly')}</p>
      <div className="field-label">{t('online.color.label')}</div>
      <div className="chips">{(['w', 'b', 'r'] as const).map(c =>
        <button key={c} className={`chip ${color === c ? 'active' : ''}`} aria-pressed={color === c} onClick={() => setColor(c)} data-testid={`online-color-${c}`}>{t(`online.color.${c}` as Key)}</button>)}</div>
      <div className="field-label">{t('online.time.label')}</div>
      <div className="chips">{TIMES.map(x =>
        <button key={x.id} className={`chip ${time === x.id ? 'active' : ''}`} aria-pressed={time === x.id} onClick={() => setTime(x.id)} data-testid={`online-time-${x.id}`}>{x.id === 'none' ? t('online.time.none') : x.id}</button>)}</div>
      <div className="action-bar"><button className="btn primary" disabled={busy} onClick={() => void create()} data-testid="online-create"><Icon name="play2" size={16} /> {t('online.create.btn')}</button></div>
      {err && <p className="error-text" role="alert" data-testid="online-error">{t(err as Key)}</p>}
    </section>
    <section className="panel">
      <div className="panel-head"><div><h2>{t('online.join.title')}</h2></div></div>
      <div className="online-join">
        <input value={codeIn} onChange={e => setCodeIn(e.target.value)} placeholder={t('online.join.placeholder')} aria-label={t('online.join.title')}
          onKeyDown={e => { if (e.key === 'Enter') join() }} data-testid="online-code-input" />
        <button className="btn" onClick={join} data-testid="online-join-btn">{t('online.join.btn')}</button>
      </div>
      <h3 className="online-sub">{t('online.mine.title')}</h3>
      {mine === null ? <p className="muted">{t('online.loading')}</p>
        : mine.length === 0 ? <p className="muted" data-testid="online-mine-empty">{t('online.mine.empty')}</p>
        : <ul className="online-list" data-testid="online-mine">{mine.map(g => {
          const side = mySide(g, uid)
          const opp = side === 'w' ? g.black_name : g.white_name
          const o = outcomeFor(g, side)
          const state = g.status === 'finished' ? (o ? t(`online.res.${o}` as Key) : t('online.end.aborted')) : t(`online.status.${g.status}` as Key)
          return <li key={g.id}><a href={hrefFor('online', g.code)} data-testid="online-mine-item">
            <span>{opp ? t('online.vs', { name: opp }) : t('online.status.waiting')}</span><b>{state}</b></a></li>
        })}</ul>}
    </section>
  </div>
}

function GameScreen({ code, uid, name }: { code: string; uid: string; name: string }) {
  const { t } = useI18n()
  const [g, setG] = useState<OnlineGame | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [selected, setSelected] = useState<Square | null>(null)
  const [legal, setLegal] = useState<Square[]>([])
  const [promo, setPromo] = useState<{ from: Square; to: Square } | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmResign, setConfirmResign] = useState(false)
  const [copied, setCopied] = useState(false)
  const gRef = useRef<OnlineGame | null>(null)
  const offset = useRef(0)
  const sent = useRef<string>('')

  const apply = useCallback((next: OnlineGame) => {
    if (next.server_now) { const o = clockOffset(next, Date.now()); if (o !== null) offset.current = o }
    if (!isNewer(next, gRef.current)) return
    gRef.current = next; setG(next)
  }, [])

  // вход в партию, подписка и опрос
  useEffect(() => {
    let live = true
    let unsub: (() => void) | null = null
    let timer: number | undefined
    joinGame(code, name).then(first => {
      if (!live) return
      apply(first)
      subscribeGame(first.id, r => { if (live) apply(r) }).then(u => { if (live) unsub = u; else u() }).catch(() => undefined)
      timer = window.setInterval(() => {
        const cur = gRef.current
        if (!cur || cur.status === 'finished') return
        getGame(cur.id).then(r => { if (live) apply(r) }).catch(() => undefined)
      }, 2000)
    }).catch(e => { if (live) setErr(onlineErrorKey(e)) })
    return () => { live = false; unsub?.(); if (timer) window.clearInterval(timer) }
  }, [code, name, apply])

  const active = g?.status === 'active'
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(id)
  }, [active])

  const side = g ? mySide(g, uid) : null
  const chess = useMemo(() => (g ? chessOf(g) : null), [g?.moves.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // конец по правилам: оба клиента сообщают серверу (операция идемпотентна)
  useEffect(() => {
    if (!g || g.status !== 'active') return
    const o = ruleOutcome(g)
    const key = `f${g.moves.length}`
    if (!o || sent.current === key) return
    sent.current = key
    sendFinish(g.id, o.result, o.reason).then(apply).catch(() => { sent.current = '' })
  }, [g, apply])

  // флаг: время игрока на ходу истекло
  const turn = g ? turnOf(g) : 'w'
  const left = g && hasClock(g) ? remainingMs(g, turn, now, offset.current) : null
  useEffect(() => {
    if (!g || g.status !== 'active' || left === null || left > 0) return
    const key = `t${g.moves.length}`
    if (sent.current === key) return
    sent.current = key
    claimFlag(g.id).then(apply).catch(() => { sent.current = '' })
  }, [g, left, apply])

  async function run(fn: () => Promise<OnlineGame>) {
    setBusy(true); setErr(null)
    try { apply(await fn()) } catch (e) { setErr(onlineErrorKey(e)) } finally { setBusy(false); setConfirmResign(false) }
  }

  function onSquare(sq: Square) {
    if (!g || !chess || !side || busy || !isMyTurn(g, side)) return
    const piece = chess.get(sq)
    if (selected && legal.includes(sq)) {
      const mover = chess.get(selected)
      if (mover?.type === 'p' && (sq[1] === '8' || sq[1] === '1')) { setPromo({ from: selected, to: sq }); return }
      play(`${selected}${sq}`); return
    }
    if (piece && piece.color === side) { setSelected(sq); setLegal(chess.moves({ square: sq, verbose: true }).map(m => m.to)) } else { setSelected(null); setLegal([]) }
  }
  function play(uci: string) {
    setSelected(null); setLegal([]); setPromo(null)
    if (!g || !chess || !tryMove(chess, uci)) return
    void run(() => sendMove(g.id, uci))
  }

  if (err && !g) return <section className="panel online-note" data-testid="online-fail"><p className="error-text" role="alert">{t(err as Key)}</p>
    <a className="btn" href={hrefFor('online')}>{t('online.lobby')}</a></section>
  if (!g || !chess) return <section className="panel online-note"><p>{t('online.loading')}</p></section>

  const me: Side = side ?? 'w'
  const top: Color = me === 'w' ? 'b' : 'w'
  const nameOf = (s: Side) => (s === 'w' ? g.white_name : g.black_name) || t('online.waitingName')
  const caps = captures(replay(START_FEN, g.moves).records)
  const clockFor = (s: Side) => {
    if (!hasClock(g)) return null
    const ms = remainingMs(g, s, now, offset.current) ?? 0
    return <span className={`clock ${g.status === 'active' && turnOf(g) === s ? 'active' : ''} ${ms < 10_000 ? 'low' : ''}`} data-testid={`online-clock-${s}`} data-ms={Math.round(ms)}>{formatClock(ms)}</span>
  }
  const lastUci = g.moves[g.moves.length - 1]
  const last = lastUci ? (() => { const u = splitUci(lastUci); return { from: u.from, to: u.to } })() : null
  const link = inviteLink(g.code)
  const o = outcomeFor(g, side)
  const myTurn = isMyTurn(g, side)
  const incoming = g.status === 'active' && g.draw_offer !== null && g.draw_offer !== side
  const offered = g.status === 'active' && g.draw_offer === side

  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 2000) } catch { /* буфер недоступен: ссылка видна в поле */ }
  }
  async function rematch() {
    if (!g) return
    setBusy(true); setErr(null)
    try { const n = await createGame(name, me === 'w' ? 'b' : 'w', Math.round(g.base_ms / 1000), Math.round(g.inc_ms / 1000)); navigate('online', n.code) }
    catch (e) { setErr(onlineErrorKey(e)) } finally { setBusy(false) }
  }

  const banner = g.status === 'finished'
    ? (o ? t(`online.end.${o}` as Key, { reason: t(`online.reason.${g.reason ?? 'draw'}` as Key) }) : t('online.end.aborted'))
    : g.status === 'waiting' ? t('online.wait.title') : myTurn ? t('online.turn.you') : t('online.turn.opp')

  return <div className="main-grid" data-testid="online-game" data-status={g.status} data-side={side ?? ''} data-moves={g.moves.length}>
    <section className="panel board-panel play-panel">
      <div className="panel-head"><div><div className="eyebrow">{t('online.eyebrow')}</div><h2>{t('online.vs', { name: nameOf(top) })}</h2></div>
        <span className="pill">{hasClock(g) ? `${Math.round(g.base_ms / 60000 * 10) / 10}+${Math.round(g.inc_ms / 1000)}` : t('online.time.none')}</span></div>
      <PlayerStrip color={top} name={nameOf(top)} captured={top === 'w' ? caps.byWhite : caps.byBlack} advantage={top === 'w' ? Math.max(0, caps.balance) : Math.max(0, -caps.balance)}
        clock={clockFor(top)} active={g.status === 'active' && turn === top} />
      <div className="board-wrap"><Board chess={chess} orientation={me} selected={selected} legal={legal} lastMove={last} onSquareClick={onSquare} readOnly={!myTurn || busy} /></div>
      <PlayerStrip color={me} name={nameOf(me)} captured={me === 'w' ? caps.byWhite : caps.byBlack} advantage={me === 'w' ? Math.max(0, caps.balance) : Math.max(0, -caps.balance)}
        clock={clockFor(me)} active={g.status === 'active' && turn === me} />
      {promo && <PromoPicker color={me} onPick={p => play(`${promo.from}${promo.to}${p}`)} onCancel={() => { setPromo(null); setSelected(null); setLegal([]) }} />}
      <div className="board-message" role="status" data-testid="online-message"><span className="pulse" /> {banner}</div>
      {err && <p className="error-text" role="alert" data-testid="online-error">{t(err as Key)}</p>}
    </section>

    <section className="panel online-side">
      {g.status === 'waiting' && <div data-testid="online-wait">
        <h3>{t('online.wait.title')}</h3><p className="muted">{t('online.wait.text')}</p>
        <input readOnly value={link} onFocus={e => e.currentTarget.select()} aria-label={t('online.wait.link')} data-testid="online-link" />
        <div className="online-code">{t('online.wait.code')}: <b data-testid="online-code">{g.code}</b></div>
        <div className="action-bar"><button className="btn primary" onClick={() => void copy()} data-testid="online-copy"><Icon name="check" size={16} /> {copied ? t('online.wait.copied') : t('online.wait.copy')}</button>
          <button className="btn quiet" disabled={busy} onClick={() => void run(() => abortGame(g.id)).then(() => navigate('online'))} data-testid="online-cancel">{t('online.wait.cancel')}</button></div>
      </div>}

      {g.status === 'active' && side && <div className="action-bar online-actions">
        {incoming && <div className="online-draw" data-testid="online-draw-in"><span>{t('online.draw.incoming')}</span>
          <button className="btn primary" disabled={busy} onClick={() => void run(() => offerDraw(g.id))} data-testid="online-draw-accept">{t('online.draw.accept')}</button>
          <button className="btn quiet" disabled={busy} onClick={() => void run(() => declineDraw(g.id))} data-testid="online-draw-decline">{t('online.draw.decline')}</button></div>}
        {!incoming && <button className="btn" disabled={busy || offered} onClick={() => void run(() => offerDraw(g.id))} data-testid="online-draw">
          <Icon name="handshake" size={16} /> {offered ? t('online.draw.offered') : t('online.draw.offer')}</button>}
        {g.moves.length < 2 && <button className="btn quiet" disabled={busy} onClick={() => void run(() => abortGame(g.id))} data-testid="online-abort">{t('online.abort')}</button>}
        {!confirmResign
          ? <button className="btn danger-quiet" onClick={() => setConfirmResign(true)} data-testid="online-resign"><Icon name="flag" size={16} /> {t('online.resign')}</button>
          : <span className="inline-confirm" data-testid="online-resign-confirm"><span>{t('online.resign.confirm')}</span>
            <button className="btn danger-quiet" disabled={busy} onClick={() => void run(() => resignGame(g.id))} data-testid="online-resign-yes">{t('online.resign.yes')}</button>
            <button className="btn quiet" onClick={() => setConfirmResign(false)}>{t('online.resign.no')}</button></span>}
      </div>}

      {g.status === 'finished' && <div className="action-bar" data-testid="online-finished">
        {side && g.reason !== 'aborted' && <button className="btn primary" disabled={busy} onClick={() => void rematch()} data-testid="online-rematch"><Icon name="refresh" size={16} /> {t('online.rematch')}</button>}
        <a className="btn" href={hrefFor('online')} data-testid="online-back">{t('online.lobby')}</a></div>}

      <p className="muted online-fine">{t('online.friendly')}</p>
    </section>
  </div>
}
