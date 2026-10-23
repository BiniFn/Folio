/**
 * Pure Web-standard EPUB parser using native DecompressionStream.
 * Zero external dependencies. Fast, robust, and handles EPUB 2 & 3.
 */

export interface ParsedEpubChapter {
  id: string;
  title: string;
  href: string;
  html: string;
  textSnippet: string;
}

export interface ParsedEpub {
  title: string;
  author: string;
  coverDataUrl?: string;
  chapters: ParsedEpubChapter[];
  toc: { id: string; title: string; href: string }[];
}

export async function parseEpub(buffer: ArrayBuffer): Promise<ParsedEpub> {
  const files = await unzipArchive(buffer);

  // 1. Locate container.xml
  const containerXml = files.get('META-INF/container.xml');
  if (!containerXml) {
    throw new Error('Invalid EPUB: META-INF/container.xml missing');
  }

  const parser = new DOMParser();
  const containerDoc = parser.parseFromString(new TextDecoder().decode(containerXml), 'application/xml');
  const rootfile = containerDoc.querySelector('rootfile');
  const opfPath = rootfile?.getAttribute('full-path');

  if (!opfPath) {
    throw new Error('Invalid EPUB: rootfile not found in container.xml');
  }

  const opfBytes = files.get(opfPath);
  if (!opfBytes) {
    throw new Error(`Invalid EPUB: OPF package not found at ${opfPath}`);
  }

  // 2. Parse OPF
  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';
  const opfDoc = parser.parseFromString(new TextDecoder().decode(opfBytes), 'application/xml');

  const title = opfDoc.querySelector('metadata > title, metadata > dc\\:title')?.textContent?.trim() || 'Untitled';
  const author = opfDoc.querySelector('metadata > creator, metadata > dc\\:creator')?.textContent?.trim() || 'Unknown Author';

  // Manifest items
  const manifestItems = new Map<string, { href: string; mediaType: string }>();
  opfDoc.querySelectorAll('manifest > item').forEach((item) => {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    const mediaType = item.getAttribute('media-type') || '';
    if (id && href) {
      manifestItems.set(id, { href: resolvePath(opfDir, href), mediaType });
    }
  });

  // Spine items
  const spineIds: string[] = [];
  opfDoc.querySelectorAll('spine > itemref').forEach((itemref) => {
    const idref = itemref.getAttribute('idref');
    if (idref) spineIds.push(idref);
  });

  // TOC items from NCX or Nav
  const toc: { id: string; title: string; href: string }[] = [];
  const ncxItem = Array.from(manifestItems.values()).find(m => m.mediaType.includes('x-dtbncx+xml'));
  if (ncxItem && files.has(ncxItem.href)) {
    const ncxDoc = parser.parseFromString(new TextDecoder().decode(files.get(ncxItem.href)!), 'application/xml');
    ncxDoc.querySelectorAll('navPoint').forEach(np => {
      const text = np.querySelector('navLabel > text')?.textContent?.trim() || 'Chapter';
      const content = np.querySelector('content')?.getAttribute('src') || '';
      const id = np.getAttribute('id') || content;
      if (content) {
        toc.push({ id, title: text, href: resolvePath(opfDir, content.split('#')[0]) });
      }
    });
  }

  // 3. Process Chapters
  const chapters: ParsedEpubChapter[] = [];

  for (let i = 0; i < spineIds.length; i++) {
    const id = spineIds[i];
    const manifestItem = manifestItems.get(id);
    if (!manifestItem) continue;

    const fileBytes = files.get(manifestItem.href);
    if (!fileBytes) continue;

    let html = new TextDecoder('utf-8').decode(fileBytes);
    const chapterDoc = parser.parseFromString(html, 'text/html');

    // Extract title
    let chapterTitle = '';
    const matchingToc = toc.find(t => t.href === manifestItem.href);
    if (matchingToc) {
      chapterTitle = matchingToc.title;
    } else {
      const header = chapterDoc.querySelector('h1, h2, h3, title');
      chapterTitle = header?.textContent?.trim() || `Section ${i + 1}`;
    }

    // Inline images from the zip as Data URLs or Object URLs
    chapterDoc.querySelectorAll('img, image').forEach(img => {
      const srcAttr = img.getAttribute('src') || img.getAttribute('xlink:href');
      if (srcAttr && !srcAttr.startsWith('http') && !srcAttr.startsWith('data:')) {
        const chapterDir = manifestItem.href.includes('/') ? manifestItem.href.substring(0, manifestItem.href.lastIndexOf('/') + 1) : '';
        const imgPath = resolvePath(chapterDir, srcAttr.split('#')[0]);
        const imgBytes = files.get(imgPath);
        if (imgBytes) {
          const mime = imgPath.endsWith('.png') ? 'image/png' : imgPath.endsWith('.svg') ? 'image/svg+xml' : 'image/jpeg';
          const blob = new Blob([imgBytes], { type: mime });
          const url = URL.createObjectURL(blob);
          if (img.tagName.toLowerCase() === 'image') {
            img.setAttribute('xlink:href', url);
          } else {
            img.setAttribute('src', url);
          }
        }
      }
    });

    const bodyContent = chapterDoc.body?.innerHTML || html;
    const plainText = chapterDoc.body?.textContent?.trim() || '';

    // Only add chapters that have meaningful text or images
    if (plainText.length > 10 || chapterDoc.querySelectorAll('img').length > 0) {
      chapters.push({
        id,
        title: chapterTitle,
        href: manifestItem.href,
        html: bodyContent,
        textSnippet: plainText.substring(0, 150),
      });
    }
  }

  // Cover image
  let coverDataUrl: string | undefined;
  const coverItem = Array.from(manifestItems.values()).find(m => m.href.toLowerCase().includes('cover') && m.mediaType.startsWith('image/'));
  if (coverItem && files.has(coverItem.href)) {
    const bytes = files.get(coverItem.href)!;
    const mime = coverItem.mediaType || 'image/jpeg';
    const blob = new Blob([bytes], { type: mime });
    coverDataUrl = URL.createObjectURL(blob);
  }

  return {
    title,
    author,
    coverDataUrl,
    chapters,
    toc: toc.length > 0 ? toc : chapters.map(c => ({ id: c.id, title: c.title, href: c.href })),
  };
}

