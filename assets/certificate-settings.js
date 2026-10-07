(function() {
  'use strict';
  const core = window.DAYFLOW_CERT_CORE;
  const catalog = window.DAYFLOW_CERT_FEED?.certificates || [];
  const q = id => document.getElementById(id);
  let account = window.DAYFLOW_SHARING?.account() || '';
  let selected = [], draft = new Set(), readError = false;
  const dialog = document.createElement('dialog');
  dialog.id = 'certificate-settings-dialog';
  dialog.setAttribute('aria-labelledby','exam-settings-title');
  dialog.innerHTML = `<div class="exam-heading"><h2 id="exam-settings-title">시험 일정 설정</h2><button type="button" id="exam-close">닫기</button></div>
    <p>보고 싶은 시험을 여러 개 선택하세요. 선택한 시험의 접수·시험·발표 일정만 내 캘린더에 겹쳐 보입니다.</p>
    <p id="exam-storage-note">선택은 이 브라우저에서 계정별로 기억합니다. 다른 기기에는 자동으로 옮겨지지 않습니다.</p>
    <label for="exam-search">시험 검색</label><input id="exam-search" type="search" placeholder="예: 토익, SQLD, 한국사, 컴활" autocomplete="off" aria-describedby="exam-scope">
    <p id="exam-scope">등록된 시험 목록에서 검색합니다. 현재 2026년 하반기 자료이며 실시간 자동 갱신은 아닙니다. 접수 전 공식 안내를 확인하세요.</p>
    <p id="exam-selection-summary" role="status" aria-live="polite"></p>
    <div id="exam-results"></div><p id="exam-empty" hidden>등록된 시험이 없습니다. 다른 이름이나 약칭으로 검색해 보세요. 미등록 시험의 일정은 자동 생성하지 않습니다.</p>
    <p id="exam-feedback" role="alert"></p>
    <div class="exam-footer"><button type="button" id="exam-clear">모두 해제</button><button type="button" id="exam-cancel">취소</button><button type="button" id="exam-save">선택한 시험 보기</button></div>`;
  document.body.append(dialog);
  function storageKey() { return core.key(account, IS_TEST_MODE); }
  function load() {
    try { selected = core.read(localStorage, storageKey(), catalog); readError = false; }
    catch { selected = []; readError = true; }
  }
  function summary() {
    const chosen = catalog.filter(exam => draft.has(exam.id));
    q('exam-selection-summary').textContent = chosen.length ? `${chosen.length}개 선택 · ${chosen.map(exam => exam.label).join(' · ')}` : '아직 선택한 시험이 없습니다. 0개로 저장하면 시험 일정을 숨깁니다.';
  }
  function renderResults() {
    const matches = core.search(catalog, q('exam-search').value);
    q('exam-results').replaceChildren();
    q('exam-empty').hidden = matches.length > 0;
    for(const exam of matches) {
      const card = document.createElement('div'); card.className = 'exam-option';
      const label = document.createElement('label');
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = exam.id; checkbox.checked = draft.has(exam.id);
      const name = document.createElement('span'); name.textContent = exam.label + (exam.fullName === exam.label ? '' : ` · ${exam.fullName}`);
      label.append(checkbox,name);
      checkbox.addEventListener('change', () => { checkbox.checked ? draft.add(exam.id) : draft.delete(exam.id); summary(); });
      const status = document.createElement('span'); status.className = 'exam-status'; status.textContent = exam.status || '일정 제공';
      const note = document.createElement('small'); note.textContent = exam.note;
      const checked = document.createElement('small'); checked.textContent = exam.checkedAt ? `공식 안내 확인: ${exam.checkedAt}` : exam.events.length ? `기존 수록 자료: ${window.DAYFLOW_CERT_FEED.checkedAt} · 접수 전 공식 일정 재확인` : '확정 날짜 미수록 · 공식 안내에서 확인 필요';
      const link = document.createElement('a'); link.href = exam.officialUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = `${exam.label} 공식 안내 (새 창)`;
      card.append(label,status,note,checked,link);q('exam-results').append(card);
    }
    summary();
  }
  function updateNotice() {
    const chosen = catalog.filter(exam => selected.includes(exam.id));
    q('certificate-summary').textContent = chosen.length ? chosen.map(exam => exam.label).join(' · ') + ' — 내 일정과 함께 표시합니다.' : '선택한 시험이 없습니다. 시험 설정에서 추가하세요.';
    const notices = q('certificate-notices'); notices.replaceChildren();
    const scope = document.createElement('div'); scope.textContent = '2026년 하반기 수록 자료 · 변경될 수 있으므로 접수 전 공식 안내 확인';notices.append(scope);
    for(const exam of chosen.filter(exam => !exam.events.length)) {
      const row = document.createElement('div'); row.textContent = `${exam.label}: ${exam.note} `;
      const link = document.createElement('a');link.href=exam.officialUrl;link.target='_blank';link.rel='noopener noreferrer';link.textContent='공식 일정 확인';row.append(link);notices.append(row);
    }
  }
  function open() {
    draft = new Set(selected);q('exam-search').value='';
    q('exam-feedback').textContent = readError ? '저장된 시험 설정을 읽지 못했습니다. 브라우저 저장 허용 여부를 확인해 주세요. 저장을 누르면 시험 설정만 새로 저장합니다.' : '';
    renderResults();if(!dialog.open)dialog.showModal();q('exam-search').focus();
  }
  function close() { dialog.close(); }
  q('exam-search').addEventListener('input',renderResults);
  q('exam-clear').addEventListener('click',() => {draft.clear();renderResults();});
  for(const id of ['exam-close','exam-cancel'])q(id).addEventListener('click',close);
  q('exam-save').addEventListener('click',() => {
    try { selected = core.save(localStorage, storageKey(), [...draft], catalog); readError=false; }
    catch { q('exam-feedback').textContent='시험 설정을 저장하지 못했습니다. 브라우저 저장 공간이나 권한을 확인한 뒤 다시 시도해 주세요. 기존 선택은 변경하지 않았습니다.'; return; }
    updateNotice();close();showSelectedCertificates();
    const day=q('day-details-dialog');if(day?.open&&day.dataset.date)openDayDetails(day.dataset.date);
    showToast(selected.length ? '선택한 시험만 표시합니다.' : '시험 일정을 모두 숨겼습니다.');
  });
  window.addEventListener('dayflow-sharing-account-change',() => {
    const next = window.DAYFLOW_SHARING?.account() || '';if(next===account)return;
    account=next;close();load();draft.clear();updateNotice();
    if(showCertificates)showMyCalendar();
    const day=q('day-details-dialog');if(day?.open)day.close();
  });
  window.addEventListener('storage',event => {
    if(event.key!==null&&event.key!==storageKey())return;
    close();load();updateNotice();renderView();
    const day=q('day-details-dialog');if(day?.open&&day.dataset.date)openDayDetails(day.dataset.date);
  });
  load();updateNotice();
  window.DAYFLOW_CERT_SETTINGS=Object.freeze({open,selected:()=>[...selected]});
})();
