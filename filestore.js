/**
 * TextAloud — shared IndexedDB helper for persisting the chosen save folder.
 *
 * A FileSystemDirectoryHandle obtained from showDirectoryPicker() can be stored
 * in IndexedDB (structured clone) and reused later by the offscreen document to
 * write audio files. Included by both popup.html and offscreen.html.
 */

(() => {
  const DB_NAME = "textaloud-fs";
  const STORE = "handles";
  const KEY = "audioDir";

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function withStore(mode, fn) {
    return openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const t = db.transaction(STORE, mode);
          const request = fn(t.objectStore(STORE));
          t.oncomplete = () => {
            db.close();
            resolve(request ? request.result : undefined);
          };
          t.onerror = () => {
            db.close();
            reject(t.error);
          };
          t.onabort = () => {
            db.close();
            reject(t.error);
          };
        })
    );
  }

  async function getDir() {
    try {
      return (await withStore("readonly", (s) => s.get(KEY))) || null;
    } catch (_) {
      return null;
    }
  }

  async function setDir(handle) {
    await withStore("readwrite", (s) => s.put(handle, KEY));
  }

  async function clearDir() {
    await withStore("readwrite", (s) => s.delete(KEY));
  }

  self.TextAloudFiles = { getDir, setDir, clearDir };
})();
