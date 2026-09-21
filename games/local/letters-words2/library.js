// Download integrity/cache flow follows ../letters-words/library.mjs.
import { letters, validateEntries } from './engine.js';

export function validateBook(data, book) {
  if (data?.id !== book.id || !Array.isArray(data.entries) || data.entries.length !== book.count) throw new Error('词库不完整，请重试下载。');
  const ordinals = new Set();
  for (const entry of data.entries) {
    validateEntries([entry]);
    if (!Number.isInteger(entry.ordinal) || ordinals.has(entry.ordinal)
        || (entry.unit !== null && typeof entry.unit !== 'string')) throw new Error('教材词条格式无效。');
    ordinals.add(entry.ordinal);
  }
  return data;
}

export function practiceBatches(entries) {
  const words = new Map();
  for (const entry of entries) {
    const [value] = validateEntries([entry]);
    const existing = words.get(value.word);
    if (!existing) words.set(value.word, value);
    else if (!existing.meaning.includes(value.meaning)) existing.meaning += `；${value.meaning}`;
  }
  const batches = [];
  let batch = [], size = 0;
  for (const entry of words.values()) {
    const length = letters(entry.word).length;
    if (batch.length && (batch.length === 6 || size + length > 80)) { batches.push(batch); batch = []; size = 0; }
    batch.push(entry); size += length;
  }
  if (batch.length) batches.push(batch);
  if (!batches.length) throw new Error('所选单元没有词条。');
  return batches;
}

let database;
async function storedBook(id, value) {
  database ||= new Promise((resolve, reject) => {
    const request = indexedDB.open('ciyu-textbooks', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('books', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = request.onblocked = () => reject(new Error('本地词库存储不可用，本次仍可在线练习。'));
  }).catch(error => { database = undefined; throw error; });
  const db = await database;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('books', value ? 'readwrite' : 'readonly');
    const request = value ? transaction.objectStore('books').put(value) : transaction.objectStore('books').get(id);
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = transaction.onabort = () => reject(new Error('词库保存失败，本次仍可练习。'));
  });
}

export async function downloadBook(book, signal) {
  if (!/^books\/[A-Za-z0-9_-]+\.json$/.test(book.url)) throw new Error('词库路径无效。');
  let cached;
  try { cached = await storedBook(book.id); } catch { /* Online practice also works without IndexedDB. */ }
  if (cached?.revision === book.revision) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    try { return validateBook(cached, book); } catch { /* A corrupt cache is downloaded again. */ }
  }
  const response = await fetch(new URL(`./assets/english-dict/${book.url}`, import.meta.url), { signal });
  if (!response.ok) throw new Error(`词库下载失败（${response.status}），请重试。`);
  const bytes = await response.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
  if (hash !== book.revision) throw new Error('词库版本校验失败，请刷新后重试。');
  const data = { ...validateBook(JSON.parse(new TextDecoder().decode(bytes)), book), revision: book.revision };
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  try { await storedBook(book.id, data); } catch { /* Keep the verified download available in memory. */ }
  return data;
}

export function setupLibrary(startPractice) {
  const $ = id => document.getElementById(id);
  const option = (value, text) => new Option(text, value);
  let catalog, controller;
  const book = () => catalog?.books.find(item => item.id === $('textbook-book').value);
  function status(message) { $('library-status').textContent = message; }
  function fillBooks() {
    const candidates = catalog.books.filter(item => item.publisherId === $('textbook-publisher').value
      && String(item.grade ?? '') === $('textbook-grade').value);
    $('textbook-book').replaceChildren(...candidates.map(item => option(item.id, `${item.title}${item.verification ? '' : '（历史词表）'}`)));
    fillUnits();
  }
  function fillGrades() {
    const grades = [...new Set(catalog.books.filter(item => item.publisherId === $('textbook-publisher').value).map(item => item.grade))].sort((a, b) => (a ?? 99) - (b ?? 99));
    $('textbook-grade').replaceChildren(...grades.map(grade => option(String(grade ?? ''), grade ? `${grade} 年级` : '综合词表')));
    fillBooks();
  }
  function fillUnits() {
    const selected = book();
    $('textbook-unit').replaceChildren(...(selected?.units || []).map(unit => option(unit, unit)), option('', '整册练习'));
    $('library-start').disabled = !selected;
    $('library-evidence').textContent = selected?.verification
      ? `${selected.count} 词 · ${selected.units.length} 个学习单元 · 已对照原书核验。`
      : '此历史词表尚未核验教材单元与当前版次，仅可整册练习。请勿当作某个单元的词表。';
    $('library-notes').textContent = selected?.verification ? `${selected.edition}。${selected.verification.notes || ''}` : '';
    $('library-details').open = false;
    $('library-details').hidden = !selected?.verification;
    const source = $('library-source');
    const evidence = selected?.verification?.evidence?.find(item => /^https?:\/\//.test(item.url || ''));
    source.hidden = !evidence;
    if (evidence) source.href = evidence.pageUrl || evidence.url;
    status('选定版次和单元后开始；已下载的词库可离线使用。');
  }
  async function open() {
    $('library-dialog').showModal();
    if (catalog) return;
    status('正在读取教材目录…');
    try {
      try {
        const response = await fetch(new URL('./assets/english-dict/catalog.json', import.meta.url));
        if (!response.ok) throw new Error('教材目录暂时不可用，请重试。');
        catalog = await response.json();
        try { localStorage.setItem('ciyu-catalog', JSON.stringify(catalog)); } catch { /* Storage may be disabled. */ }
      } catch (error) {
        try { catalog = JSON.parse(localStorage.getItem('ciyu-catalog')); } catch { /* Preserve the network error. */ }
        if (!catalog) throw error;
      }
      $('textbook-publisher').replaceChildren(...catalog.publishers.map(item => option(item.id, item.name)));
      if (catalog.publishers.some(item => item.id === 'fltrp')) $('textbook-publisher').value = 'fltrp';
      fillGrades();
    } catch (error) { status(error.message); catalog = undefined; }
  }
  $('open-library').addEventListener('click', open);
  $('library-retry').addEventListener('click', () => { catalog = undefined; void open(); });
  $('textbook-publisher').addEventListener('change', fillGrades);
  $('textbook-grade').addEventListener('change', fillBooks);
  $('textbook-book').addEventListener('change', fillUnits);
  $('library-dialog').addEventListener('close', () => controller?.abort());
  $('library-start').addEventListener('click', async () => {
    const selected = book(), unit = $('textbook-unit').value;
    if (!selected || controller) return;
    controller = new AbortController();
    for (const element of $('library-dialog').querySelectorAll('select, #library-retry')) element.disabled = true;
    $('library-start').disabled = true;
    status('正在校验并保存所选词库…');
    try {
      const data = await downloadBook(selected, controller.signal);
      if (controller.signal.aborted) return;
      const entries = data.entries.filter(entry => !unit || entry.unit === unit);
      const batches = practiceBatches(entries);
      startPractice({ batches, index: 0, name: `${selected.title} · ${unit || '整册'}`, bookId: selected.id, unit, review: [], learned: 0 });
    } catch (error) { if (error.name !== 'AbortError') status(error.message); }
    finally {
      controller = undefined;
      for (const element of $('library-dialog').querySelectorAll('select, #library-retry')) element.disabled = false;
      $('library-start').disabled = !book();
    }
  });
}
