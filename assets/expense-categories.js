/* 소비 분석 화면의 "카테고리별 / 날짜별 소비" 요약. 저장된 기록을 읽기만 하고 바꾸지 않습니다. */
(function () {
  'use strict';
  const CATEGORIES = ['식비','간식','카페','교통','쇼핑','구독','의료','기타'];
  const WEEKDAYS = ['일','월','화','수','목','금','토'];
  const validAmount = (value) => (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isSafeInteger(Number(value)) && Number(value) >= 0;
  const normalize = (raw) => CATEGORIES.includes(raw) ? raw : '기타';
  const inMonth = (record, month) => Boolean(record) && record.type === 'expense' && typeof record.date === 'string' && record.date.startsWith(`${month}-`);

  // month: 'YYYY-MM'. categoryOf(record) gives the record's category (unknown names count as 기타).
  function summarize(records, month, categoryOf) {
    const byCategory = Object.fromEntries(CATEGORIES.map((name) => [name, { name, total:0, count:0, missing:0 }]));
    for (const record of records) {
      if (!inMonth(record, month)) continue;
      const row = byCategory[normalize(categoryOf(record))];
      row.count += 1;
      if (validAmount(record.amount)) row.total += Number(record.amount);
      else row.missing += 1;
    }
    const total = CATEGORIES.reduce((sum, name) => sum + byCategory[name].total, 0);
    const rows = CATEGORIES.map((name) => byCategory[name])
      .filter((row) => row.count > 0)
      .sort((a, b) => b.total - a.total || CATEGORIES.indexOf(a.name) - CATEGORIES.indexOf(b.name))
      .map((row) => ({ ...row, percent: total > 0 ? Math.round(row.total / total * 100) : 0 }));
    return { total, rows };
  }

  // Days of the month that have spending, in date order. category: 'all' or one category name.
  function daily(records, month, categoryOf, category = 'all') {
    const byDate = new Map();
    for (const record of records) {
      if (!inMonth(record, month) || !/^\d{4}-\d{2}-\d{2}$/.test(record.date)) continue;
      if (category !== 'all' && normalize(categoryOf(record)) !== category) continue;
      if (!byDate.has(record.date)) byDate.set(record.date, { date:record.date, total:0, count:0, missing:0, parts:{} });
      const row = byDate.get(record.date);
      const name = normalize(categoryOf(record));
      const part = row.parts[name] || (row.parts[name] = { name, total:0, count:0 });
      row.count += 1;
      part.count += 1;
      if (validAmount(record.amount)) { row.total += Number(record.amount); part.total += Number(record.amount); }
      else row.missing += 1;
    }
    // byCategory: that day's spending per category, largest first.
    const rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).map(({ parts, ...row }) => ({
      ...row,
      byCategory: Object.values(parts).sort((a, b) => b.total - a.total || CATEGORIES.indexOf(a.name) - CATEGORIES.indexOf(b.name))
    }));
    return { total: rows.reduce((sum, row) => sum + row.total, 0), max: Math.max(0, ...rows.map((row) => row.total)), rows };
  }

  const api = { categories: CATEGORIES, summarize, daily, refresh: () => {} };
  window.DAYFLOW_EXPENSE_CATEGORIES = api;
  const root = document.getElementById('expense-category-summary');
  if (!root) return;
  let tab = 'day';

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  // pieces: [{ name, ratio }] — one colored piece per category, laid side by side in the bar.
  function row(label, pieces, amountText, detail, pressed, ariaLabel, onClick, below) {
    const button = el('button', 'category-summary-row');
    button.type = 'button';
    if (pressed !== null) button.setAttribute('aria-pressed', String(pressed));
    button.setAttribute('aria-label', ariaLabel);
    const bar = el('span', 'category-summary-bar');
    for (const piece of pieces) {
      const fill = el('span');
      fill.dataset.category = piece.name;
      fill.style.width = `${Math.max(0, Math.min(1, piece.ratio)) * 100}%`;
      bar.append(fill);
    }
    const amount = el('span', 'category-summary-amount', amountText);
    amount.append(el('small', '', detail));
    button.append(el('span', 'category-summary-name', label), bar, amount);
    if (below) button.append(below);
    button.addEventListener('click', onClick);
    return button;
  }

  function renderCategories(list, month) {
    const summary = summarize(items, month, itemExpenseCategory);
    for (const item of summary.rows) {
      const extra = item.missing ? ` · 금액 미정 ${item.missing}건` : '';
      list.append(row(item.name, [{ name: item.name, ratio: summary.total > 0 ? item.total / summary.total : 0 }], `${formatMoney(item.total)} · ${item.percent}%`, `${item.count}건${extra}`,
        expenseCategoryFilter === item.name,
        `${item.name} ${formatMoney(item.total)}, 전체의 ${item.percent}%, ${item.count}건${extra}. 누르면 ${item.name} 기록만 봅니다.`,
        // 같은 카테고리를 다시 누르면 전체 소비로 돌아갑니다.
        () => document.querySelector(`#expense-category-filter [data-expense-category="${expenseCategoryFilter === item.name ? 'all' : item.name}"]`)?.click()));
    }
    return { total: summary.total, empty: !summary.rows.length };
  }

  function renderDays(list, month) {
    const summary = daily(items, month, itemExpenseCategory, expenseCategoryFilter);
    for (const item of summary.rows) {
      const day = new Date(`${item.date}T12:00:00`);
      const label = `${day.getMonth() + 1}.${day.getDate()} (${WEEKDAYS[day.getDay()]})`;
      const extra = item.missing ? ` · 금액 미정 ${item.missing}건` : '';
      // 그날 쓴 돈을 카테고리별로 나눠 막대 조각과 금액 목록으로 보여 줍니다.
      const pieces = item.byCategory.map((part) => ({ name: part.name, ratio: summary.max > 0 ? part.total / summary.max : 0 }));
      const parts = el('span', 'category-summary-parts');
      for (const part of item.byCategory) {
        const chip = el('span', 'category-summary-part', `${part.name} ${formatMoney(part.total)}`);
        chip.dataset.category = part.name;
        parts.append(chip);
      }
      const breakdown = item.byCategory.map((part) => `${part.name} ${formatMoney(part.total)}`).join(', ');
      list.append(row(label, pieces, formatMoney(item.total), `${item.count}건${extra}`, null,
        `${label} 합계 ${formatMoney(item.total)}: ${breakdown}${extra}. 누르면 이날 기록을 엽니다.`,
        () => openDayDetails(item.date), parts));
    }
    return { total: summary.total, empty: !summary.rows.length };
  }

  api.refresh = function refresh() {
    const visible = activeFilter === 'expense';
    root.hidden = !visible;
    if (!visible) return;
    const month = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}`;
    const scope = expenseCategoryFilter === 'all' ? '' : ` · ${expenseCategoryFilter}`;
    root.replaceChildren();

    const tabs = el('div', 'category-summary-tabs');
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('aria-label', '소비 요약 보기 방식');
    for (const [id, text] of [['day', '날짜별'], ['category', '카테고리별']]) {
      const button = el('button', '', text);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(tab === id));
      button.addEventListener('click', () => { tab = id; refresh(); });
      tabs.append(button);
    }

    const head = el('div', 'category-summary-head');
    const title = el('h3', '', `${viewDate.getMonth() + 1}월 ${tab === 'day' ? `날짜별 소비${scope}` : '카테고리별 소비'}`);
    const total = el('strong');
    head.append(title, total);
    const list = el('div', 'category-summary-list');
    const result = tab === 'day' ? renderDays(list, month) : renderCategories(list, month);
    total.textContent = `합계 ${formatMoney(result.total)}`;
    root.append(tabs, head);
    if (result.empty) root.append(el('p', 'category-summary-empty', `이 달에 기록한 ${scope ? `${expenseCategoryFilter} ` : ''}소비가 없습니다.`));
    else root.append(list);
  };
  api.refresh();
})();
