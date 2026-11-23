/** 文档默认字体。 */
export const DEFAULT_FONT_FAMILY = 'Source Han Sans SC';

/** 将字体族名称转换为合法的 CSS font-family 值。 */
export function cssFontFamily(value: string | undefined): string {
  const name = value?.trim();
  if (!name) return '';
  if (/^[a-zA-Z_][\w-]*$/.test(name)) return name;
  return `"${name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
