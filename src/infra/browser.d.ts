declare const __APP_VERSION__: string;
declare const __APP_BUILD__: string;
interface FileSystemHandle {
  queryPermission(options?: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission(options?: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}
interface FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  values(): AsyncIterableIterator<FileSystemHandle>;
}
interface Window {
  showOpenFilePicker(options?: unknown): Promise<FileSystemFileHandle[]>;
  showSaveFilePicker(options?: unknown): Promise<FileSystemFileHandle>;
  showDirectoryPicker(options?: unknown): Promise<FileSystemDirectoryHandle>;
  launchQueue?: { setConsumer(callback: (params: { files: FileSystemFileHandle[] }) => void): void };
}
declare module 'nspell' {
  const nspell: (dictionary: { aff: string; dic: string }) => {
    correct(word: string): boolean;
    suggest(word: string): string[];
  };
  export default nspell;
}
