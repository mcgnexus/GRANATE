export type CachedNote = {
  id: string;
  vaultId: string;
  path: string;
  title: string;
  content: string;
  updatedAt: string;
};

const DB_NAME = "granate-offline";
const DB_VERSION = 1;
const STORE = "notes";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB no disponible"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: ["vaultId", "path"] });
        store.createIndex("byVault", "vaultId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function cacheNote(note: CachedNote): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(note);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // IndexedDB no disponible o cuota excedida: se ignora silenciosamente
  }
}

export async function getCachedNote(vaultId: string, path: string): Promise<CachedNote | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get([vaultId, path]);
    const result = await new Promise<CachedNote | null>((resolve, reject) => {
      req.onsuccess = () => resolve((req.result as CachedNote) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch {
    return null;
  }
}

export async function listCachedNotes(vaultId: string): Promise<CachedNote[]> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readonly");
    const index = tx.objectStore(STORE).index("byVault");
    const req = index.getAll(vaultId);
    const result = await new Promise<CachedNote[]>((resolve, reject) => {
      req.onsuccess = () => resolve((req.result as CachedNote[]) ?? []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch {
    return [];
  }
}

export async function isOnline(): Promise<boolean> {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}
