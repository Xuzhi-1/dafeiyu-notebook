/** 图片剪贴板：从 paste 事件或 Electron 剪贴板读取，并限制尺寸。 */

import { platform, type ClipboardImage } from '../../platform/ipc.js';

const MAX_EDGE = 2400;
const MAX_DATA_URL = 8 * 1024 * 1024;

export async function imageFromPasteEvent(data: DataTransfer | null): Promise<string | null> {
  if (!data) return null;
  const files = [...data.files].filter((file) => file.type.startsWith('image/'));
  for (const item of [...data.items]) {
    if (!item.type.startsWith('image/')) continue;
    const file = item.getAsFile();
    if (file) files.push(file);
  }
  const file = files[0];
  if (!file) return null;
  return normalizeImageDataUrl(await readFileAsDataUrl(file));
}

export async function readSystemClipboardImage(): Promise<string | null> {
  const api = platform();
  if (!api) return null;
  const image: ClipboardImage | null = await api.readClipboardImage();
  return image?.dataUrl ? normalizeImageDataUrl(image.dataUrl) : null;
}

export async function normalizeImageDataUrl(dataUrl: string): Promise<string | null> {
  if (!/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(dataUrl)) return null;
  if (dataUrl.length <= MAX_DATA_URL) {
    const image = await loadImage(dataUrl);
    if (!image) return null;
    if (Math.max(image.naturalWidth, image.naturalHeight) <= MAX_EDGE) return dataUrl;
  }
  const image = await loadImage(dataUrl);
  if (!image) return null;
  const scale = Math.min(1, MAX_EDGE / Math.max(1, image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const result = canvas.toDataURL('image/png');
  return result.length <= MAX_DATA_URL ? result : null;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}
