(function (root) {
  'use strict';
  const BUCKET = 'unharu-day-photos';
  const PAGE_SIZE = 24;
  const MAX_FILE = 20 * 1024 * 1024;
  const MAX_STORED = 4 * 1024 * 1024;
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  const filename = /^[a-f0-9-]{36}\.jpg$/i;
  function fail(code) { const e = new Error(code); e.code = code; throw e; }
  function validDate(day) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return false;
    const d = new Date(`${day}T12:00:00Z`);
    return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === day;
  }
  function folder(owner, day) {
    if (!uuid.test(owner || '')) fail('LOGIN');
    if (!validDate(day)) fail('DATE');
    return `${owner}/${day}`;
  }
  function validateFile(file) {
    if (!file || !Number.isFinite(file.size) || file.size <= 0) fail('FILE');
    if (file.size > MAX_FILE) fail('SIZE');
    const type = (file.type || '').toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(type) &&
        !(type === '' && /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name || ''))) fail('FORMAT');
    return true;
  }
  function message(error) {
    const messages = {
      LOGIN: '로그인 후 사진을 이용해 주세요.', DATE: '날짜를 다시 선택해 주세요.',
      STALE: '계정이 바뀌어 작업을 멈췄습니다. 다시 로그인 상태를 확인해 주세요.',
      SIZE: '사진 한 장은 20메가바이트까지 선택할 수 있습니다.',
      FILE: '비어 있거나 읽을 수 없는 파일입니다.', FORMAT: '사진 파일을 선택해 주세요. 지원 형식은 JPEG·PNG·WebP이며 HEIC·HEIF는 기기가 지원할 때 열립니다.',
      DECODE: '이 기기에서 열 수 없는 사진입니다. 사진 앱에서 JPEG로 저장한 뒤 다시 선택해 주세요.',
      ENCODE: '사진 크기를 줄이지 못했습니다. 더 작은 사진으로 다시 시도해 주세요.',
      PATH: '사진 정보를 확인하지 못했습니다. 사진 목록을 새로고침해 주세요.',
      REMOVE: '삭제를 확인하지 못했습니다. 새로고침하여 확인한 뒤 다시 시도해 주세요.'
    };
    if (messages[error?.code]) return messages[error.code];
    if (String(error?.statusCode || error?.status) === '413') return messages.SIZE;
    if (String(error?.statusCode || error?.status) === '401') return messages.LOGIN;
    return '사진 저장소에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요. 계속되면 사진 저장소 설정을 확인해야 합니다.';
  }
  function createStore(client, ownerNow) {
    function scope(day) {
      const owner = ownerNow(), prefix = folder(owner, day);
      const current = () => { if (ownerNow() !== owner) fail('STALE'); };
      const bucket = client.storage.from(BUCKET);
      function path(name) {
        if (!filename.test(name) || !uuid.test(name.slice(0, -4))) fail('PATH');
        return `${prefix}/${name}`;
      }
      return {
        async list(offset = 0) {
          current();
          if (!Number.isInteger(offset) || offset < 0) fail('PATH');
          const result = await bucket.list(prefix, {limit: PAGE_SIZE, offset, sortBy: {column: 'created_at', order: 'desc'}});
          current(); if (result.error) throw result.error;
          if (!Array.isArray(result.data)) fail('PATH');
          return {photos: result.data.filter(row => row.id && filename.test(row.name) && uuid.test(row.name.slice(0, -4))), hasMore: result.data.length === PAGE_SIZE, nextOffset: offset + result.data.length};
        },
        async download(name) {
          current(); const result = await bucket.download(path(name));
          current(); if (result.error) throw result.error;
          if (!result.data || result.data.size > MAX_STORED || result.data.type !== 'image/jpeg') fail('FORMAT');
          return result.data;
        },
        async upload(blob, id) {
          current();
          if (blob.type !== 'image/jpeg' || !blob.size || blob.size > MAX_STORED || !uuid.test(id)) fail('ENCODE');
          const name = `${id}.jpg`;
          let result;
          try { result = await bucket.upload(path(name), blob, {contentType: 'image/jpeg', cacheControl: '0', upsert: false}); }
          catch (error) { result = {error}; }
          current();
          if (result.error) {
            // An interrupted response may follow a successful write. Reconcile the same immutable UUID.
            let existing;
            try { existing = await bucket.download(path(name)); } catch { throw result.error; }
            current();
            if (existing.error || !existing.data || existing.data.size !== blob.size) throw result.error;
            const [a, b] = await Promise.all([existing.data.arrayBuffer(), blob.arrayBuffer()]);
            current();
            const bytes = new Uint8Array(b);
            if (!new Uint8Array(a).every((value, i) => value === bytes[i])) throw result.error;
          }
          return name;
        },
        async remove(name) {
          current(); const result = await bucket.remove([path(name)]);
          current(); if (result.error) throw result.error;
          if (!Array.isArray(result.data) || !result.data.length) fail('REMOVE');
        }
      };
    }
    return {scope};
  }
  root.UNHARU_PHOTOS_CORE = {BUCKET, PAGE_SIZE, MAX_FILE, MAX_STORED, validDate, folder, validateFile, message, createStore, fail};
})(globalThis);
