import { File as FsFile } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';

export type UploadFile = {
  name: string;
  uri: string;
  size: number;
};

export type TextStats = {
  paragraphs: number;
  lines: number;
  words: number;
};

export function getUploadsDirUri(): string {
  if (!FileSystem.documentDirectory) {
    throw new Error('documentDirectory недоступен на этой платформе');
  }
  return FileSystem.documentDirectory + 'uploads/';
}

export async function ensureUploadsDir(): Promise<string> {
  const dir = getUploadsDirUri();
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
}

export async function clearUploadsDir(): Promise<void> {
  const dir = getUploadsDirUri();
  const info = await FileSystem.getInfoAsync(dir);
  if (info.exists) {
    await FileSystem.deleteAsync(dir, { idempotent: true });
  }
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
}

export async function listUploadFiles(): Promise<UploadFile[]> {
  const dir = await ensureUploadsDir();
  const names = await FileSystem.readDirectoryAsync(dir);
  const files: UploadFile[] = [];
  for (const name of names) {
    const uri = dir + name;
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && !info.isDirectory) {
      files.push({
        name,
        uri,
        size: typeof info.size === 'number' ? info.size : 0,
      });
    }
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

export async function copyToUploads(sourceUri: string, rawName: string): Promise<string> {
  const name = sanitizeFileName(rawName) || `file-${Date.now()}.txt`;
  const destUri = (await ensureUploadsDir()) + name;
  let lastError: unknown = null;

  try {
    await new FsFile(sourceUri).copy(new FsFile(destUri), { overwrite: true });
    if ((await FileSystem.getInfoAsync(destUri)).exists) {
      return destUri;
    }
  } catch (error) {
    lastError = error;
  }

  try {
    await FileSystem.copyAsync({ from: sourceUri, to: destUri });
    if ((await FileSystem.getInfoAsync(destUri)).exists) {
      return destUri;
    }
  } catch (error) {
    lastError = error;
  }

  try {
    const base64 = await FileSystem.readAsStringAsync(sourceUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    await FileSystem.writeAsStringAsync(destUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if ((await FileSystem.getInfoAsync(destUri)).exists) {
      return destUri;
    }
  } catch (error) {
    lastError = error;
  }

  throw new Error(
    lastError instanceof Error && lastError.message
      ? lastError.message
      : 'Не удалось добавить файл'
  );
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim();
}

export async function renameUploadFile(fromUri: string, newName: string): Promise<string> {
  const sanitized = sanitizeFileName(newName);
  if (!sanitized) {
    throw new Error('Имя файла не может быть пустым');
  }
  if (sanitized.includes('..') || sanitized.includes('/')) {
    throw new Error('Некорректное имя файла');
  }
  const dir = await ensureUploadsDir();
  const to = dir + sanitized;
  const currentName = fromUri.slice(fromUri.lastIndexOf('/') + 1);
  if (sanitized === currentName) {
    return to;
  }
  const info = await FileSystem.getInfoAsync(to);
  if (info.exists) {
    throw new Error('Файл с таким именем уже существует');
  }
  await FileSystem.moveAsync({ from: fromUri, to });
  return to;
}

export function toNativePath(uri: string): string {
  if (uri.startsWith('file:///')) {
    return decodeURI(uri.slice(7));
  }
  if (uri.startsWith('file://')) {
    return decodeURI(uri.slice(5));
  }
  return uri;
}

export function getTextStats(text: string): TextStats {
  const paragraphs = text.split(/\n\s*\n/).filter((value) => value.trim()).length;
  const lines = text.split('\n').length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return { paragraphs, lines, words };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} байт`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} КБ`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export async function readBinaryFromUri(uri: string): Promise<ArrayBuffer> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function readTextFromUri(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
}

export type BookType = 'epub' | 'fb2' | 'docx';

export function detectBookType(
  name: string,
  mimeType: string | null | undefined,
  uri: string | null | undefined
): BookType | null {
  const lowerName = name.toLowerCase();
  const lowerUri = uri ? uri.toLowerCase() : '';
  if (lowerName.endsWith('.epub') || lowerUri.includes('.epub')) {
    return 'epub';
  }
  if (lowerName.endsWith('.fb2') || lowerUri.includes('.fb2')) {
    return 'fb2';
  }
  if (lowerName.endsWith('.docx') || lowerUri.includes('.docx')) {
    return 'docx';
  }
  if (mimeType === 'application/epub+zip') {
    return 'epub';
  }
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return 'docx';
  }
  if (
    (mimeType && mimeType.includes('fictionbook')) ||
    mimeType === 'text/xml' ||
    mimeType === 'application/xml'
  ) {
    return 'fb2';
  }
  return null;
}

export function isTxtFile(name: string): boolean {
  return name.toLowerCase().endsWith('.txt');
}
