// Строгие линейные иконки (24×24, обводка currentColor). Декоративные: подпись или подсказка даётся рядом/в aria-label кнопки.
const P = {
  home: 'M3 11l9-8 9 8M5 9.5V20h5v-6h4v6h5V9.5',
  analysis: 'M11 4a7 7 0 100 14 7 7 0 000-14zM16.2 16.2L21 21M8.5 12.5l2-2.2 1.6 1.4 2-2.4',
  play: 'M5 9h14a1 1 0 011 1v8a1 1 0 01-1 1H5a1 1 0 01-1-1v-8a1 1 0 011-1zM12 9V5M12 5m-1.2 0a1.2 1.2 0 102.4 0 1.2 1.2 0 10-2.4 0M9 14m-1 0a1 1 0 102 0 1 1 0 10-2 0M15 14m-1 0a1 1 0 102 0 1 1 0 10-2 0M2 13v3M22 13v3',
  tactics: 'M13 2.5L5 13.5h6l-1 8 8-11h-6z',
  openings: 'M4 19.5A2.5 2.5 0 016.5 17H20V3.5H6.5A2.5 2.5 0 004 6zM4 19.5V6M8.5 7.5h7M8.5 11h5M6.5 17a2.5 2.5 0 000 4H20v-4',
  stats: 'M4 20v-8M10 20V5M16 20v-6M21 20H3',
  user: 'M12 4a4 4 0 100 8 4 4 0 000-8zM4.5 21c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  help: 'M12 3a9 9 0 100 18 9 9 0 000-18zM9.6 9.4a2.5 2.5 0 114 2c-.9.7-1.6 1.1-1.6 2.4M12 17.2v.1',
  menu: 'M4 6.5h16M4 12h16M4 17.5h16',
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  flip: 'M7 3.5v16M7 19.5l-3-3M17 20.5v-16M17 4.5l3 3',
  sun: 'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M5.2 18.8l1.4-1.4M17.4 6.6l1.4-1.4',
  moon: 'M20 14.2A8 8 0 019.8 4 8 8 0 1020 14.2z',
  system: 'M4 5h16v11H4zM9 20h6M12 16v4',
  check: 'M5 12.5l4.5 4.5L19 7',
  globe: 'M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z',
  board: 'M4 4h16v16H4zM4 12h16M12 4v16',
  hint: 'M9 18h6M10 21h4M12 3a6 6 0 00-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0012 3z',
  flame: 'M12 3c.8 3.6 5 5 5 9.6a5 5 0 01-10 0c0-1.8.8-3 1.8-4 .4 1.6 1.2 2 1.7 2C10 8.6 11 5.6 12 3z',
  clock: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2',
  cloud: 'M7 18a4.5 4.5 0 01-.6-8.96A6 6 0 0118 10.5 3.8 3.8 0 0117.5 18z',
  logout: 'M10 4H5v16h5M15 8l4 4-4 4M19 12H9',
  keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
  trophy: 'M8 4h8v5a4 4 0 01-8 0zM8 6H5v1.5A3 3 0 008 10.5M16 6h3v1.5a3 3 0 01-3 3M12 13v4M8.5 20h7M10 17h4',
  play2: 'M8 5.5v13l11-6.5z',
  save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
  palette: 'M12 3a9 9 0 100 18c1.2 0 2-.8 2-1.8 0-.5-.2-.9-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17a4 4 0 004-4c0-4.4-4-7.8-9-7.8zM7.5 11.5h.01M10 7.5h.01M14.5 7.5h.01',
  database: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  refresh: 'M20 12a8 8 0 11-2.4-5.7M20 4v5h-5',
} as const
export type IconName = keyof typeof P

export default function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return <svg className={`icon ${className ?? ''}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d={P[name]} />
  </svg>
}
