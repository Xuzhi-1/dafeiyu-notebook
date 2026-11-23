/** 图片处理：翻转、剪裁都输出新的 PNG data URL。 */

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const loadImage = (src: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('图片加载失败'));
  image.src = src;
});

const canvasOf = (width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法创建图片画布');
  return [canvas, context];
};

export async function flipImage(src: string, axis: 'horizontal' | 'vertical'): Promise<string> {
  const image = await loadImage(src);
  const [canvas, context] = canvasOf(image.naturalWidth, image.naturalHeight);
  if (axis === 'horizontal') {
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
  } else {
    context.translate(0, canvas.height);
    context.scale(1, -1);
  }
  context.drawImage(image, 0, 0);
  return canvas.toDataURL('image/png');
}

export async function cropImage(src: string, rect: CropRect): Promise<string> {
  const image = await loadImage(src);
  const x = Math.max(0, Math.min(image.naturalWidth - 1, Math.round(rect.x)));
  const y = Math.max(0, Math.min(image.naturalHeight - 1, Math.round(rect.y)));
  const width = Math.max(1, Math.min(image.naturalWidth - x, Math.round(rect.width)));
  const height = Math.max(1, Math.min(image.naturalHeight - y, Math.round(rect.height)));
  const [canvas, context] = canvasOf(width, height);
  context.drawImage(image, x, y, width, height, 0, 0, width, height);
  return canvas.toDataURL('image/png');
}
