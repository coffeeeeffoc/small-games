import { letters, shuffled, validateEntries } from './game.mjs';

export const LIBRARY_ROOT = './assets/english-dict/';

export function matchingBooks(books, publisherId, grades = null) {
  return books.filter(book => book.publisherId === publisherId
    && (grades === null || grades.includes(String(book.grade ?? ''))));
}

export function validateBook(data, book) {
  if (data?.id !== book.id || !Array.isArray(data.entries) || data.entries.length !== book.count)
    throw new Error(`「${book.title}」内容不完整，请重新下载。`);
  const ordinals = new Set();
  for (const entry of data.entries) {
    validateEntries([entry]);
    if (!Number.isInteger(entry.ordinal) || ordinals.has(entry.ordinal)
        || (entry.unit !== null && typeof entry.unit !== 'string'))
      throw new Error(`「${book.title}」词条格式无效。`);
    ordinals.add(entry.ordinal);
  }
  return data;
}

export function practiceEntries(downloads, selections) {
  const words = new Map();
  for (const { bookId, unit = '' } of selections) {
    const book = downloads.find(book => book.id === bookId);
    if (!book) throw new Error('所选词库尚未下载，请先加载到本地。');
    const entries = book.entries.filter(entry => !unit || entry.unit === unit);
    if (!entries.length) throw new Error('所选单元没有词条，请重新选择。');
    for (const entry of entries) {
      const [normalized] = validateEntries([entry]);
      const existing = words.get(normalized.word);
      if (!existing) words.set(normalized.word, normalized);
      else if (!existing.meaning.split('；').includes(normalized.meaning)) {
        // Keep all source senses without counting the same spelling twice.
        existing.meaning += `；${normalized.meaning}`;
      }
    }
  }
  if (!words.size) throw new Error('请先勾选至少一本已加载的书或一个单元。');
  return [...words.values()];
}

export function practiceCount(count, total) {
  const amount = count === null ? total : count;
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > total)
    throw new Error(`请输入 1–${total} 之间的整数，或选择随机全部。`);
  return amount;
}

export function practiceBatches(entries, random = Math.random, count = null) {
  const amount = practiceCount(count, entries.length);
  const batches = [];
  let batch = [], letterCount = 0;
  for (const entry of shuffled(entries, random).slice(0, amount)) {
    const length = letters(entry.word).length;
    if (length > 80) throw new Error(`「${entry.word}」过长，无法放入棋盘。`);
    if (batch.length && (batch.length >= 6 || letterCount + length > 80)) {
      batches.push(batch);
      batch = []; letterCount = 0;
    }
    batch.push(entry); letterCount += length;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

let database;
function openDatabase() {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open('word-garden-library', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('books', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('本地词库存储不可用，请允许浏览器存储后重试。'));
    request.onblocked = () => reject(new Error('请关闭其他游戏标签页后重试。'));
  }).catch(error => { database = undefined; throw error; });
  return database;
}

export async function storedBooks(action = 'getAll', value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('books', action === 'getAll' ? 'readonly' : 'readwrite');
    const request = transaction.objectStore('books')[action](value);
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = transaction.onerror = () => reject(new Error('保存词库失败，可能是存储空间不足；之前下载的词库仍保留。'));
  });
}

export async function downloadBook(book, signal) {
  if (!/^books\/[A-Za-z0-9_-]+\.json$/.test(book.url)) throw new Error('词库路径无效。');
  const response = await fetch(new URL(LIBRARY_ROOT + book.url, import.meta.url), { signal });
  if (!response.ok) throw new Error(`「${book.title}」下载失败（${response.status}），可以重试。`);
  const buffer = await response.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  if (hash !== book.revision) throw new Error(`「${book.title}」版本校验失败，请刷新目录再试。`);
  const data = validateBook(JSON.parse(new TextDecoder().decode(buffer)), book);
  const saved = { ...data, revision: book.revision };
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  await storedBooks('put', saved);
  return saved;
}
