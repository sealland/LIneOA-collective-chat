import { toPng } from 'html-to-image';

const CARD_WIDTH = 1280;
const PIXEL_RATIO = 2;

export async function exportSummaryImage(
  node: HTMLElement,
  businessDate: string
): Promise<void> {
  // Wait a frame so Recharts finishes layout inside the off-screen card.
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
  await new Promise((r) => setTimeout(r, 120));

  const dataUrl = await toPng(node, {
    cacheBust: true,
    pixelRatio: PIXEL_RATIO,
    width: CARD_WIDTH,
    backgroundColor: '#eef4f5',
    style: {
      transform: 'none',
      left: '0',
      top: '0',
    },
  });

  const link = document.createElement('a');
  link.download = `line-oa-daily-${businessDate}.png`;
  link.href = dataUrl;
  link.click();
}
