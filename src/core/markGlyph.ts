import type { Mark } from './types.js';

const MARK_GLYPHS: Record<string, string> = {
  star: '★', target: '◎', flame: '🔥', leaf: '🍃', heart: '♥', bolt: '⚡',
  moon: '☾', sun: '☀', sparkles: '✨', pin: '📌',
};

export function markGlyph(mark: Mark): string {
  return MARK_GLYPHS[mark.icon ?? 'star'] ?? mark.icon ?? '★';
}
