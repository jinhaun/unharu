(function () {
  'use strict';
  const core = window.UNHARU_PHOTOS_CORE;
  const dayDialog = document.getElementById('day-details-dialog');
  if (!core || !dayDialog) return;
  const testMode = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) && new URLSearchParams(location.search).has('test');
  const section = document.createElement('section');
  section.id = 'day-photos'; section.className = 'day-photos'; section.hidden = true;
  section.setAttribute('aria-labelledby', 'day-photos-title');
  section.innerHTML = `
    <div class="photo-heading"><h3 id="day-photos-title">이날의 사진</h3><button type="button" id="photo-refresh">사진 새로고침</button></div>
    <p id="photo-privacy">내 계정에서만 볼 수 있는 사진입니다. 일정 공유와 그룹 공유에는 포함되지 않습니다.</p>
    <div class="photo-actions"><button type="button" id="photo-pick" class="photo-primary">사진 선택</button><button type="button" id="photo-camera">사진 촬영</button></div>
    <input id="photo-files" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" multiple hidden aria-label="앨범 또는 컴퓨터에서 사진 선택">
    <input id="photo-camera-file" type="file" accept="image/*" capture="environment" hidden aria-label="사진 촬영">
    <details class="photo-help"><summary>사진 크기·형식 안내</summary><p>한 번에 10장, 한 장당 20메가바이트까지 선택할 수 있습니다. 저장 전 사진 크기를 줄이며 촬영 위치 정보는 보관하지 않습니다. 원본은 기기에 보관해 주세요.</p><p>사진 촬영은 지원하는 휴대폰에서 카메라가 열립니다. 컴퓨터에서는 파일을 선택할 수 있습니다. 선택만 한 사진은 탭을 바꾸거나 창을 닫으면 취소됩니다.</p></details>
    <p id="photo-status" class="photo-status" role="status" aria-live="polite"></p>
    <div id="photo-pending" class="photo-pending" hidden><h4>저장할 사진</h4><div id="photo-pending-grid" class="photo-grid"></div><div class="photo-actions"><button type="button" id="photo-save" class="photo-primary">선택한 사진 저장</button><button type="button" id="photo-clear">선택 취소</button></div></div>
    <div id="photo-gallery" class="photo-grid"></div><p id="photo-empty" class="photo-empty" hidden>아직 사진이 없습니다. 오늘의 순간을 사진으로 남겨 보세요.</p>
    <button type="button" id="photo-more" class="photo-more" hidden>사진 더 보기</button>`;
  dayDialog.append(section);
  const viewer = document.createElement('dialog'); viewer.className = 'photo-viewer'; viewer.setAttribute('aria-labelledby', 'photo-viewer-title');
  viewer.innerHTML = '<div class="photo-viewer-head"><h3 id="photo-viewer-title">사진 크게 보기</h3><button type="button" id="photo-viewer-close">닫기</button></div><img id="photo-large" alt="선택한 날짜의 사진">';
  document.body.append(viewer);
  const q = id => document.getElementById(id);
  let owner = '', epoch = 0, day = '', active = false, busy = false, picking = false, pending = [], nextOffset = 0;
  const urls = new Set();
  let authRevision = 0;
  const previewOwner = '00000000-0000-4000-8000-000000000001';
  function note(text, error = false) { q('photo-status').textContent = text; q('photo-status').dataset.error = String(error); }
  function url(blob) { const value = URL.createObjectURL(blob); urls.add(value); return value; }
  function release(value) { URL.revokeObjectURL(value); urls.delete(value); }
  function clearViewer() { if (viewer.open) viewer.close(); q('photo-large').removeAttribute('src'); }
  function clearGallery() {
    clearViewer(); q('photo-gallery').replaceChildren();
    const keep = new Set(pending.map(photo => photo.url));
    for (const value of urls) if (!keep.has(value)) release(value);
    q('photo-more').hidden = true;
  }
  function clearPending() { pending.forEach(photo => release(photo.url)); pending = []; renderPending(); }
  function controls(value) {
    busy = value;
    section.setAttribute('aria-busy', String(value));
    section.querySelectorAll('button').forEach(button => { button.disabled = value || !owner; });
    q('photo-save').disabled = value || !owner || !pending.length;
  }
  function current(version) { return active && version === epoch && dayDialog.open; }
  function renderPending() {
    q('photo-pending').hidden = !pending.length; q('photo-pending-grid').replaceChildren();
    pending.forEach((photo, index) => {
      const card = document.createElement('figure'); card.className = 'photo-card';
      const img = document.createElement('img'); img.src = photo.url; img.alt = `저장할 사진 ${index + 1}`;
      const caption = document.createElement('figcaption'); caption.textContent = `사진 ${index + 1}`;
      card.append(img, caption); q('photo-pending-grid').append(card);
    });
    q('photo-save').disabled = busy || !owner || !pending.length;
  }
  async function normalize(file) {
    core.validateFile(file);
    const source = URL.createObjectURL(file);
    let image;
    try {
      image = new Image();
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(Object.assign(new Error(), {code:'DECODE'})); image.src = source; });
      const w = image.naturalWidth, h = image.naturalHeight;
      if (!w || !h || w * h > 60000000) core.fail('DECODE');
      const scale = Math.min(1, 1600 / Math.max(w, h));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(w * scale)); canvas.height = Math.max(1, Math.round(h * scale));
      const ctx = canvas.getContext('2d'); if (!ctx) core.fail('ENCODE');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .85));
      canvas.width = 0; canvas.height = 0;
      if (!blob || blob.type !== 'image/jpeg' || blob.size > core.MAX_STORED) core.fail('ENCODE');
      return blob;
    } finally { if (image) image.src = ''; URL.revokeObjectURL(source); }
  }
  // Preview-only storage contains test images on this browser, never sends them to the account.
  function previewClient() {
    let database;
    async function db() {
      if (!database) database = new Promise((resolve, reject) => {
        const request = indexedDB.open('unharu-day-photos-preview-v1', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('photos', {keyPath:'path'});
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      return database;
    }
    async function transact(mode, run) {
      const database = await db();
      return new Promise((resolve, reject) => {
        const tx = database.transaction('photos', mode); const request = run(tx.objectStore('photos'));
        tx.oncomplete = () => resolve(request.result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
    }
    const bucket = {
      async list(prefix, options) { const all = await transact('readonly', store => store.getAll()); return {data: all.filter(photo => photo.path.startsWith(prefix + '/')).sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0) || a.path.localeCompare(b.path)).slice(options.offset, options.offset + options.limit).map(photo => ({id:photo.path, name:photo.path.split('/').at(-1)}))}; },
      async download(path) { const row = await transact('readonly', store => store.get(path)); return row ? {data:row.blob} : {error:{code:'PATH'}}; },
      async upload(path, blob) { await transact('readwrite', store => store.add({path, blob, createdAt:Date.now()})); return {data:{path}}; },
      async remove(paths) { await transact('readwrite', store => store.delete(paths[0])); return {data:[{name:paths[0]}]}; }
    };
    return {storage:{from:()=>bucket}};
  }
  const client = testMode ? previewClient() : window.DAYFLOW_SUPABASE_CLIENT;
  const store = client ? core.createStore(client, () => owner) : null;
  if (testMode) { owner = previewOwner; q('photo-privacy').textContent = '시험 화면입니다. 사진은 이 브라우저에만 저장되며 계정이나 다른 기기로 전송되지 않습니다.'; }
  function photoCard(photo, blob, index) {
    const card = document.createElement('figure'); card.className = 'photo-card'; card.dataset.photoName = photo.name;
    const imageButton = document.createElement('button'); imageButton.type = 'button'; imageButton.className = 'photo-image-button'; imageButton.setAttribute('aria-label', `사진 ${index + 1} 크게 보기`);
    const image = document.createElement('img'); const imageUrl = url(blob); image.src = imageUrl; image.alt = `${day}에 저장한 사진 ${index + 1}`; image.loading = 'lazy'; image.decoding = 'async';
    imageButton.append(image);
    imageButton.addEventListener('click', () => { q('photo-large').src = imageUrl; q('photo-viewer-title').textContent = `${day} 사진`; viewer.showModal(); });
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'photo-remove'; remove.textContent = '사진 삭제'; remove.setAttribute('aria-label', `사진 ${index + 1} 삭제`);
    remove.addEventListener('click', async () => {
      if (busy || !owner || !confirm('이 사진을 삭제할까요? 계정에 저장된 사진이 삭제되며 되돌릴 수 없습니다.')) return;
      const version = epoch, selected = day; controls(true);
      try { await store.scope(selected).remove(photo.name); if (!current(version)) return; await load(false, '사진을 삭제했습니다.'); }
      catch (error) { if (current(version)) note(core.message(error), true); }
      finally { if (current(version)) controls(false); }
    });
    card.append(imageButton, remove); return card;
  }
  async function load(more = false, resultMessage = '') {
    const version = ++epoch; controls(true);
    if (!more) { clearGallery(); nextOffset = 0; }
    q('photo-empty').hidden = true; note('사진을 불러오고 있습니다…');
    try {
      if (!owner || !store) core.fail('LOGIN');
      const scope = store.scope(day), result = await scope.list(nextOffset);
      if (!current(version)) return;
      let failed = 0;
      for (const photo of result.photos) {
        if ([...q('photo-gallery').children].some(card => card.dataset.photoName === photo.name)) continue;
        try {
          const blob = await scope.download(photo.name); if (!current(version)) return;
          const index = q('photo-gallery').children.length;
          q('photo-gallery').append(photoCard(photo, blob, index));
        } catch (error) { if (!current(version)) return; failed++; }
      }
      if (!current(version)) return;
      nextOffset = result.nextOffset; q('photo-more').hidden = !result.hasMore;
      const count = q('photo-gallery').children.length;
      q('photo-empty').hidden = count > 0 || failed > 0;
      note(failed ? `${failed}장의 사진을 불러오지 못했습니다. 사진 새로고침을 눌러 다시 확인해 주세요.` : resultMessage || (count ? `사진 ${count}장을 보고 있습니다.${result.hasMore ? ' 더 보기를 눌러 나머지 사진을 확인하세요.' : ''}` : '이 날짜에 사진을 추가할 수 있습니다.'), failed > 0);
    } catch (error) { if (current(version)) note(core.message(error), true); }
    finally { if (current(version)) controls(false); }
  }
  async function select(files) {
    if (!files.length || busy || !owner) return;
    if (pending.length + files.length > 10) { note('한 번에 10장까지 선택해 주세요. 먼저 선택한 사진을 저장한 뒤 추가할 수 있습니다.', true); return; }
    const version = epoch; controls(true); let failed = 0, reason = '';
    for (let i = 0; i < files.length; i++) {
      if (!current(version)) return;
      note(`사진 ${i + 1}/${files.length}장을 준비하고 있습니다…`);
      try { const blob = await normalize(files[i]); if (!current(version)) return; pending.push({blob, id:crypto.randomUUID(), url:url(blob)}); renderPending(); }
      catch (error) { failed++; reason = core.message(error); }
    }
    if (current(version)) { controls(false); note(failed ? `${failed}장을 준비하지 못했습니다. ${reason}${pending.length ? ' 준비된 사진은 저장할 수 있습니다.' : ''}` : `${pending.length}장을 선택했습니다. ‘선택한 사진 저장’을 누르면 ${day}에 저장됩니다.`, failed > 0); }
  }
  async function save() {
    if (busy || !pending.length || !owner) return;
    const version = epoch, selected = day, scope = store.scope(day), batch = [...pending]; controls(true);
    let saved = 0, failed = 0;
    for (let i = 0; i < batch.length; i++) {
      if (!current(version)) return;
      note(`사진 ${i + 1}/${batch.length}장을 저장하고 있습니다…`);
      try {
        await scope.upload(batch[i].blob, batch[i].id); if (!current(version)) return;
        saved++; release(batch[i].url); pending = pending.filter(photo => photo !== batch[i]); renderPending();
      } catch (error) {
        if (!current(version)) return;
        failed++;
      }
    }
    if (!current(version)) return;
    // Keep failed selections; the store reconciles interrupted uploads without overwriting.
    controls(false);
    await load(false, `${selected}에 ${saved}장을 저장했습니다.${failed ? ` ${failed}장은 저장을 확인하지 못했습니다. 아래 선택한 사진을 다시 저장해 주세요.` : ''}`);
    if (failed && active) q('photo-status').dataset.error = 'true';
  }
  q('photo-pick').addEventListener('click', () => { picking = true; q('photo-files').click(); });
  q('photo-camera').addEventListener('click', () => { picking = true; q('photo-camera-file').click(); });
  for (const id of ['photo-files', 'photo-camera-file']) {
    q(id).addEventListener('change', event => { picking = false; const files = [...event.target.files]; event.target.value = ''; void select(files); });
    q(id).addEventListener('cancel', () => { picking = false; });
  }
  q('photo-save').addEventListener('click', () => void save());
  q('photo-clear').addEventListener('click', () => { clearPending(); note('사진 선택을 취소했습니다.'); });
  q('photo-refresh').addEventListener('click', () => { if (!busy) void load(); });
  q('photo-more').addEventListener('click', () => { if (!busy) void load(true); });
  q('photo-viewer-close').addEventListener('click', clearViewer);
  viewer.addEventListener('close', () => q('photo-large').removeAttribute('src'));
  function close() { active = false; picking = false; ++epoch; clearPending(); clearGallery(); controls(false); section.hidden = true; }
  function sessionChanged(session) {
    authRevision++;
    const next = session?.user?.id || '';
    if (next !== owner) { owner = next; close(); day = ''; }
  }
  if (!testMode && client) {
    client.auth.onAuthStateChange((_event, session) => sessionChanged(session));
    const revision = authRevision;
    client.auth.getSession().then(({data, error}) => { if (revision === authRevision) sessionChanged(error ? null : data?.session); }).catch(() => { if (revision === authRevision) sessionChanged(null); });
  }
  window.DAYFLOW_PHOTOS = {
    open(key) {
      if (active && day === key) return;
      close(); day = key; active = true; section.hidden = false;
      void load();
    }, close
  };
  // File choosers and confirmation dialogs also trigger window focus: do not refresh there.
  document.addEventListener('visibilitychange', () => { if (!document.hidden && active && !busy && !picking && !pending.length && !viewer.open) void load(); });
})();
