import { LIBRARY_ROOT, matchingBooks, storedBooks, downloadBook, validateBook, practiceEntries, practiceCount } from './library.mjs';

const $ = id => document.getElementById(id);
const node = (tag, text) => Object.assign(document.createElement(tag), { textContent: text });
const option = (value, label) => Object.assign(node('option', label), { value });

export function setupLibrary(startPractice) {
  let catalog, publishers = [], downloads = [], controller;
  const selection = new Map();
  const status = text => { $('library-status').textContent = text; };
  const selectedGrades = () => [...$('download-grade-options').querySelectorAll('input:checked')].map(input => input.value);
  const selectedBooks = () => matchingBooks(catalog.books, $('download-publisher').value, selectedGrades());
  const gradeLabel = grade => grade === null ? '综合词表（不分年级）' : `${grade} 年级`;
  const requestedCount = () => $('practice-all').checked ? null : $('practice-count').valueAsNumber;
  function saveFilters() {
    try {
      localStorage.setItem('word-garden-library-filters', JSON.stringify({ publisherId: $('download-publisher').value, grades: selectedGrades() }));
    } catch { /* The controls still work if preference storage is unavailable. */ }
  }

  function renderDownload() {
    if (!catalog) return;
    const books = selectedBooks();
    const current = books.filter(book => downloads.some(saved => saved.id === book.id && saved.revision === book.revision));
    $('download-summary').textContent = books.length ? `${books.length} 本 · ${books.reduce((sum, b) => sum + b.count, 0)} 条词汇 · ${(books.reduce((sum, b) => sum + b.bytes, 0) / 1024).toFixed(0)} KB；已是最新 ${current.length} 本` : '请至少选择一个年级。';
    $('download-books').replaceChildren(...books.map(book => node('li', `${book.title} · ${book.count} 词`)));
    $('download-button').disabled = !!controller || !books.length || current.length === books.length;
    $('download-publisher').disabled = $('download-grades').disabled = !!controller;
    const count = selectedGrades().length;
    $('download-all-grades').checked = count > 0 && count === $('download-grade-options').querySelectorAll('input').length;
    $('download-all-grades').indeterminate = count > 0 && !$('download-all-grades').checked;
    $('cancel-download').hidden = !controller;
  }

  function renderPractice() {
    if (!catalog) return;
    const publisher = $('download-publisher').value;
    const publisherBooks = matchingBooks(catalog.books, publisher);
    const books = publisherBooks.filter(book => downloads.some(saved => saved.id === book.id))
      .sort((a, b) => (a.grade ?? Infinity) - (b.grade ?? Infinity));
    for (const id of selection.keys()) if (!books.some(book => book.id === id)) selection.delete(id);
    $('practice-publisher-label').textContent = `${publishers.find(p => p.id === publisher)?.name || ''} · 按年级勾选全部已加载的书，也可细选整册或单元。`;
    $('loaded-books').replaceChildren();
    const groups = new Map();
    for (const book of books) {
      if (!groups.has(book.grade)) {
        const group = node('section', ''); group.className = 'practice-grade';
        const label = node('label', ''); label.className = 'practice-grade-heading';
        const check = document.createElement('input'); check.type = 'checkbox';
        check.dataset.practiceGrade = book.grade ?? '';
        const gradeBooks = books.filter(item => item.grade === book.grade);
        const total = publisherBooks.filter(item => item.grade === book.grade).length;
        label.append(check, node('strong', gradeLabel(book.grade)), node('span', `已加载 ${gradeBooks.length}/${total} 本`));
        check.addEventListener('change', () => {
          for (const item of gradeBooks) {
            if (check.checked) selection.set(item.id, ''); else selection.delete(item.id);
          }
          renderPractice();
          $('loaded-books').querySelector(`input[data-practice-grade="${book.grade ?? ''}"]`)?.focus({ preventScroll: true });
        });
        group.append(label);
        if (gradeBooks.length < total) group.append(node('small', '当前只练已加载的书，可在上方补齐本年级词库。'));
        groups.set(book.grade, group); $('loaded-books').append(group);
      }
      const saved = downloads.find(saved => saved.id === book.id);
      const units = [...new Set(saved.entries.map(entry => entry.unit).filter(Boolean))];
      const row = node('div', ''); row.className = 'loaded-book';
      const label = node('label', '');
      const check = document.createElement('input'); check.type = 'checkbox'; check.dataset.bookId = book.id;
      check.checked = selection.has(book.id);
      label.append(check, node('span', book.title));
      const scope = document.createElement('select');
      scope.setAttribute('aria-label', `${book.title}练习范围`);
      scope.dataset.scopeId = book.id;
      scope.append(option('', '整本书'), ...units.map(unit => option(unit, unit)));
      scope.value = selection.get(book.id) || '';
      scope.disabled = !check.checked;
      const note = node('small', `${saved.entries.length} 词 · ${units.length ? `${units.length} 个单元` : '暂缺单元标注，可练整册'}${saved.revision !== book.revision ? ' · 有更新可下载' : ''}`);
      const remove = node('button', '移除'); remove.type = 'button'; remove.className = 'text-button';
      remove.setAttribute('aria-label', `移除${book.title}`);
      remove.disabled = !!controller;
      check.addEventListener('change', () => {
        if (check.checked) selection.set(book.id, scope.value); else selection.delete(book.id);
        scope.disabled = !check.checked; renderSelection();
      });
      scope.addEventListener('change', () => { selection.set(book.id, scope.value); renderSelection(); });
      remove.addEventListener('click', async () => {
        remove.disabled = true;
        try {
          await storedBooks('delete', book.id);
          downloads = downloads.filter(item => item.id !== book.id);
          selection.delete(book.id);
          renderPractice(); renderDownload(); status(`已移除「${book.title}」，需要时可重新下载。`);
        } catch (error) { status(error.message); remove.disabled = false; }
      });
      row.append(label, scope, note, remove); groups.get(book.grade).append(row);
    }
    if (!books.length) $('loaded-books').append(node('p', '这里还没有已加载的书，请先在上方选择出版社下载。'));
    renderSelection();
  }

  function getEntries() {
    return practiceEntries(downloads, [...selection].map(([bookId, unit]) => ({ bookId, unit })));
  }

  function renderSelection() {
    $('practice-count-row').hidden = $('practice-all').checked;
    $('practice-count').disabled = $('practice-all').checked;
    $('practice-size-error').hidden = true;
    $('practice-count').removeAttribute('aria-invalid');
    $('start-practice').disabled = true;
    $('start-practice').textContent = '开始所选练习';
    for (const group of $('loaded-books').querySelectorAll('.practice-grade')) {
      const ids = [...group.querySelectorAll('input[data-book-id]')].map(check => check.dataset.bookId);
      const check = group.querySelector('input[data-practice-grade]');
      check.checked = ids.every(id => selection.get(id) === '');
      check.indeterminate = !check.checked && ids.some(id => selection.has(id));
    }
    try {
      const entries = getEntries();
      $('practice-count').max = entries.length;
      $('practice-summary').textContent = `已选 ${selection.size} 本 / 单元，共 ${entries.length} 个不同拼写。`;
      let amount;
      try { amount = practiceCount(requestedCount(), entries.length); }
      catch (error) {
        $('practice-size-error').textContent = error.message;
        $('practice-size-error').hidden = false;
        $('practice-count').setAttribute('aria-invalid', 'true');
        return;
      }
      $('practice-summary').textContent += ` 本次随机${requestedCount() === null ? '全部 ' : ' '}${amount} 个，不重复；每批最多 6 个，拼完自动继续。`;
      $('start-practice').textContent = `开始练习 · ${amount} 个词`;
      $('start-practice').disabled = false;
    } catch (error) {
      $('practice-summary').textContent = error.message;
      $('start-practice').disabled = true;
    }
  }

  function changePublisher(selected) {
    const grades = [...new Set(matchingBooks(catalog.books, $('download-publisher').value).map(book => book.grade))].sort((a, b) => (a ?? Infinity) - (b ?? Infinity));
    $('download-grade-options').replaceChildren(...grades.map(grade => {
      const label = node('label', '');
      const check = document.createElement('input'); check.type = 'checkbox';
      check.value = String(grade ?? ''); check.dataset.downloadGrade = check.value;
      check.checked = selected === undefined || selected.includes(check.value);
      label.append(check, node('span', gradeLabel(grade)));
      return label;
    }));
    renderDownload(); renderPractice(); saveFilters();
  }

  async function load() {
    $('refresh-library').disabled = true;
    status('正在读取目录和本地词库…');
    try {
      let metadata;
      try {
        metadata = await Promise.all(['catalog.json', 'publishers.json'].map(async file => {
          const response = await fetch(new URL(LIBRARY_ROOT + file, import.meta.url));
          if (!response.ok) throw new Error('词库目录加载失败，请稍后重试。');
          return response.json();
        }));
        try { localStorage.setItem('word-garden-catalog', JSON.stringify(metadata)); } catch { /* Downloads live in IndexedDB. */ }
      } catch (error) {
        try { metadata = JSON.parse(localStorage.getItem('word-garden-catalog')); } catch { /* Report the network error below. */ }
        if (!metadata) throw error;
        status('使用已保存的目录；已下载的词库可继续练习。');
      }
      [catalog, publishers] = metadata;
      downloads = [];
      const invalid = [];
      for (const saved of await storedBooks()) {
        const book = catalog.books.find(book => book.id === saved.id);
        if (!book) continue;
        try {
          validateBook(saved, { ...book, count: saved.entries?.length });
          downloads.push(saved);
        } catch { invalid.push(book.title); }
      }
      for (const id of selection.keys()) if (!downloads.some(book => book.id === id)) selection.delete(id);
      $('library-note').textContent = catalog.note;
      let filters;
      try { filters = JSON.parse(localStorage.getItem('word-garden-library-filters')); } catch { /* Default to an available publisher. */ }
      const publisherId = $('download-publisher').value || filters?.publisherId
        || catalog.books.find(book => downloads.some(saved => saved.id === book.id))?.publisherId;
      const grades = $('download-publisher').value ? selectedGrades() : filters?.grades;
      $('download-publisher').replaceChildren(...publishers.map(p => option(p.id, p.name)));
      if (publishers.some(p => p.id === publisherId)) $('download-publisher').value = publisherId;
      changePublisher(Array.isArray(grades) ? grades : undefined);
      if (invalid.length) status(`本地词库损坏，请重新下载：${invalid.join('、')}`);
      else if ($('library-status').textContent.startsWith('正在')) status(`已加载 ${downloads.length} 本。下载只获取所选出版社和年级。`);
    } catch (error) { status(error.message); }
    finally { $('refresh-library').disabled = false; }
  }

  $('open-library').addEventListener('click', () => {
    $('library-dialog').showModal();
    if (!catalog) void load();
  });
  $('refresh-library').addEventListener('click', () => { if (!controller) void load(); });
  $('download-publisher').addEventListener('change', () => changePublisher());
  $('download-grade-options').addEventListener('change', () => { renderDownload(); saveFilters(); });
  $('download-all-grades').addEventListener('change', () => {
    for (const check of $('download-grade-options').querySelectorAll('input')) check.checked = $('download-all-grades').checked;
    renderDownload(); saveFilters();
  });
  $('cancel-download').addEventListener('click', () => controller?.abort());
  $('library-dialog').addEventListener('close', () => controller?.abort());
  $('download-button').addEventListener('click', async () => {
    if (controller) return;
    const books = selectedBooks().filter(book => !downloads.some(saved => saved.id === book.id && saved.revision === book.revision));
    controller = new AbortController();
    $('refresh-library').disabled = true;
    renderDownload(); renderPractice();
    let count = 0;
    try {
      for (const book of books) {
        status(`正在下载 ${count + 1}/${books.length}：${book.title}`);
        const saved = await downloadBook(book, controller.signal);
        downloads = [...downloads.filter(item => item.id !== book.id), saved];
        count++; renderPractice();
      }
      status(`下载完成，共 ${count} 本；在下方勾选练习范围。`);
    } catch (error) {
      status(`${error.name === 'AbortError' ? '已取消下载。' : error.message} 已完成的 ${count} 本已保存，可以继续下载其余词库。`);
    } finally {
      controller = undefined; $('refresh-library').disabled = false;
      renderDownload(); renderPractice();
    }
  });
  $('select-loaded').addEventListener('click', () => {
    for (const check of $('loaded-books').querySelectorAll('input[data-book-id]')) selection.set(check.dataset.bookId, '');
    renderPractice();
  });
  $('clear-loaded-selection').addEventListener('click', () => { selection.clear(); renderPractice(); });
  for (const id of ['practice-random', 'practice-all']) $(id).addEventListener('change', renderSelection);
  $('practice-count').addEventListener('input', renderSelection);
  $('start-practice').addEventListener('click', () => {
    try {
      const publisher = publishers.find(p => p.id === $('download-publisher').value);
      const grades = [...new Set(catalog.books.filter(book => selection.has(book.id)).map(book => gradeLabel(book.grade)))];
      const entries = getEntries();
      const count = requestedCount();
      practiceCount(count, entries.length);
      startPractice(entries, `${publisher.name} · ${grades.join('、')}`, count);
    }
    catch (error) { status(error.message); }
  });
}
