import * as DocumentPicker from 'expo-document-picker';
import { File as FsFile } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { docxToTxt, epubToTxt, fb2ToTxt } from './convert';
import {
  detectBookType,
  ensureUploadsDir,
  getTextStats,
  readBinaryFromUri,
  readTextFromUri,
  sanitizeFileName,
  type BookType,
  type TextStats,
} from './filesystem';

export type PickedBook = {
  uri: string;
  name: string;
  extension: BookType;
};

export type ConvertResult = {
  text: string;
  stats: TextStats;
  outputPath: string;
  outputName: string;
};

export type PickResult =
  | { type: 'canceled' }
  | { type: 'picked'; file: PickedBook }
  | { type: 'unsupported'; name: string };

export async function pickBookFile(): Promise<PickResult> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: false,
    multiple: false,
    type: '*/*',
  });
  if (result.canceled) {
    return { type: 'canceled' };
  }
  const asset = result.assets?.[0];
  if (!asset) {
    return { type: 'canceled' };
  }

  const name =
    asset.name ??
    decodeURIComponent(asset.uri.split('/').pop() || '') ??
    'book';
  const extension = detectBookType(name, asset.mimeType, asset.uri);
  if (!extension) {
    return { type: 'unsupported', name };
  }

  const safeName = sanitizeFileName(name) || `book.${extension}`;
  const cachedUri = `${FileSystem.cacheDirectory}picked-${Date.now()}-${safeName}`;
  const cached = new FsFile(cachedUri);
  try {
    await new FsFile(asset.uri).copy(cached);
  } catch (error) {
    try {
      await FileSystem.copyAsync({ from: asset.uri, to: cachedUri });
    } catch (copyError) {
    }
  }

  const uri = cached.exists ? cached.uri : asset.uri;
  return { type: 'picked', file: { uri, name, extension } };
}

export async function convertFile(file: PickedBook): Promise<ConvertResult> {
  const text =
    file.extension === 'epub'
      ? await epubToTxt(await readBinaryFromUri(file.uri))
      : file.extension === 'docx'
        ? await docxToTxt(await readBinaryFromUri(file.uri))
        : fb2ToTxt(await readTextFromUri(file.uri));

  if (!text.trim()) {
    throw new Error('Из файла не удалось извлечь текст');
  }

  const dir = await ensureUploadsDir();
  const base = file.name.replace(/\.[^.]+$/, '') || 'book';
  const outputName = `${base}.txt`;
  const outputPath = dir + outputName;
  await FileSystem.writeAsStringAsync(outputPath, text, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  return { text, stats: getTextStats(text), outputPath, outputName };
}

export async function shareTextFile(uri: string): Promise<'shared' | 'unavailable'> {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    return 'unavailable';
  }
  await Sharing.shareAsync(uri, {
    mimeType: 'text/plain',
    dialogTitle: 'Поделиться TXT',
    UTI: 'public.plain-text',
  });
  return 'shared';
}
