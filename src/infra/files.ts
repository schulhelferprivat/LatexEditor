import { defaultConfig, simplifyConfig, stem, validateConfig, type Configuration } from '../domain/types';
export const fileTypes = [{ description: 'LaTeX-Dokument', accept: { 'application/x-tex': ['.tex'] } }];
export async function permission(handle: FileSystemHandle, mode: 'read' | 'readwrite' = 'readwrite') {
  if (
    (await handle.queryPermission({ mode })) !== 'granted' &&
    (await handle.requestPermission({ mode })) !== 'granted'
  )
    throw new Error('Dateizugriff wurde nicht freigegeben.');
}
export async function write(handle: FileSystemFileHandle, data: string | Blob) {
  const stream = await handle.createWritable();
  try {
    await stream.write(data);
    await stream.close();
  } catch (error) {
    await stream.abort().catch(() => {});
    throw error;
  }
}
export class ConflictError extends Error {
  constructor(public file: string) {
    super(`„${file}“ wurde außerhalb der App geändert. Bitte neu laden oder ausdrücklich überschreiben.`);
  }
}
export async function readConfig(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<{ config: Configuration; raw: string | null }> {
  try {
    const raw = await (await (await dir.getFileHandle(`${stem(name)}.latexapp.json`)).getFile()).text();
    return { config: simplifyConfig(validateConfig(JSON.parse(raw))), raw };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError')
      return { config: defaultConfig(), raw: null };
    throw error;
  }
}
export async function optionalText(dir: FileSystemDirectoryHandle, name: string) {
  try {
    return await (await (await dir.getFileHandle(name)).getFile()).text();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return null;
    throw error;
  }
}
export async function collectFiles(dir: FileSystemDirectoryHandle): Promise<{ path: string; file: File }[]> {
  const result: { path: string; file: File }[] = [];
  let size = 0;
  async function visit(folder: FileSystemDirectoryHandle, prefix: string, depth: number) {
    if (depth > 20) throw new Error('Der Dokumentordner ist zu tief verschachtelt.');
    for await (const [name, handle] of folder.entries()) {
      if (name.startsWith('.') || ['node_modules', 'target', 'dist'].includes(name)) continue;
      const path = prefix + name;
      if (handle.kind === 'directory')
        await visit(handle as FileSystemDirectoryHandle, path + '/', depth + 1);
      else {
        if (
          /\.(?:pdf|aux|log|out|toc|synctex(?:\.gz)?|fls|fdb_latexmk|latexapp\.json)$/i.test(name) &&
          !name.toLowerCase().endsWith('.pdf')
        )
          continue;
        const file = await (handle as FileSystemFileHandle).getFile();
        size += file.size;
        if (size > 100 * 1024 * 1024 || result.length >= 1000)
          throw new Error('Der Dokumentordner überschreitet 100 MB oder 1000 Dateien.');
        result.push({ path, file });
      }
    }
  }
  await visit(dir, '', 0);
  return result;
}
export type LastDocument = { file: FileSystemFileHandle; dir?: FileSystemDirectoryHandle };
function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('latexhelper', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('preferences');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function lastDocument(value?: LastDocument | null): Promise<LastDocument | undefined> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('preferences', value === undefined ? 'readonly' : 'readwrite');
    const store = tx.objectStore('preferences');
    const req =
      value === undefined
        ? store.get('last')
        : value === null
          ? store.delete('last')
          : store.put(value, 'last');
    let result: LastDocument | undefined;
    req.onsuccess = () => {
      result = req.result;
    };
    tx.oncomplete = () => {
      database.close();
      resolve(result);
    };
    tx.onerror = () => {
      database.close();
      reject(tx.error);
    };
  });
}
