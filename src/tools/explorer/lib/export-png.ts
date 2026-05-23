// Serialize a chart's SVG to a PNG blob and trigger a download. Inlines
// resolved CSS variables so the output looks like the on-screen chart
// instead of an unstyled wireframe.

export async function downloadSvgAsPng(
  svg: SVGSVGElement | null,
  filename: string,
  scale = 2,
): Promise<void> {
  if (!svg) return;

  const width = svg.clientWidth || svg.viewBox.baseVal?.width || 800;
  const height = svg.clientHeight || svg.viewBox.baseVal?.height || 480;

  // Clone the SVG so we can mutate without affecting the live chart.
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));

  // Inline our design-system CSS variables — values that <style> blocks
  // inside the chart reference. Without this, the serialized SVG renders
  // with all-black axes / no background.
  const resolved = readCssVars();
  const styleBlock = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  styleBlock.textContent = `
    :root {
      ${Object.entries(resolved)
        .map(([k, v]) => `${k}: ${v};`)
        .join(' ')}
    }
  `;
  clone.insertBefore(styleBlock, clone.firstChild);

  // Background — chart pane uses paper-2.
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', '0');
  bg.setAttribute('y', '0');
  bg.setAttribute('width', String(width));
  bg.setAttribute('height', String(height));
  bg.setAttribute('fill', resolved['--paper-2'] ?? '#ffffff');
  clone.insertBefore(bg, styleBlock.nextSibling);

  const xml = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = (e) => reject(new Error(`Image load failed: ${String(e)}`));
    img.src = url;
  });

  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(width * scale);
  canvas.height = Math.floor(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D canvas context available');
  ctx.fillStyle = resolved['--paper-2'] ?? '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  URL.revokeObjectURL(url);

  await new Promise<void>((resolve) =>
    canvas.toBlob((b) => {
      if (b) triggerDownload(b, filename);
      resolve();
    }, 'image/png'),
  );
}

function readCssVars(): Record<string, string> {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  const keys = [
    '--paper',
    '--paper-2',
    '--paper-3',
    '--ink',
    '--ink-2',
    '--ink-3',
    '--ink-4',
    '--rule',
    '--rule-strong',
  ];
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = style.getPropertyValue(k).trim();
    if (v) out[k] = v;
  }
  return out;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadString(text: string, filename: string, mime = 'text/plain'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  triggerDownload(blob, filename);
}