function resolvePath(baseDir: string, relativePath: string): string {
  if (relativePath.startsWith('/')) return relativePath.slice(1);
  const parts = (baseDir + relativePath).split('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') resolved.pop();
    else resolved.push(part);
  }
  return resolved.join('/');
}

/**
 * Unzips an ArrayBuffer using native DecompressionStream('deflate-raw')
 */
async function unzipArchive(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const map = new Map<string, Uint8Array>();
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let offset = 0;

  while (offset + 30 <= buffer.byteLength) {
    const signature = view.getUint32(offset, true);
    if (signature !== 0x04034b50) {
      // Central directory or end
      break;
    }

    const compressionMethod = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const uncompressedSize = view.getUint32(offset + 22, true);
    const fileNameLength = view.getUint16(offset + 26, true);
    const extraFieldLength = view.getUint16(offset + 28, true);

    const fileNameBytes = bytes.subarray(offset + 30, offset + 30 + fileNameLength);
    const fileName = new TextDecoder('utf-8').decode(fileNameBytes);

    const dataStart = offset + 30 + fileNameLength + extraFieldLength;
    const dataEnd = dataStart + compressedSize;

    if (dataEnd <= buffer.byteLength) {
      const compressedData = bytes.subarray(dataStart, dataEnd);

      if (compressionMethod === 0) {
        // Stored / uncompressed
        map.set(fileName, compressedData);
      } else if (compressionMethod === 8) {
        // Deflate
        try {
          const ds = new DecompressionStream('deflate-raw');
          const writer = ds.writable.getWriter();
          writer.write(compressedData);
          writer.close();

          const reader = ds.readable.getReader();
          const chunks: Uint8Array[] = [];
          let totalLen = 0;

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(value);
              totalLen += value.length;
            }
          }

          const decompressed = new Uint8Array(totalLen);
          let cur = 0;
          for (const chunk of chunks) {
            decompressed.set(chunk, cur);
            cur += chunk.length;
          }
          map.set(fileName, decompressed);
        } catch (err) {
          console.warn(`Could not decompress file ${fileName}:`, err);
        }
      }
    }

    offset = dataEnd;
  }

  return map;
}
