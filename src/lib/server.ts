import { Buffer } from 'buffer';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { NativeModules } from 'react-native';

import {
  ensureUploadsDir,
  isTxtFile,
  listUploadFiles,
  type UploadFile,
} from './filesystem';
import { DEFAULT_PORT, isValidPort, readSettings, updateSettings } from './settings';

const EXPO_GO_ERROR =
  'HTTP-сервер не работает в Expo Go. Соберите dev build: npx expo run:android';

let server: any = null;
let active = false;
let serverPort = DEFAULT_PORT;

function loadTcpSocket(): any {
  try {
    return require('react-native-tcp-socket');
  } catch {
    throw new Error(EXPO_GO_ERROR);
  }
}

export function isExpoGo(): boolean {
  const constants = Constants as any;
  return (
    constants.appOwnership === 'expo' ||
    constants.executionEnvironment === 'storeClient'
  );
}

export function hasTcpModule(): boolean {
  return NativeModules.TcpSockets != null;
}

export function isServerSupported(): boolean {
  return !isExpoGo() && hasTcpModule();
}

export function getServerInstance(): any {
  return server;
}

export function isServerActive(): boolean {
  return active;
}

export function getServerPort(): number {
  return serverPort;
}

export async function loadServerPort(): Promise<number> {
  const settings = await readSettings();
  serverPort = settings.port;
  return serverPort;
}

export async function updateServerPort(port: number): Promise<number> {
  if (!isValidPort(port)) {
    throw new Error('Порт должен быть от 1024 до 65535');
  }
  await updateSettings({ port });
  serverPort = port;
  return serverPort;
}

export function getServerOrigin(): string {
  return active ? `http://0.0.0.0:${serverPort}` : '';
}

export async function startFileServer(): Promise<string> {
  if (isExpoGo() || !hasTcpModule()) {
    throw new Error(EXPO_GO_ERROR);
  }
  const settings = await readSettings();
  serverPort = settings.port;
  if (server) {
    return `http://0.0.0.0:${serverPort}`;
  }
  const net = loadTcpSocket();
  const instance = net.createServer(attachClientHandler);
  if (!instance || typeof instance.listen !== 'function') {
    throw new Error(EXPO_GO_ERROR);
  }
  server = instance;
  try {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: unknown) => {
        try {
          server?.off?.('error', onError);
        } catch {}
        reject(error);
      };
      server.on('error', onError);
      server.listen(
        { port: serverPort, host: '0.0.0.0', reuseAddress: true },
        () => {
          try {
            server?.off?.('error', onError);
          } catch {}
          resolve();
        }
      );
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      server?.close?.();
    } catch {}
    server = null;
    if (/listen|TcpSockets|NativeEventEmitter|non-null|null/i.test(message)) {
      throw new Error(EXPO_GO_ERROR);
    }
    throw error;
  }
  active = true;
  return `http://0.0.0.0:${serverPort}`;
}

export async function stopFileServer(): Promise<void> {
  if (!server) {
    active = false;
    return;
  }
  const current = server;
  await new Promise<void>((resolve) => {
    if (!current) {
      resolve();
      return;
    }
    current.close(() => resolve());
  });
  server = null;
  active = false;
}

function parsePath(request: string): string {
  const firstLine = request.split(/\r?\n/)[0] ?? '';
  const target = firstLine.split(' ')[1] ?? '/';
  try {
    return decodeURIComponent(target.split('?')[0] || '/');
  } catch {
    return target.split('?')[0] || '/';
  }
}

function rawTarget(request: string): string {
  const firstLine = request.split(/\r?\n/)[0] ?? '';
  return firstLine.split(' ')[1] ?? '/';
}

function queryValue(request: string, key: string): string {
  const target = rawTarget(request);
  const index = target.indexOf('?');
  if (index === -1) {
    return '';
  }
  for (const pair of target.slice(index + 1).split('&')) {
    const eq = pair.indexOf('=');
    if (eq !== -1 && pair.slice(0, eq) === key) {
      return pair.slice(eq + 1);
    }
  }
  return '';
}

function decodeNameList(raw: string): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    });
}

function buildListingHtml(files: UploadFile[]): string {
  const items = files
    .map(
      (file) =>
        `<li><a href="/${encodeURIComponent(file.name)}">${file.name}</a> (${file.size} байт)</li>`
    )
    .join('\n');
  const allNames = files.map((file) => encodeURIComponent(file.name)).join(',');
  const controls = files.length
    ? `<hr>\n<p><a href="/seq?list=${allNames}&i=0">Скачать все</a></p>`
    : '';
  return (
    '<!DOCTYPE html>\n<html>\n<head><meta charset="UTF-8"><title>Файлы для скачивания</title></head>\n<body>\n<h1>Файлы для скачивания:</h1>\n<ul>\n' +
    (items || '<li>Нет файлов</li>') +
    '\n</ul>\n' +
    controls +
    '\n<hr>\n<p>Нажмите на файл для скачивания</p>\n</body>\n</html>'
  );
}

