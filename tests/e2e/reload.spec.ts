import { test, expect } from './fixture';
test('Browser kann einen OPFS-Dateihandle nach Navigation aus IndexedDB laden', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const file = await root.getFileHandle('isolated.tex', { create: true });
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('isolated', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('files');
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('files', 'readwrite');
        tx.objectStore('files').put(file, 'file');
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  });
  await page.reload();
  const name = await page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const request = indexedDB.open('isolated', 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('files', 'readonly');
          const result = tx.objectStore('files').get('file');
          result.onsuccess = () => {
            resolve(result.result.name);
            db.close();
          };
          result.onerror = () => reject(result.error);
        };
      }),
  );
  expect(name).toBe('isolated.tex');
});
