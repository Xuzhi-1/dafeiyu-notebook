/**
 * 行内 HTML 白名单清洗。
 * 只保留少量格式标签与 style/href/title 属性，其余标签拆壳保留文字。
 */

const ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'SPAN', 'BR', 'A', 'SUB', 'SUP']);
const ALLOWED_ATTRS = new Set(['style', 'href', 'title', 'data-highlight']);
const DROP_TAGS = new Set(['STYLE', 'SCRIPT', 'TITLE', 'HEAD', 'META', 'LINK', 'XML', 'IFRAME', 'OBJECT', 'EMBED', 'NOSCRIPT', 'TEMPLATE']);
const BLOCK_BREAK_TAGS = new Set([
  'P', 'DIV', 'LI', 'UL', 'OL', 'TR', 'TD', 'TH', 'TABLE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'BLOCKQUOTE', 'PRE', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'ASIDE', 'MAIN', 'NAV',
]);
const ALLOWED_STYLES = new Set([
  'color', 'background-color', 'font-family', 'font-size', 'font-style', 'font-weight',
  'text-align', 'text-decoration', 'text-decoration-line', 'text-decoration-style',
  'text-decoration-color', 'text-decoration-thickness', 'text-underline-offset',
  'box-decoration-break', '-webkit-box-decoration-break', 'vertical-align',
]);
const SAFE_PROTOCOLS = /^(https?:|mailto:)/i;

export function sanitizeInline(html: string): string {
  if (!html) return '';
  const template = document.createElement('template');
  template.innerHTML = html;
  cleanNode(template.content);
  return template.innerHTML;
}

function cleanStyle(node: HTMLElement): void {
  const style = node.getAttribute('style');
  if (!style) return;
  const safe = [...node.style]
    .filter((property) => ALLOWED_STYLES.has(property))
    .map((property) => [property, node.style.getPropertyValue(property)] as const)
    .filter(([, value]) => Boolean(value) && !/url\(|expression|javascript/i.test(value));
  if (safe.length) node.setAttribute('style', safe.map(([property, value]) => `${property}:${value}`).join(';'));
  else node.removeAttribute('style');
}

function cleanNode(root: ParentNode): void {
  for (const node of [...root.childNodes]) {
    if (node.nodeType === Node.TEXT_NODE) continue;
    if (!(node instanceof HTMLElement)) {
      node.remove();
      continue;
    }
    if (DROP_TAGS.has(node.tagName)) {
      node.remove();
      continue;
    }
    if (!ALLOWED_TAGS.has(node.tagName)) {
      const children = [...node.childNodes];
      if (BLOCK_BREAK_TAGS.has(node.tagName)) children.push(document.createElement('br'));
      node.replaceWith(...children);
      cleanNode(root);
      continue;
    }
    for (const attr of [...node.attributes]) {
      if (!ALLOWED_ATTRS.has(attr.name.toLowerCase())) node.removeAttribute(attr.name);
    }
    cleanStyle(node);
    const highlight = node.getAttribute('data-highlight');
    if (highlight && !['marker', 'solid', 'wavy', 'dashed'].includes(highlight)) node.removeAttribute('data-highlight');
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') ?? '';
      if (!SAFE_PROTOCOLS.test(href)) node.removeAttribute('href');
      node.setAttribute('rel', 'noreferrer');
    }
    cleanNode(node);
  }
}
