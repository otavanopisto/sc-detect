// an indexedDB worker file that simply works as a key-value store for json objects
// written in vanilla typescript
// without any external dependencies

// first lets make a listener for messages from the main thread
self.addEventListener('message', async (event) => {
    const { action, key, value, id } = event.data;
    let result;
    try {
        switch (action) {
            case 'get':
                result = await getItem(key);
                break;
            case 'set':
                result = await setItem(key, value);
                break;
            case 'delete':
                result = await deleteItem(key);
                break;
            case 'clear':
                result = await clearStore();
                break;
            default:
                throw new Error('Unknown action: ' + action);
        }
        self.postMessage({ status: 'success', action, key, result, id });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        self.postMessage({ status: 'error', action, key, error: message, id });
    }
});

const DB_NAME = 'SCDetectDB';
const STORE_NAME = 'KeyValueStore';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

function setItem(key: string, value: any): Promise<void> {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
}

// Example: get a value
function getItem(key: string): Promise<any> {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

// Example: delete a value
function deleteItem(key: string): Promise<void> {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
}

// Example: clear the store
function clearStore(): Promise<void> {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
}