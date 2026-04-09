const DB_NAME = 'gemma-web-chat';
const DB_VERSION = 1;
const STORE_NAME = 'conversations';

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

export async function saveConversation(conv) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(conv);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('IndexedDB save failed:', e);
  }
}

export async function getLatestConversation() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const index = tx.objectStore(STORE_NAME).index('updatedAt');
      const req = index.openCursor(null, 'prev');
      req.onsuccess = () => {
        const cursor = req.result;
        resolve(cursor ? cursor.value : null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export function createNewConversation() {
  return {
    id: crypto.randomUUID(),
    title: '',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function generateTitle(firstMessage) {
  if (!firstMessage) return 'New conversation';
  return firstMessage.substring(0, 40) + (firstMessage.length > 40 ? '...' : '');
}
