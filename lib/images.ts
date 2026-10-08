// Images attached to messages. They live in IndexedDB rather than in the
// persisted chat store, because localStorage only holds a few MB; messages
// keep the image ids.
import { v4 as uuidv4 } from "uuid";

const DB_NAME = "yakgpt-images";
const STORE = "images";
// Long side in pixels. Larger images cost more tokens without helping most models
const MAX_SIDE = 1568;
const JPEG_QUALITY = 0.85;
export const MAX_IMAGES_PER_MESSAGE = 8;
export const MAX_IMAGE_FILE_BYTES = 25 * 1024 * 1024;

interface StoredImage {
  url: string;
  createdAt: number;
}

let dbPromise: Promise<IDBDatabase> | undefined;

const openDb = () => {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
};

const run = async <T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T> | void
) => {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request ? request.result : (undefined as T));
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
};

// Data URLs by id, so rendering and sending don't hit IndexedDB repeatedly
const cache = new Map<string, Promise<string>>();
// Settled loads for synchronous reads while rendering: a URL, or null if missing
const settled = new Map<string, string | null>();
const listeners = new Set<() => void>();

const settle = (id: string, url: string | null) => {
  settled.set(id, url);
  listeners.forEach((listener) => listener());
};

export const subscribeImages = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// undefined while loading
export const getLoadedImage = (id: string) => settled.get(id);

export const loadImage = (id: string) => {
  let promise = cache.get(id);
  if (!promise) {
    promise = run<StoredImage | undefined>("readonly", (store) => store.get(id)).then(
      (image) => {
        if (!image) throw new Error("Image not found");
        return image.url;
      }
    );
    promise.then(
      (url) => settle(id, url),
      () => {
        // Let a failed load be retried later
        cache.delete(id);
        settle(id, null);
      }
    );
    cache.set(id, promise);
  }
  return promise;
};

export const saveImage = async (dataUrl: string) => {
  const id = uuidv4();
  const image: StoredImage = { url: dataUrl, createdAt: Date.now() };
  await run("readwrite", (store) => store.put(image, id));
  cache.set(id, Promise.resolve(dataUrl));
  settle(id, dataUrl);
  return id;
};

// Delete stored images that no message references any more. Recent images
// are kept: another tab may have them attached in its composer
export const collectGarbage = async (keep: Set<string>, minAgeMs = 24 * 60 * 60 * 1000) => {
  const cutoff = Date.now() - minAgeMs;
  let deleted = 0;
  await run("readwrite", (store) => {
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const id = String(cursor.key);
      const image = cursor.value as StoredImage;
      if (!keep.has(id) && !(image.createdAt > cutoff)) {
        cursor.delete();
        cache.delete(id);
        settled.delete(id);
        deleted++;
      }
      cursor.continue();
    };
  });
  return deleted;
};

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

// Scale an image file down and re-encode it as JPEG
export const prepareImage = async (file: File) => {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name} is not an image`);
  if (file.size > MAX_IMAGE_FILE_BYTES) throw new Error(`${file.name} is larger than 25 MB`);

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  // JPEG has no transparency: put transparent images on white
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
  );
  if (!blob) throw new Error(`Could not read ${file.name}`);
  return saveImage(await blobToDataUrl(blob));
};
