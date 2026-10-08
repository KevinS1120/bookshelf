// Earlier versions kept books inside the browser (IndexedDB). This moves them
// to SharePoint so every device can see them.
import { openDB } from 'idb';
import { createBook } from './library';

async function openLocal() {
  // Opening a database that doesn't exist would create an empty one.
  if (indexedDB.databases && !(await indexedDB.databases()).some((d) => d.name === 'bookshelf')) return null;
  const db = await openDB('bookshelf');
  if (!db.objectStoreNames.contains('books')) {
    db.close();
    return null;
  }
  return db;
}

export async function countLocalBooks() {
  try {
    const db = await openLocal();
    if (!db) return 0;
    const n = await db.count('books');
    db.close();
    return n;
  } catch {
    return 0;
  }
}

export async function migrateLocalBooks(onStep) {
  const db = await openLocal();
  if (!db) return { moved: 0, failed: [] };
  const books = await db.getAll('books');
  const failed = [];
  let moved = 0;
  for (let i = 0; i < books.length; i++) {
    const { id, cover, ...book } = books[i];
    onStep?.(i, books.length, book.title);
    const file = await db.get('files', id);
    if (!file) continue;
    try {
      await createBook(book, file, cover);
      moved++;
    } catch (err) {
      if (err.status === 409) moved++; // already on the server
      else failed.push(`${book.title}: ${err.message}`);
    }
  }
  db.close();
  if (!failed.length) indexedDB.deleteDatabase('bookshelf');
  return { moved, failed };
}
