import * as FileSystem from 'expo-file-system/legacy';

export type AppSettings = {
  nextNumber: number;
  port: number;
};

export const DEFAULT_PORT = 8000;

const defaults: AppSettings = {
  nextNumber: 1,
  port: DEFAULT_PORT,
};

function settingsUri(): string {
  if (!FileSystem.documentDirectory) {
    throw new Error('documentDirectory недоступен на этой платформе');
  }
  return FileSystem.documentDirectory + 'kindle-tools-settings.json';
}

export async function readRawSettings(): Promise<Partial<AppSettings>> {
  try {
    const info = await FileSystem.getInfoAsync(settingsUri());
    if (!info.exists) {
      return {};
    }
    const raw = await FileSystem.readAsStringAsync(settingsUri(), {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return JSON.parse(raw) as Partial<AppSettings>;
  } catch {
    return {};
  }
}

export async function readSettings(): Promise<AppSettings> {
  const stored = await readRawSettings();
  return { ...defaults, ...stored };
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const next = { ...(await readSettings()), ...patch };
  await FileSystem.writeAsStringAsync(settingsUri(), JSON.stringify(next), {
    encoding: FileSystem.EncodingType.UTF8,
  });
  return next;
}

export function isValidPort(value: number): boolean {
  return Number.isInteger(value) && value >= 1024 && value <= 65535;
}
