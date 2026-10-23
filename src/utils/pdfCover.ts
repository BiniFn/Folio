/**
 * Extracts the first page of a PDF file as a high-resolution JPEG Data URL
 * using browser-native Canvas and PDF.js.
 */
export async function extractPdfCover(buffer: ArrayBuffer): Promise<string | null> {
  try {
    if (!buffer || buffer.byteLength === 0 || (buffer as any).detached) {
      return null;
    }

    const pdfjs = (window as any).pdfjsLib;
    if (!pdfjs) return null;

    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    // Always clone with slice(0) so the main buffer is never detached by worker transfer
    const cloned = buffer.slice(0);
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(cloned),
      cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
      cMapPacked: true,
    });

    const pdf = await loadingTask.promise;
    if (pdf.numPages < 1) return null;

    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.5 }); // High-DPI cover thumbnail
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL('image/jpeg', 0.88);
  } catch (err) {
    console.warn('PDF cover extraction encountered an issue, skipping:', err);
    return null;
  }
}
