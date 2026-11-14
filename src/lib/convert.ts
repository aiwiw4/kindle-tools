import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { parseDocument } from 'htmlparser2';
import { isTag } from 'domhandler';
import { textContent } from 'domutils';

const SKIP_TAGS = ['script', 'style', 'nav', 'header', 'footer', 'aside'];
const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
const BLOCK_TAGS = ['p', 'div'];

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

export function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function extractTag(html: string, tag: string): string | null {
  const match = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? stripTags(match[1]) : null;
}

export function extractParagraphs(html: string): string[] {
  const paragraphs: string[] = [];
  const paragraphRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match = paragraphRegex.exec(html);
  while (match !== null) {
    const text = stripTags(match[1]);
    if (text) {
      paragraphs.push(text);
    }
    match = paragraphRegex.exec(html);
  }
  if (paragraphs.length === 0) {
    const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (body) {
      paragraphs.push(
        ...body[1]
          .split('\n')
          .map((line) => stripTags(line))
          .filter(Boolean)
      );
    }
  }
  return paragraphs;
}

export function fb2ToTxt(fb2: string): string {
  const lines: string[] = [];
  const title = extractTag(fb2, 'book-title');
  if (title) {
    lines.push('Название: ' + title);
  }
  const authorMatch = fb2.match(/<author[^>]*>([\s\S]*?)<\/author>/i);
  const authorBlock = authorMatch ? authorMatch[1] : null;
  if (authorBlock) {
    const author = [extractTag(authorBlock, 'first-name'), extractTag(authorBlock, 'last-name')]
      .filter(Boolean)
      .join(' ');
    if (author) {
      lines.push('Автор: ' + author);
    }
  }
  if (lines.length > 0) {
    lines.push('='.repeat(50) + '\n');
  }
  lines.push(...extractParagraphs(fb2));
  return lines.join('\n\n');
}

export function cleanText(text: string): string {
  return text
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .replace(/^\s+/gm, '')
    .replace(/\s+$/gm, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .trim();
}

export function extractTextFromHtml(html: string): string {
  const document = parseDocument(html);
  const parts: string[] = [];

  const walk = (node: any) => {
    if (!isTag(node)) {
      return;
    }
    if (SKIP_TAGS.includes(node.name)) {
      return;
    }
    if (HEADING_TAGS.includes(node.name)) {
      const text = textContent(node).trim();
      if (text) {
        parts.push('\n' + text);
      }
      return;
    }
    if (BLOCK_TAGS.includes(node.name)) {
      const text = cleanText(textContent(node));
      if (text) {
        parts.push(text);
      }
      return;
    }
    node.children.forEach(walk);
  };

  document.children.forEach(walk);

  if (parts.length === 0) {
    const text = cleanText(textContent(document));
    if (text) {
      parts.push(text);
    }
  }

  return parts.join('\n\n');
}

function getMetadataValue(metadata: any, key: string): string | null {
  const value = metadata ? metadata[key] : null;
  if (!value) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'object' && value !== null && '#text' in value) {
    return String(value['#text']);
  }
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];
    if (typeof first === 'string') {
      return first;
    }
    if (typeof first === 'object' && first !== null && '#text' in first) {
      return String(first['#text']);
    }
  }
  return null;
}

export async function epubToTxt(binary: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(binary);
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

  const containerFile = zip.file('META-INF/container.xml');
  if (!containerFile) {
    throw new Error('Некорректный EPUB: нет container.xml');
  }
  const container = parser.parse(await containerFile.async('string'));
  const rootfile = asArray(container?.container?.rootfiles?.rootfile)[0];
  const opfPath = rootfile?.['@_full-path'];
  if (!opfPath) {
    throw new Error('Некорректный EPUB: не найден rootfile');
  }
  const opfFile = zip.file(opfPath);
  if (!opfFile) {
    throw new Error('Некорректный EPUB: не найден OPF файл');
  }

  const opf = parser.parse(await opfFile.async('string'));
  const metadata = opf?.package?.metadata ?? {};
  const manifest = asArray(opf?.package?.manifest?.item);
  const spine = asArray(opf?.package?.spine?.itemref);
  const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';

  const lines: string[] = [];
  const title = getMetadataValue(metadata, 'dc:title') ?? getMetadataValue(metadata, 'title');
  const creator =
    getMetadataValue(metadata, 'dc:creator') ?? getMetadataValue(metadata, 'creator');
  if (title) {
    lines.push('Название: ' + title);
  }
  if (creator) {
    lines.push('Автор: ' + creator);
  }
  if (title || creator) {
    lines.push('='.repeat(50) + '\n');
  }

  const hrefById = new Map<string, string>();
  for (const item of manifest) {
    if (item?.['@_id'] && item?.['@_href']) {
      hrefById.set(item['@_id'], item['@_href']);
    }
  }

  for (const ref of spine) {
    const idref = ref?.['@_idref'];
    if (!idref) {
      continue;
    }
    const href = hrefById.get(idref);
    if (!href) {
      continue;
    }
    const file = zip.file(base + href) ?? zip.file(href);
    if (!file) {
      continue;
    }
    const text = extractTextFromHtml(await file.async('string'));
    if (text) {
      lines.push(text);
    }
  }

  if (lines.length === 0) {
    throw new Error('Не удалось извлечь текст из EPUB');
  }
  return lines.join('\n\n');
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

export async function docxToTxt(binary: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(binary);
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) {
    throw new Error('Некорректный DOCX: нет word/document.xml');
  }

  const xml = await documentFile.async('string');
  const withBreaks = xml
    .replace(/<w:tab[^>]*\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<w:cr[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n\n')
    .replace(/<\/w:tc>/g, '\t')
    .replace(/<\/w:tr>/g, '\n')
    .replace(/<[^>]+>/g, '');

  const body = decodeXmlEntities(withBreaks)
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  const lines: string[] = [];
  const coreFile = zip.file('docProps/core.xml');
  if (coreFile) {
    try {
      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
      const core = parser.parse(await coreFile.async('string'));
      const root = core?.['cp:coreProperties'] ?? core ?? {};
      const title = getMetadataValue(root, 'dc:title');
      const creator = getMetadataValue(root, 'dc:creator');
      if (title) {
        lines.push('Название: ' + title);
      }
      if (creator) {
        lines.push('Автор: ' + creator);
      }
      if (title || creator) {
        lines.push('='.repeat(50) + '\n');
      }
    } catch {}
  }

  lines.push(body);
  return lines.join('\n\n');
}
