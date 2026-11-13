import { MAX_FILE_BYTES, MAX_TOTAL_FILE_BYTES } from "./config";

// Original statement PDFs are kept in this browser's IndexedDB, behind the storage layer, only so the audit pack can
// include them. Nothing is uploaded. Reset demo wipes them, and each statement has a "Remove file" action.

const DB_NAME = "docflow-files";
const STORE = "files";

export type SaveResult = { ok: true } | { ok: false; reason: string };

// Pure, so it can be tested: may a file of `size` bytes be added when `currentTotal` bytes are already held?
export function checkCap(currentTotal: number, size: number): SaveResult {
  if (size > MAX_FILE_BYTES) {
    return { ok: false, reason: `This PDF is larger than ${Math.round(MAX_FILE_BYTES / 1048576)} MB, so its file was not kept. The figures were still read and the proof still works.` };
  }
  if (currentTotal + size > MAX_TOTAL_FILE_BYTES) {
    return { ok: false, reason: `This browser already holds ${Math.round(currentTotal / 1048576)} MB of statement files, which is the limit (${Math.round(MAX_TOTAL_FILE_BYTES / 1048576)} MB). Remove some files, then upload again. The figures were still read.` };
  }
  return { ok: true };
}

interface FileRow {
  id: string;
  name: string;
  data: ArrayBuffer;
  size: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("unavailable"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("unavailable"));
  });
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
        tx.onabort = () => reject(tx.error ?? new Error("aborted"));
      }),
  );
}

export async function storedBytes(): Promise<number> {
  try {
    const rows = (await run("readonly", (s) => s.getAll())) as FileRow[];
    return rows.reduce((a, r) => a + r.size, 0);
  } catch {
    return 0;
  }
}

export async function saveFile(id: string, name: string, data: Uint8Array): Promise<SaveResult> {
  const cap = checkCap(await storedBytes(), data.byteLength);
  if (!cap.ok) return cap;
  try {
    const copy = data.slice().buffer as ArrayBuffer;
    await run("readwrite", (s) => s.put({ id, name, data: copy, size: data.byteLength } as FileRow));
    return { ok: true };
  } catch (err) {
    const quota = err instanceof DOMException && err.name === "QuotaExceededError";
    return { ok: false, reason: quota ? "This browser has no room left for the file, so it was not kept. The figures were still read." : "This browser would not store the file (private windows often block it), so it was not kept. The figures were still read." };
  }
}

export async function loadFile(id: string): Promise<{ name: string; data: Uint8Array } | null> {
  try {
    const row = (await run("readonly", (s) => s.get(id))) as FileRow | undefined;
    return row ? { name: row.name, data: new Uint8Array(row.data) } : null;
  } catch {
    return null;
  }
}

export async function removeFile(id: string): Promise<void> {
  try {
    await run("readwrite", (s) => s.delete(id));
  } catch {
    /* nothing to remove */
  }
}

export async function clearAllFiles(): Promise<void> {
  try {
    await run("readwrite", (s) => s.clear());
  } catch {
    /* nothing to clear */
  }
}
