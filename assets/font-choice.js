(function () {
  'use strict';
  // Per-account font choice. Saved in the Google account's profile (user_metadata.unharu_font)
  // so it follows the account to other devices, and cached in this browser for a fast start.
  const FONTS = [
    { id: '', name: '나눔스퀘어', family: '"NanumSquare"', note: '지금까지 쓰던 기본 글꼴이에요.' },
    { id: 'pretendard', name: '프리텐다드', family: '"Pretendard Variable"', note: '요즘 앱에서 가장 많이 쓰는 글꼴이에요. 작은 글씨도 또렷해요.' },
    { id: 'nanum-square-neo', name: '나눔스퀘어 네오', family: '"NanumSquare Neo"', note: '기본 글꼴을 네이버가 새로 다듬은 버전이에요.' },
    { id: 'suit', name: '수트', family: '"SUIT Variable"', note: '조금 더 둥글고 단정한 느낌이에요.' },
    { id: 'wanted-sans', name: '원티드 산스', family: '"Wanted Sans Variable"', note: '시간·금액 같은 숫자가 반듯해요.' },
    { id: 'noto-sans-kr', name: '본고딕', family: '"Noto Sans KR Variable"', note: '어느 기기에서나 무난하게 보여요.' }
  ];
  const valid = (id) => FONTS.some((font) => font.id === id);
  const LAST_KEY = 'unharu-font-v1:last';
  const client = window.DAYFLOW_SUPABASE_CLIENT || null;
  const testMode = typeof IS_TEST_MODE !== 'undefined' && IS_TEST_MODE;
  let userId = '';
  let saved = '';

  function keyFor(id) { return 'unharu-font-v1:' + (id || (testMode ? 'test' : 'guest')); }
  function readLocal(key) {
    try { const value = localStorage.getItem(key); return value !== null && valid(value) ? value : null; }
    catch { return null; }
  }
  function writeLocal(id) {
    try { localStorage.setItem(keyFor(userId), id); localStorage.setItem(LAST_KEY, id); } catch {}
  }
  function apply(id) {
    if (id) document.documentElement.dataset.font = id;
    else delete document.documentElement.dataset.font;
  }

  // Apply the last font used in this browser right away, before the account finishes loading.
  saved = readLocal(testMode ? keyFor('') : LAST_KEY) || '';
  apply(saved);

  function sessionChanged(session) {
    userId = session?.user?.id || '';
    const remote = session?.user?.user_metadata?.unharu_font;
    if (typeof remote === 'string' && valid(remote)) {
      saved = remote;
      writeLocal(saved);
    } else {
      saved = readLocal(keyFor(userId)) || '';
    }
    if (!dialog.open) apply(saved);
  }

  const dialog = document.createElement('dialog');
  dialog.id = 'font-settings-dialog';
  dialog.setAttribute('aria-labelledby', 'font-settings-title');
  dialog.innerHTML = `<div class="font-heading"><h2 id="font-settings-title">글꼴 설정</h2><button type="button" id="font-close">닫기</button></div>
    <p>마음에 드는 글꼴을 고르면 바로 미리 볼 수 있어요. 저장하면 이 계정으로 로그인한 모든 기기에 적용돼요.</p>
    <div class="font-options" id="font-options" role="radiogroup" aria-label="글꼴 선택"></div>
    <p id="font-feedback" role="status" aria-live="polite"></p>
    <div class="font-footer"><button type="button" id="font-cancel">취소</button><button type="button" id="font-save">이 글꼴로 저장</button></div>`;
  document.body.append(dialog);
  const q = (id) => document.getElementById(id);
  const feedback = (message, state = '') => { q('font-feedback').textContent = message; q('font-feedback').dataset.state = state; };

  for (const font of FONTS) {
    const label = document.createElement('label');
    label.className = 'font-option';
    const radio = document.createElement('input');
    radio.type = 'radio'; radio.name = 'app-font'; radio.value = font.id;
    radio.addEventListener('change', () => { apply(font.id); feedback(''); });
    const text = document.createElement('span');
    text.style.fontFamily = font.family + ', sans-serif';
    const name = document.createElement('strong'); name.textContent = font.name + (font.id ? '' : ' (기본)');
    const sample = document.createElement('span'); sample.className = 'font-sample'; sample.textContent = '오늘 14:30 치과 예약 · 점심 12,500원';
    const note = document.createElement('small'); note.textContent = font.note;
    text.append(name, sample, note);
    label.append(radio, text);
    q('font-options').append(label);
  }

  function open() {
    for (const radio of dialog.querySelectorAll('input[name=app-font]')) radio.checked = radio.value === saved;
    feedback('');
    if (!dialog.open) dialog.showModal();
    dialog.querySelector('input[name=app-font]:checked')?.focus();
  }
  function close() { dialog.close(); apply(saved); }
  dialog.addEventListener('close', () => apply(saved));
  for (const id of ['font-close', 'font-cancel']) q(id).addEventListener('click', close);

  q('font-save').addEventListener('click', async () => {
    const choice = dialog.querySelector('input[name=app-font]:checked')?.value ?? saved;
    const button = q('font-save');
    saved = choice;
    writeLocal(choice);
    if (!client || !userId) {
      close();
      showToast('글꼴을 바꿨어요', '이 브라우저에 저장했어요.');
      return;
    }
    button.disabled = true;
    feedback('내 계정에 저장하고 있어요…');
    const owner = userId;
    const { error } = await client.auth.updateUser({ data: { unharu_font: choice } });
    button.disabled = false;
    if (owner !== userId) return;
    if (error) {
      console.error('DAYFLOW font save failed', error);
      feedback('이 기기에는 적용했지만 계정에는 저장하지 못했어요. 인터넷 연결을 확인한 뒤 다시 저장해 주세요.', 'error');
      return;
    }
    close();
    showToast('글꼴을 바꿨어요', '이 계정으로 로그인한 다른 기기에도 적용돼요.');
  });

  if (client) {
    client.auth.onAuthStateChange((_event, session) => { window.setTimeout(() => sessionChanged(session), 0); });
    client.auth.getSession().then(({ data }) => sessionChanged(data?.session)).catch(() => {});
  }

  q('font-menu')?.addEventListener('click', open);
  window.DAYFLOW_FONT_SETTINGS = Object.freeze({ open, fonts: FONTS.map((font) => font.id), current: () => saved });
})();
