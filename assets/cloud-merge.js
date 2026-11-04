/* 여러 기기에서 쓴 기록 합치기.
   base   = 이 기기가 마지막으로 계정과 맞춘 목록
   local  = 지금 이 기기 화면의 목록
   remote = 지금 계정에 저장된 목록(다른 기기가 바꿨을 수 있음)
   결과는 remote에서 시작해 "이 기기에서 base 이후 바뀐 것"(추가·수정·삭제)만 얹습니다.
   그래서 다른 기기에서 넣은 기록은 지워지지 않습니다. 같은 기록을 양쪽에서 고쳤다면 이 기기 쪽을 따릅니다. */
(function () {
  'use strict';
  const keyOf = (entry) => entry && typeof entry === 'object'
    ? (typeof entry.id === 'string' && entry.id ? `id:${entry.id}` : `json:${canonical(entry)}`)
    : null;
  // 계정 저장 공간은 기록 안 항목 순서를 바꿔 저장하므로, 순서와 상관없이 내용이 같으면 같다고 봅니다.
  const canonical = (value) => Array.isArray(value)
    ? `[${value.map(canonical).join(',')}]`
    : value && typeof value === 'object'
      ? `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
      : JSON.stringify(value) ?? 'null';
  const same = (a, b) => canonical(a) === canonical(b);
  function index(list) {
    const map = new Map();
    for (const entry of Array.isArray(list) ? list : []) {
      const key = keyOf(entry);
      if (key) map.set(key, entry);
    }
    return map;
  }

  // canDelete(기록): 이 기기 목록에서 빠진 기록을 계정에서도 지워도 되는지(삭제 버튼으로 지운 기록만 true).
  // 표시가 없는 기록은 다른 이유로 빠졌더라도 계정 쪽 기록을 그대로 둡니다.
  function merge3(base, local, remote, canDelete = () => true) {
    const before = index(base), mine = index(local), theirs = index(remote);
    const result = new Map(theirs);
    for (const [key, entry] of before) if (!mine.has(key) && canDelete(entry)) result.delete(key);
    for (const [key, entry] of mine) {
      const previous = before.get(key);
      if (!previous || !same(previous, entry)) result.set(key, entry);
    }
    // 이 기기의 순서를 먼저 지키고, 다른 기기에서만 생긴 기록은 뒤에 붙입니다.
    const ordered = [];
    for (const key of mine.keys()) if (result.has(key)) { ordered.push(result.get(key)); result.delete(key); }
    for (const key of theirs.keys()) if (result.has(key)) { ordered.push(result.get(key)); result.delete(key); }
    return ordered;
  }

  // 두 목록에 같은 기록이 같은 내용으로 들어 있는지(순서는 보지 않음).
  function sameEntries(a, b) {
    const left = index(a), right = index(b);
    if (left.size !== right.size) return false;
    for (const [key, entry] of left) if (!right.has(key) || !same(entry, right.get(key))) return false;
    return true;
  }

  window.DAYFLOW_MERGE = Object.freeze({ merge3, same, sameEntries });
})();
