import * as FileSystem from 'expo-file-system/legacy';

import { getUploadsDirUri, listUploadFiles, renameUploadFile } from './filesystem';
import { readRawSettings, updateSettings } from './settings';

async function detectNextNumber(): Promise<number> {
  try {
    const files = await listUploadFiles();
    let max = 0;
    for (const file of files) {
      const match = file.name.match(/^(\d+)\.txt$/i);
      if (match) {
        max = Math.max(max, Number(match[1]));
      }
    }
    return max + 1;
  } catch {
    return 1;
  }
}

export async function getNextNumber(): Promise<number> {
  const stored = await readRawSettings();
  if (stored.nextNumber && Number.isFinite(stored.nextNumber) && stored.nextNumber > 0) {
    return stored.nextNumber;
  }
  const detected = await detectNextNumber();
  await updateSettings({ nextNumber: detected });
  return detected;
}

export async function setNextNumber(value: number): Promise<void> {
  await updateSettings({ nextNumber: Math.max(1, Math.floor(value)) });
}

export function numberFromName(name: string): number | null {
  const match = name.match(/^(\d+)\.txt$/i);
  return match ? Number(match[1]) : null;
}

export async function bumpCounterForName(name: string): Promise<void> {
  const number = numberFromName(name);
  if (number === null) {
    return;
  }
  const next = await getNextNumber();
  if (number >= next) {
    await setNextNumber(number + 1);
  }
}

export async function renumberTxtFiles(): Promise<number> {
  const files = (await listUploadFiles()).filter((file) => /\.txt$/i.test(file.name));
  const dir = getUploadsDirUri();
  let next = await getNextNumber();
  let renamed = 0;

  for (const file of files) {
    if (/^\d+\.txt$/i.test(file.name)) {
      continue;
    }
    while ((await FileSystem.getInfoAsync(dir + `${next}.txt`)).exists) {
      next += 1;
    }
    await renameUploadFile(file.uri, `${next}.txt`);
    renamed += 1;
    next += 1;
  }

  await setNextNumber(next);
  return renamed;
}

export async function syncCounterWithFiles(): Promise<number> {
  const stored = await getNextNumber();
  const detected = await detectNextNumber();
  const next = Math.max(stored, detected);
  if (next !== stored) {
    await setNextNumber(next);
  }
  return next;
}
