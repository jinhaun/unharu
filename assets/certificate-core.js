(function(root) {
  'use strict';
  const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  function cleanSelection(ids, catalog) {
    const selected = new Set(Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : []);
    return catalog.filter(exam => selected.has(exam.id)).map(exam => exam.id);
  }
  function search(catalog, query) {
    const terms = String(query || '').trim().split(/\s+/).map(normalize).filter(Boolean);
    return catalog.filter(exam => {
      const text = normalize([exam.label, exam.fullName, ...(exam.aliases || [])].join(' '));
      return terms.every(term => text.includes(term));
    });
  }
  function key(account, testMode) {
    return 'dayflow-exam-settings-v1:' + (testMode ? 'test:' : 'live:') + (account || 'guest');
  }
  function read(storage, storageKey, catalog) {
    const raw = storage.getItem(storageKey);
    if(raw === null) return [];
    const data = JSON.parse(raw);
    if(data?.version !== 1 || !Array.isArray(data.selected)) throw new Error('Invalid preferences');
    return cleanSelection(data.selected, catalog);
  }
  function save(storage, storageKey, ids, catalog) {
    const selected = cleanSelection(ids, catalog);
    storage.setItem(storageKey, JSON.stringify({version:1, selected}));
    return selected;
  }
  root.DAYFLOW_CERT_CORE = Object.freeze({cleanSelection, search, key, read, save});
})(globalThis);
