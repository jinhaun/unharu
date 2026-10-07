(function () {
  'use strict';

  const q = (selector) => document.querySelector(selector);
  const isTestMode = ['localhost','127.0.0.1','[::1]'].includes(window.location.hostname) && new URLSearchParams(window.location.search).has('test');
  const cacheOwnerKey = 'dayflow-cloud-cache-user-v1';
  const gate = q('#auth-gate');
  const authStatus = q('#auth-status');
  const loginButton = q('#google-signin');
  const accountButton = q('#auth-account-button');
  const signoutButton = q('#auth-signout');
  const migrationDialog = q('#cloud-migration-dialog');
  const migrationStatus = q('#migration-status');
  const importButton = q('#import-local-cloud');
  const emptyButton = q('#start-empty-cloud');
  const config = window.DAYFLOW_SUPABASE_CONFIG || {};
  let client = null;
  let activeSession = null;
  let cloudReady = false;
  let initializedUserId = '';
  let saveTimer = null;
  let saveChain = Promise.resolve();
  let sessionGeneration = 0;

  function setAuthStatus(message, state = '') {
    authStatus.textContent = message;
    authStatus.dataset.state = state;
  }

  function setSavedStatus(message) {
    const status = q('#saved-status');
    if (status) status.textContent = message;
  }

  function setGateVisible(visible) {
    gate.hidden = !visible;
    gate.setAttribute('aria-hidden', String(!visible));
    const app = q('.app');
    app.hidden = visible;
    app.inert = visible;
    if (visible) document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
  }

  function setAccount(session) {
    const email = session?.user?.email || 'Google 계정';
    accountButton.textContent = email;
    accountButton.disabled = false;
    accountButton.title = email;
    signoutButton.hidden = false;
    q('#privacy-copy').textContent = '일정·소비·저장 경로는 로그인한 Google 계정의 전용 공간에 저장됩니다.';
  }

  function clearAccount() {
    accountButton.textContent = '로그인 필요';
    accountButton.disabled = true;
    accountButton.removeAttribute('title');
    signoutButton.hidden = true;
    q('#privacy-copy').textContent = 'Google 로그인 후 본인의 일정·소비·저장 경로만 불러옵니다.';
  }

  function clearLocalSnapshot() {
    items = [];
    savedTransitRoutes = [];
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(ROUTE_STORAGE_KEY);
    renderSavedTransitRoutes();
    renderView();
  }

  function keepSafeArrays(state) {
    return {
      items: Array.isArray(state?.items)
        ? state.items.filter((item) => item && typeof item === 'object' && !String(item.id || '').startsWith('seed-'))
        : [],
      savedRoutes: Array.isArray(state?.saved_routes)
        ? state.saved_routes.filter((route) => route && route.origin && route.destination).slice(0, 8)
        : []
    };
  }

  function applySnapshot(nextItems, nextRoutes, userId) {
    items = nextItems;
    savedTransitRoutes = nextRoutes;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    localStorage.setItem(ROUTE_STORAGE_KEY, JSON.stringify(savedTransitRoutes));
    localStorage.setItem(cacheOwnerKey, userId);
    renderSavedTransitRoutes();
    renderView();
  }

  async function writeCloudSnapshot({ message = '내 계정에 저장됨' } = {}) {
    if (!client || !activeSession || !cloudReady) return false;
    const generation = sessionGeneration;
    const snapshot = {
      user_id: activeSession.user.id,
      items: JSON.parse(JSON.stringify(items)),
      saved_routes: JSON.parse(JSON.stringify(savedTransitRoutes)),
      schema_version: 1,
      updated_at: new Date().toISOString()
    };
    setSavedStatus('내 계정에 저장 중…');
    const { error } = await client
      .from('dayflow_user_state')
      .upsert(snapshot, { onConflict: 'user_id' });
    if (generation !== sessionGeneration || activeSession?.user.id !== snapshot.user_id) return false;
    if (error) {
      setSavedStatus('클라우드 저장 확인 필요');
      showToast('클라우드 저장 실패', '인터넷 연결 뒤 다시 저장해 주세요. 브라우저에는 기록이 남아 있습니다.');
      console.error('DAYFLOW cloud save failed', error);
      return false;
    }
    localStorage.setItem(cacheOwnerKey, activeSession.user.id);
    setSavedStatus(message);
    return true;
  }

  function scheduleCloudSave() {
    if (!cloudReady || !activeSession) return;
    clearTimeout(saveTimer);
    setSavedStatus('내 계정에 저장 대기 중…');
    saveTimer = window.setTimeout(() => {
      saveChain = saveChain.then(() => writeCloudSnapshot()).catch((error) => {
        setSavedStatus('클라우드 저장 확인 필요');
        console.error('DAYFLOW cloud sync queue failed', error);
      });
    }, 250);
  }

  const saveBrowserItems = persist;
  persist = function (message) {
    saveBrowserItems(message);
    scheduleCloudSave();
  };

  const saveBrowserRoutes = persistSavedTransitRoutes;
  persistSavedTransitRoutes = function (message) {
    const result = saveBrowserRoutes(message);
    if (result) scheduleCloudSave();
    return result;
  };

  async function createEmptyCloudState() {
    cloudReady = true;
    const saved = await writeCloudSnapshot({ message: '빈 계정으로 시작함' });
    if (!saved) cloudReady = false;
    return saved;
  }

  function showMigrationChoice() {
    q('#migration-item-count').textContent = `${items.length}건`;
    q('#migration-route-count').textContent = `${savedTransitRoutes.length}개`;
    migrationStatus.textContent = '아직 계정에는 저장하지 않았습니다.';
    migrationStatus.dataset.state = '';
    importButton.disabled = false;
    emptyButton.disabled = false;
    if (!migrationDialog.open) migrationDialog.showModal();
  }

  async function loadCloudState(session) {
    const generation = sessionGeneration;
    activeSession = session;
    cloudReady = false;
    setGateVisible(true);
    setAccount(session);
    setAuthStatus('내 운하루 기록을 불러오고 있습니다.');
    setSavedStatus('내 계정 확인 중…');

    const previousOwner = localStorage.getItem(cacheOwnerKey);
    if (previousOwner && previousOwner !== session.user.id) clearLocalSnapshot();

    const { data, error } = await client
      .from('dayflow_user_state')
      .select('items, saved_routes, updated_at')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (generation !== sessionGeneration || activeSession?.user.id !== session.user.id) return;

    if (error) {
      setAuthStatus('운하루 저장소 연결이 아직 끝나지 않았습니다. 연결 설정을 확인해 주세요.', 'error');
      setSavedStatus('연결 설정 필요');
      console.error('DAYFLOW cloud load failed', error);
      setGateVisible(true);
      return;
    }

    if (data) {
      const safe = keepSafeArrays(data);
      applySnapshot(safe.items, safe.savedRoutes, session.user.id);
      cloudReady = true;
      setSavedStatus('내 계정에서 불러옴');
      setGateVisible(false);
      return;
    }

    setGateVisible(false);
    if (items.length || savedTransitRoutes.length) {
      showMigrationChoice();
      setSavedStatus('기존 기록 가져오기 필요');
      return;
    }

    applySnapshot([], [], session.user.id);
    const created = await createEmptyCloudState();
    if (generation !== sessionGeneration || activeSession?.user.id !== session.user.id) return;
    if (!created) {
      setAuthStatus('빈 운하루 공간을 만들지 못했습니다. 잠시 후 다시 로그인해 주세요.', 'error');
      setGateVisible(true);
    }
  }

  async function applySession(session) {
    if (session && initializedUserId === session.user.id && cloudReady) {
      activeSession = session;
      return;
    }
    sessionGeneration += 1;
    clearTimeout(saveTimer);
    if (!session) {
      activeSession = null;
      cloudReady = false;
      initializedUserId = '';
      if (localStorage.getItem(cacheOwnerKey)) clearLocalSnapshot();
      clearAccount();
      setSavedStatus('로그인 필요');
      setAuthStatus('Google 계정으로 로그인하면 본인의 기록만 불러옵니다.');
      setGateVisible(true);
      return;
    }
    initializedUserId = session.user.id;
    await loadCloudState(session);
  }

  importButton.addEventListener('click', async () => {
    importButton.disabled = true;
    emptyButton.disabled = true;
    migrationStatus.textContent = '기존 기록을 내 계정으로 옮기고 있습니다…';
    cloudReady = true;
    const saved = await writeCloudSnapshot({ message: '기존 기록을 내 계정으로 옮김' });
    if (!saved) {
      cloudReady = false;
      migrationStatus.textContent = '옮기지 못했습니다. 인터넷 연결을 확인한 뒤 다시 눌러 주세요.';
      migrationStatus.dataset.state = 'error';
      importButton.disabled = false;
      emptyButton.disabled = false;
      return;
    }
    migrationDialog.close();
    showToast('계정 저장 완료', '기존 일정·소비·교통 경로를 내 Google 계정으로 옮겼습니다.');
  });

  emptyButton.addEventListener('click', async () => {
    if (!window.confirm('이 브라우저의 기존 운하루 기록을 비우고 새 계정으로 시작할까요?')) return;
    importButton.disabled = true;
    emptyButton.disabled = true;
    migrationStatus.textContent = '빈 운하루 공간을 만들고 있습니다…';
    clearLocalSnapshot();
    localStorage.setItem(cacheOwnerKey, activeSession.user.id);
    const created = await createEmptyCloudState();
    if (!created) {
      migrationStatus.textContent = '빈 공간을 만들지 못했습니다. 다시 시도해 주세요.';
      migrationStatus.dataset.state = 'error';
      importButton.disabled = false;
      emptyButton.disabled = false;
      return;
    }
    migrationDialog.close();
    showToast('새 계정 준비 완료', '빈 운하루 캘린더로 시작합니다.');
  });

  loginButton.addEventListener('click', async () => {
    if (!client) return;
    if (!/^https?:$/.test(window.location.protocol)) {
      setAuthStatus('Google 로그인은 파일을 직접 연 화면이 아니라 http 또는 https 주소에서 사용할 수 있습니다.', 'error');
      return;
    }
    loginButton.disabled = true;
    setAuthStatus('Google 로그인 화면으로 이동하고 있습니다.');
    const redirectTo = window.location.hostname === 'unharu.vercel.app'
      ? 'https://unharu.vercel.app/'
      : `${window.location.origin}${window.location.pathname}`;
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo }
    });
    if (error) {
      loginButton.disabled = false;
      setAuthStatus(`로그인을 시작하지 못했습니다: ${error.message}`, 'error');
    }
  });

  signoutButton.addEventListener('click', async () => {
    signoutButton.disabled = true;
    setSavedStatus('로그아웃 중…');
    const { error } = await client.auth.signOut();
    signoutButton.disabled = false;
    if (error) {
      showToast('로그아웃 실패', error.message);
      return;
    }
    window.location.reload();
  });

  async function start() {
    if (isTestMode) {
      setGateVisible(false);
      accountButton.textContent = '기능 시험 모드';
      accountButton.disabled = true;
      setSavedStatus('시험 기록은 브라우저에 저장됨');
      return;
    }

    if (!window.supabase?.createClient) {
      loginButton.disabled = true;
      setAuthStatus('로그인 부품을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.', 'error');
      setSavedStatus('로그인 부품 확인 필요');
      return;
    }
    if (!config.url || !config.publishableKey) {
      loginButton.disabled = true;
      setAuthStatus('기존 사주 프로젝트의 공개 연결값을 준비해야 합니다. prepare-supabase-config.ps1을 실행해 주세요.', 'error');
      setSavedStatus('연결값 설정 필요');
      return;
    }

    client = window.supabase.createClient(config.url, config.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'implicit'
      }
    });
    window.DAYFLOW_SUPABASE_CLIENT = client;
    client.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => applySession(session), 0);
    });
    const { data, error } = await client.auth.getSession();
    if (error) {
      setAuthStatus(`로그인 상태를 확인하지 못했습니다: ${error.message}`, 'error');
      setSavedStatus('로그인 확인 실패');
      return;
    }
    await applySession(data.session);
  }

  start().catch((error) => {
    setAuthStatus(`Google 로그인 준비 중 오류가 발생했습니다: ${error.message}`, 'error');
    setSavedStatus('로그인 준비 실패');
    console.error('DAYFLOW auth initialization failed', error);
  });
})();
