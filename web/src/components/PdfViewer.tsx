import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface PdfViewerProps {
  pdfData: ArrayBuffer | null;
  fileName: string;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({ pdfData, fileName }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !pdfData) return;

    let cancelled = false;
    setRendering(true);
    setRenderError(null);
    container.innerHTML = '';

    (async () => {
      try {
        const copy = pdfData.slice(0);
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(copy) });
        const pdf = await loadingTask.promise;
        if (cancelled) return;
        setPageCount(pdf.numPages);

        const availableWidth = Math.max(260, (container.clientWidth || 340) - 24);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          if (cancelled) return;
          const page = await pdf.getPage(pageNum);
          const unscaledViewport = page.getViewport({ scale: 1 });
          const cssScale = Math.min(1.6, availableWidth / unscaledViewport.width);
          const viewport = page.getViewport({ scale: cssScale });

          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;

          canvas.width = Math.floor(viewport.width * dpr);
          canvas.height = Math.floor(viewport.height * dpr);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;
          canvas.style.display = 'block';
          canvas.style.margin = '0 auto 12px auto';
          canvas.style.borderRadius = '8px';
          canvas.style.background = '#ffffff';
          canvas.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.35)';

          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          if (!cancelled) {
            container.appendChild(canvas);
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          setRenderError(err?.message || 'Unable to render PDF pages');
        }
      } finally {
        if (!cancelled) {
          setRendering(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfData, fileName]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        padding: '12px',
        boxSizing: 'border-box',
        background: '#0f172a',
      }}
    >
      {rendering && (
        <div className="text-xs text-slate-400 text-center py-2">
          Rendering {pageCount > 0 ? `${pageCount} page(s)` : 'PDF'}...
        </div>
      )}
      {renderError && (
        <div className="text-xs text-amber-300 text-center py-3">{renderError}</div>
      )}
      <div ref={containerRef} style={{ width: '100%' }} />
    </div>
  );
};