function writeResponse(
  socket: any,
  statusCode: number,
  statusText: string,
  headers: Record<string, string>,
  body: Buffer
): void {
  const headerLines = Object.entries(headers)
    .map(([name, value]) => `${name}: ${value}`)
    .join('\r\n');
  const head =
    `HTTP/1.1 ${statusCode} ${statusText}\r\n` +
    headerLines +
    `\r\nContent-Length: ${body.length}\r\n` +
    'Connection: close\r\n\r\n';
  socket.end(Buffer.concat([Buffer.from(head, 'utf8'), body]));
}

function sendText(
  socket: any,
  statusCode: number,
  statusText: string,
  contentType: string,
  text: string
): void {
  writeResponse(socket, statusCode, statusText, { 'Content-Type': contentType }, Buffer.from(text, 'utf8'));
}

function sendFile(socket: any, name: string, base64: string): void {
  writeResponse(
    socket,
    200,
    'OK',
    {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${name.replace(/"/g, '')}"`,
    },
    Buffer.from(base64, 'base64')
  );
}

function buildSequentialHtml(list: string, index: number, names: string[]): string {
  const total = names.length;
  if (index >= total) {
    const links = names
      .map((name) => `<li><a href="/${encodeURIComponent(name)}">${name}</a></li>`)
      .join('\n');
    return (
      '<!DOCTYPE html>\n<html>\n<head><meta charset="UTF-8"><meta http-equiv="refresh" content="3;url=/"><title>Готово</title></head>\n<body>\n<h1>Готово</h1>\n<p><a href="/">На главную</a></p>\n<ul>\n' +
      links +
      '\n</ul>\n</body>\n</html>'
    );
  }
  const name = names[index];
  const next = `/seq?list=${list}&i=${index + 1}`;
  const href = `/${encodeURIComponent(name)}`;
  return (
    '<!DOCTYPE html>\n<html>\n<head><meta charset="UTF-8"><meta http-equiv="refresh" content="4;url=' +
    next +
    '"><title>' +
    (index + 1) +
    '/' +
    total +
    '</title></head>\n<body>\n<h1>' +
    (index + 1) +
    '/' +
    total +
    ': ' +
    name +
    '</h1>\n<p><a href="' +
    href +
    '">Скачать ' +
    name +
    '</a></p>\n<iframe src="' +
    href +
    '" style="display:none"></iframe>\n<p>Переход к следующему файлу...</p>\n</body>\n</html>'
  );
}

async function handleRequest(socket: any, request: string): Promise<void> {
  const path = parsePath(request);

  if (path === '/seq') {
    const list = queryValue(request, 'list');
    const names = decodeNameList(list).filter((name) => isTxtFile(name));
    if (names.length === 0) {
      sendText(socket, 404, 'Not Found', 'text/plain; charset=utf-8', 'Файл не найден');
      return;
    }
    const index = Number(queryValue(request, 'i') || '0');
    sendText(
      socket,
      200,
      'OK',
      'text/html; charset=utf-8',
      buildSequentialHtml(list, Number.isFinite(index) ? index : 0, names)
    );
    return;
  }
  const dir = await ensureUploadsDir();

  if (path === '/' || path === '') {
    const files = (await listUploadFiles()).filter((file) => isTxtFile(file.name));
    sendText(socket, 200, 'OK', 'text/html; charset=utf-8', buildListingHtml(files));
    return;
  }

  const name = path.replace(/^\//, '').split('/').pop() ?? '';
  if (!name || name.includes('..')) {
    sendText(socket, 400, 'Bad Request', 'text/plain; charset=utf-8', 'Некорректный путь');
    return;
  }
  if (!isTxtFile(name)) {
    sendText(socket, 404, 'Not Found', 'text/plain; charset=utf-8', 'Файл не найден');
    return;
  }

  const uri = dir + name;
  const info = await FileSystem.getInfoAsync(uri);
  if (info.exists && !info.isDirectory) {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    sendFile(socket, name, base64);
    return;
  }

  sendText(socket, 404, 'Not Found', 'text/plain; charset=utf-8', 'Файл не найден');
}

function attachClientHandler(socket: any): void {
  let buffer = '';
  let handled = false;

  const onData = (chunk: any) => {
    if (handled) {
      return;
    }
    buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');

    const terminator =
      buffer.indexOf('\r\n\r\n') !== -1 || buffer.indexOf('\n\n') !== -1;
    const looksLikeRequest = /^(GET|HEAD|POST|OPTIONS)\s+/m.test(buffer);

    if (!looksLikeRequest) {
      if (buffer.length < 4096) {
        return;
      }
    } else if (!terminator && buffer.length < 8192) {
      return;
    }

    handled = true;
    socket.off('data', onData);
    socket.setTimeout(0);
    handleRequest(socket, buffer).catch(() => {
      try {
        sendText(
          socket,
          500,
          'Internal Server Error',
          'text/plain; charset=utf-8',
          'Ошибка сервера'
        );
      } catch {
        try {
          socket.destroy();
        } catch {}
      }
    });
  };

  socket.on('data', onData);
  socket.on('error', () => socket.destroy());
  socket.setTimeout(30000, () => {
    if (!handled) {
      socket.destroy();
    }
  });
}
