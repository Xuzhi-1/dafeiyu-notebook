/** 注释内容白名单：只允许纯文本、换行和高亮 span。 */

const ALLOWED_MODES = new Set(['marker', 'solid', 'wavy', 'dashed']);
const FORMAT_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE']);
const STYLE_PROPS = [
  'color',
  'background-color',
  'box-decoration-break',
  '-webkit-box-decoration-break',
  'text-decoration-line',
  'text-decoration-style',
  'text-decoration-color',
  'text-decoration-thickness',
  'text-underline-offset',
];

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll('"', '&quot;');
}

function serialize(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent ?? '');
  if (!(node instanceof HTMLElement)) return '';
  if (node.tagName === 'BR') return '\n';
  if (FORMAT_TAGS.has(node.tagName)) {
    const tag = node.tagName.toLowerCase();
    return `<${tag}>${[...node.childNodes].map(serialize).join('')}</${tag}>`;
  }
  if (node.tagName !== 'SPAN') return [...node.childNodes].map(serialize).join('');

  const mode = node.dataset.highlight;
  const validMode = mode && ALLOWED_MODES.has(mode) ? mode : '';
  const color = node.style.getPropertyValue('color');
  const children = [...node.childNodes].map(serialize).join('');
  if (!validMode && !color) return children;
  const style = STYLE_PROPS
    .map((property) => [property, node.style.getPropertyValue(property)] as const)
    .filter(([, value]) => Boolean(value))
    .map(([property, value]) => `${property}:${escapeAttr(value)}`)
    .join(';');
  return `<span${validMode ? ` data-highlight="${validMode}"` : ''}${style ? ` style="${style}"` : ''}>${children}</span>`;
}

/** 清洗注释 HTML；允许高亮所需的 span/br，其他标签只保留文字。 */
export function sanitizeCommentHtml(html: string): string {
  if (!html) return '';
  const template = document.createElement('template');
  template.innerHTML = html;
  return [...template.content.childNodes].map(serialize).join('').replace(/\u200b/g, '').replace(/^\n+|\n+$/g, '');
}

/** 旧注释没有 format 标记，按纯文本显示，避免把历史内容误当 HTML。 */
export function trimCommentBoundary(html: string): string {
  if (!html) return '';
  const template = document.createElement('template');
  template.innerHTML = html;
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    texts.push(node as Text);
    node = walker.nextNode();
  }
  const first = texts[0];
  const last = texts[texts.length - 1];
  if (first) first.data = first.data.replace(/^[\s\u00a0]+/, '');
  if (last) last.data = last.data.replace(/[\s\u00a0]+$/, '');
  for (const text of texts) if (!text.data) text.remove();
  return template.innerHTML;
}

export function commentToHtml(html: string, rich: boolean): string {
  if (rich) return sanitizeCommentHtml(html);
  return escapeHtml(html);
}
