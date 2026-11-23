/**
 * 工具栏线性图标（统一 20×20、1.5 描边）。
 * 用 data-icon 标记，启动时 renderIcons() 统一填充。
 */

const svg = (body: string): string => `<svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS: Record<string, string> = {
  doc: svg('<path d="M5 2.5h6l4 4v11H5z"/><path d="M11 2.5v4h4"/>'),
  open: svg('<path d="M3 6.5h5l1.5 2H17l-2 7H5z"/><path d="M3 6.5V4h5l1 1.5"/>'),
  save: svg('<path d="M3.5 3.5h11l2 2v11h-13z"/><path d="M6 3.5v4h8v-4"/><path d="M6 16.5v-5h8v5"/>'),
  import: svg('<path d="M10 3v8"/><path d="M6.5 7.5L10 11l3.5-3.5"/><path d="M4 13v3.5h12V13"/>'),
  export: svg('<path d="M10 13V5"/><path d="M6.5 8.5L10 5l3.5 3.5"/><path d="M4 14v3h12v-3"/>'),
  print: svg('<path d="M6 7V3h8v4"/><rect x="3.5" y="7" width="13" height="7"/><path d="M6 12h8v5H6z"/>'),
  folder: svg('<path d="M3 5.5h5l1.5 2H17v9H3z"/>'),
  search: svg('<circle cx="9" cy="9" r="4.5"/><path d="M12.5 12.5L17 17"/>'),
  theme: svg('<circle cx="10" cy="10" r="6"/><path d="M10 4v12"/>'),
  plugin: svg('<path d="M7 3.5h6v4h-6z"/><path d="M5 7.5h10v9H5z"/><path d="M8 11h4"/>'),
  refresh: svg('<path d="M16 8a6 6 0 1 0 .5 4"/><path d="M16 4v4h-4"/>'),
  font: svg('<path d="M5 16 9 5h2l4 11"/><path d="M6.8 12h6.4"/>'),
  info: svg('<circle cx="10" cy="10" r="6.5"/><path d="M10 9v5"/><circle cx="10" cy="6.5" r="0.6" fill="currentColor" stroke="none"/>'),
  close: svg('<path d="M6 6l8 8"/><path d="M14 6l-8 8"/>'),
  sidebar: svg('<rect x="3" y="4" width="14" height="12" rx="1.5"/><path d="M8 4v12"/>'),
  undo: svg('<g transform="translate(-0.25 -1.75)"><path d="M9 4.5 4.5 9 9 13.5"/><path d="M4.5 9H11a5 5 0 0 1 0 10H8"/></g>'),
  redo: svg('<g transform="translate(0.25 -1.75)"><path d="M11 4.5 15.5 9 11 13.5"/><path d="M15.5 9H9a5 5 0 0 0 0 10h3"/></g>'),
  alignLeft: svg('<path d="M3 5h14"/><path d="M3 9h9"/><path d="M3 13h14"/><path d="M3 17h9"/>'),
  alignCenter: svg('<path d="M3 5h14"/><path d="M5 9h10"/><path d="M3 13h14"/><path d="M5 17h10"/>'),
  alignRight: svg('<path d="M3 5h14"/><path d="M8 9h9"/><path d="M3 13h14"/><path d="M8 17h9"/>'),
  alignJustify: svg('<path d="M3 5h14"/><path d="M3 9h14"/><path d="M3 13h14"/><path d="M3 17h14"/>'),
  outdent: svg('<path d="M3 5h14"/><path d="M3 9h7"/><path d="M3 13h7"/><path d="M3 17h14"/><path d="M14 9l-3 2 3 2"/>'),
  indent: svg('<path d="M3 5h14"/><path d="M10 9h7"/><path d="M10 13h7"/><path d="M3 17h14"/><path d="M7 9l3 2-3 2"/>'),
  quote: svg('<path d="M7 6c-2 0-3 1.5-3 3.5S5 13 6.5 13"/><path d="M13 6c-2 0-3 1.5-3 3.5S11 13 12.5 13"/>'),
  bullet: svg('<circle cx="4" cy="6" r="1"/><circle cx="4" cy="10" r="1"/><circle cx="4" cy="14" r="1"/><path d="M8 6h9"/><path d="M8 10h9"/><path d="M8 14h9"/>'),
  number: svg('<path d="M3.5 6h2M4.5 5v2"/><path d="M8 6h9"/><path d="M3.5 10h2v2h-2z"/><path d="M8 11h9"/><path d="M3.5 14.5h2M4.5 14v1h1"/>'),
  table: svg('<rect x="3" y="4" width="14" height="12" rx="1"/><path d="M3 8h14"/><path d="M7.7 8v8"/><path d="M12.3 8v8"/><path d="M3 12.3h14"/>'),
  chart: svg('<path d="M4 15.5V9"/><path d="M9 15.5V4"/><path d="M14 15.5V11"/><path d="M3 16h14"/>'),
  image: svg('<rect x="3" y="4" width="14" height="12" rx="1"/><circle cx="7.5" cy="8" r="1.2"/><path d="M4 15l4.5-4 3 3 2-2 3 3"/>'),
  link: svg('<path d="M8 12l4-4"/><path d="M7 8H5.5a3 3 0 000 6H8"/><path d="M13 12h1.5a3 3 0 000-6H12"/>'),
  star: svg('<path d="M10 3.5l1.8 4 4.2.5-3 2.8.8 4.2-3.8-2-3.8 2 .8-4.2-3-2.8 4.2-.5z"/>'),
  comment: svg('<path d="M4 5h12v8H9l-3 3v-3H4z"/>'),
  sliders: svg('<path d="M4 5h12"/><path d="M4 10h12"/><path d="M4 15h12"/><circle cx="8" cy="5" r="1.6" fill="#fff"/><circle cx="13" cy="10" r="1.6" fill="#fff"/><circle cx="7" cy="15" r="1.6" fill="#fff"/>'),
};

export function iconSvg(name: string): string {
  return ICONS[name] ?? '';
}

export function renderIcons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-icon]').forEach((el) => {
    const name = el.dataset.icon ?? '';
    if (ICONS[name]) el.innerHTML = ICONS[name];
  });
}
