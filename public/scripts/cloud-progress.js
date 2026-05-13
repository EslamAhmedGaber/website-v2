(function () {
  const PROFILE_KEY = "eliteStudentProfileV1";
  const SOLVED_KEY = "solvedExpertiseQuestions";
  const SELECTED_KEY = "selectedExpertiseQuestions";
  const REVIEW_KEY = "eliteMistakeBoxV1";
  const READINESS_KEY = "eliteReadinessCheck";
  const ACTIVITY_KEY = "eliteStudyActivityV1";
  const PAPER_ATTEMPTS_KEY = "elitePaperAttemptsV1";
  const STUDY_TASKS_KEY = "eliteStudyTasksV1";
  const MOCK_HISTORY_KEY = "eliteMockExamHistoryV1";
  const EXAM_KEY = "eliteMockExamV1";
  const PLAN_KEY = "eliteStudyPlanSettings";
  const LEAD_KEY = "leadInfoV1";
  const COLLECTION = "student_progress";
  const SDK_VERSION = "10.12.5";
  const SYNC_KEYS = new Set([
    PROFILE_KEY,
    SOLVED_KEY,
    SELECTED_KEY,
    REVIEW_KEY,
    READINESS_KEY,
    ACTIVITY_KEY,
    PAPER_ATTEMPTS_KEY,
    STUDY_TASKS_KEY,
    MOCK_HISTORY_KEY,
    EXAM_KEY,
    PLAN_KEY,
    LEAD_KEY
  ]);

  const state = {
    configured: false,
    ready: false,
    user: null,
    auth: null,
    db: null,
    modules: null,
    syncTimer: null,
    lastSyncAt: null,
    error: ""
  };

  const els = {
    panel: document.getElementById("cloudSyncPanel"),
    status: document.getElementById("cloudStatus"),
    user: document.getElementById("cloudUser"),
    login: document.getElementById("googleLoginBtn"),
    logout: document.getElementById("googleLogoutBtn"),
    sync: document.getElementById("syncCloudBtn"),
    restore: document.getElementById("restoreCloudBtn")
  };

  function all(selector) {
    return [...document.querySelectorAll(selector)];
  }

  function firstName() {
    return (state.user?.displayName || "My").split(/\s+/).filter(Boolean)[0] || "My";
  }

  function ensureFloatingWidget() {
    if (!document.body || document.body.dataset.page === "progress" || document.querySelector(".cloud-floating-widget")) return;
    const widget = document.createElement("aside");
    widget.className = "cloud-floating-widget";
    widget.setAttribute("aria-label", "Google progress sync");
    widget.innerHTML = `
      <span data-cloud-mini-status>Save progress across devices</span>
      <button class="cloud-floating-login" type="button" data-cloud-login>Continue with Google</button>
      <a class="cloud-floating-account" href="progress.html" data-cloud-account hidden>My progress</a>
      <button class="cloud-floating-sync" type="button" data-cloud-sync hidden>Sync</button>
    `;
    document.body.append(widget);
  }

  function readJSON(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch (err) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function configured() {
    const setup = window.ELITE_FIREBASE || {};
    const config = setup.config || {};
    return Boolean(setup.enabled && config.apiKey && config.authDomain && config.projectId && config.appId);
  }

  function profile() {
    return readJSON(PROFILE_KEY, {});
  }

  function payload() {
    const currentProfile = profile();
    const displayName = state.user?.displayName || "";
    const email = state.user?.email || "";
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      student: {
        uid: state.user?.uid || "",
        name: currentProfile.name || displayName,
        email,
        targetGrade: currentProfile.targetGrade || "",
        examSession: currentProfile.examSession || "",
        weeklyTarget: Number(currentProfile.weeklyTarget || 30)
      },
      profile: currentProfile,
      solved: readJSON(SOLVED_KEY, []),
      selected: readJSON(SELECTED_KEY, []),
      reviewItems: readJSON(REVIEW_KEY, {}),
      readiness: readJSON(READINESS_KEY, {}),
      activity: readJSON(ACTIVITY_KEY, {}),
      paperAttempts: readJSON(PAPER_ATTEMPTS_KEY, []),
      studyTasks: readJSON(STUDY_TASKS_KEY, []),
      mockHistory: readJSON(MOCK_HISTORY_KEY, []),
      activeMock: readJSON(EXAM_KEY, {}),
      studyPlan: readJSON(PLAN_KEY, {}),
      leadInfo: readJSON(LEAD_KEY, {})
    };
  }

  function applyPayload(data) {
    if (!data || typeof data !== "object") return;
    if (data.profile) writeJSON(PROFILE_KEY, data.profile);
    if (Array.isArray(data.solved)) writeJSON(SOLVED_KEY, data.solved);
    if (Array.isArray(data.selected)) writeJSON(SELECTED_KEY, data.selected);
    if (data.reviewItems) writeJSON(REVIEW_KEY, data.reviewItems);
    if (data.readiness) writeJSON(READINESS_KEY, data.readiness);
    if (data.activity) writeJSON(ACTIVITY_KEY, data.activity);
    if (Array.isArray(data.paperAttempts)) writeJSON(PAPER_ATTEMPTS_KEY, data.paperAttempts);
    if (Array.isArray(data.studyTasks)) writeJSON(STUDY_TASKS_KEY, data.studyTasks);
    if (Array.isArray(data.mockHistory)) writeJSON(MOCK_HISTORY_KEY, data.mockHistory);
    if (data.activeMock) writeJSON(EXAM_KEY, data.activeMock);
    if (data.studyPlan) writeJSON(PLAN_KEY, data.studyPlan);
    if (data.leadInfo) writeJSON(LEAD_KEY, data.leadInfo);
  }

  function patchLocalStorageSync() {
    if (window.__eliteCloudStoragePatched) return;
    window.__eliteCloudStoragePatched = true;
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function patchedSetItem(key, value) {
      const result = originalSetItem.apply(this, arguments);
      try {
        if (this === localStorage && SYNC_KEYS.has(String(key)) && window.EliteCloud?.queueSync) {
          window.EliteCloud.queueSync();
        }
      } catch (err) {
        // Local storage writes should never be blocked by cloud sync.
      }
      return result;
    };
  }

  function updateGlobalUi(message = "") {
    ensureFloatingWidget();
    const signedIn = Boolean(state.user);
    const miniStatus = message
      || (!state.configured ? "Local progress only"
        : !signedIn ? "Save progress across devices"
          : state.lastSyncAt ? `Synced ${state.lastSyncAt}` : "Cloud sync active");

    all("[data-cloud-login]").forEach((button) => {
      button.hidden = signedIn;
      button.disabled = !state.configured;
      button.textContent = state.configured ? "Continue with Google" : "Google Sync";
    });

    all("[data-cloud-account]").forEach((link) => {
      link.hidden = !signedIn;
      link.textContent = `${firstName()} progress`;
      link.setAttribute("title", state.user?.email || "Open progress");
    });

    all("[data-cloud-sync]").forEach((button) => {
      button.hidden = !signedIn;
      button.disabled = !signedIn || !state.ready;
    });

    all("[data-cloud-mini-status]").forEach((status) => {
      status.textContent = miniStatus;
    });

    all(".cloud-floating-widget").forEach((widget) => {
      widget.classList.toggle("is-signed-in", signedIn);
      widget.classList.toggle("is-disabled", !state.configured);
    });
  }

  function updateUi(message = "") {
    updateGlobalUi(message);
    if (!els.panel) return;
    els.panel.classList.toggle("cloud-disabled", !state.configured);
    if (!state.configured) {
      if (els.status) els.status.textContent = "Cloud login is ready in the code. Add the free Firebase config to activate it.";
      if (els.user) els.user.textContent = "Local progress is still saving on this device.";
      [els.logout, els.sync, els.restore].forEach((button) => { if (button) button.disabled = true; });
      if (els.login) els.login.disabled = true;
      return;
    }

    const signedIn = Boolean(state.user);
    if (els.login) els.login.hidden = signedIn;
    if (els.logout) els.logout.hidden = !signedIn;
    [els.sync, els.restore].forEach((button) => { if (button) button.disabled = !signedIn; });
    if (els.user) {
      els.user.textContent = signedIn
        ? `${state.user.displayName || "Student"} - ${state.user.email || "Google account"}`
        : "Not signed in yet.";
    }
    if (els.status) {
      if (message) els.status.textContent = message;
      else if (!signedIn) els.status.textContent = "Sign in with Google to sync this progress across devices.";
      else if (state.lastSyncAt) els.status.textContent = `Cloud sync active. Last saved ${state.lastSyncAt}.`;
      else els.status.textContent = "Signed in. Press Sync now or keep solving; progress will save automatically.";
    }
  }

  function emitState() {
    window.dispatchEvent(new CustomEvent("elite-cloud-state", {
      detail: {
        configured: state.configured,
        ready: state.ready,
        user: state.user ? {
          uid: state.user.uid,
          name: state.user.displayName,
          email: state.user.email
        } : null,
        lastSyncAt: state.lastSyncAt,
        error: state.error
      }
    }));
  }

  async function loadModules() {
    if (state.modules) return state.modules;
    const [app, auth, firestore] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-firestore.js`)
    ]);
    state.modules = { app, auth, firestore };
    return state.modules;
  }

  async function init() {
    state.configured = configured();
    updateUi();
    emitState();
    if (!state.configured) return;

    try {
      const modules = await loadModules();
      const firebaseApp = modules.app.initializeApp(window.ELITE_FIREBASE.config);
      state.auth = modules.auth.getAuth(firebaseApp);
      state.db = modules.firestore.getFirestore(firebaseApp);
      state.ready = true;
      await modules.auth.getRedirectResult(state.auth).catch(() => null);
      modules.auth.onAuthStateChanged(state.auth, (user) => {
        state.user = user;
        updateUi();
        emitState();
        if (user) queueSync();
      });
    } catch (err) {
      state.error = err.message || "Firebase could not start.";
      updateUi(state.error);
      emitState();
    }
  }

  async function signIn() {
    if (!state.ready) {
      updateUi("Google login is loading. Try again in a moment.");
      return;
    }
    const provider = new state.modules.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      await state.modules.auth.signInWithPopup(state.auth, provider);
    } catch (err) {
      if (String(err.code || "").includes("popup")) {
        await state.modules.auth.signInWithRedirect(state.auth, provider);
        return;
      }
      state.error = err.message || "Google login failed.";
      updateUi(state.error);
      emitState();
    }
  }

  async function signOut() {
    if (!state.ready) return;
    await state.modules.auth.signOut(state.auth);
    state.user = null;
    updateUi("Signed out. Local progress still remains on this device.");
    emitState();
  }

  async function syncNow(source = "manual") {
    if (!state.ready || !state.user) {
      updateUi("Sign in with Google first.");
      return false;
    }
    const originalSyncText = els.sync?.textContent || "Sync now";
    const globalSyncButtons = all("[data-cloud-sync]");
    if (els.sync && source === "manual") {
      els.sync.disabled = true;
      els.sync.textContent = "Saving...";
    }
    if (source === "manual") {
      globalSyncButtons.forEach((button) => {
        button.disabled = true;
        button.textContent = "Saving";
      });
    }
    try {
      const data = payload();
      await state.modules.firestore.setDoc(
        state.modules.firestore.doc(state.db, COLLECTION, state.user.uid),
        {
          ...data,
          syncSource: source,
          serverUpdatedAt: state.modules.firestore.serverTimestamp()
        },
        { merge: true }
      );
      state.lastSyncAt = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      if (els.sync && source === "manual") {
        els.sync.textContent = "Saved";
        setTimeout(() => { els.sync.textContent = originalSyncText; }, 1600);
      }
      if (source === "manual") {
        globalSyncButtons.forEach((button) => {
          button.textContent = "Saved";
          setTimeout(() => { button.textContent = "Sync"; }, 1600);
        });
      }
      updateUi(source === "manual" ? `Saved to cloud at ${state.lastSyncAt}.` : "");
      emitState();
      return true;
    } catch (err) {
      state.error = err.message || "Cloud save failed.";
      updateUi(state.error);
      emitState();
      return false;
    } finally {
      if (els.sync) els.sync.disabled = !state.user;
      globalSyncButtons.forEach((button) => { button.disabled = !state.user; });
    }
  }

  async function restoreNow() {
    if (!state.ready || !state.user) {
      updateUi("Sign in with Google first.");
      return false;
    }
    try {
      const snap = await state.modules.firestore.getDoc(
        state.modules.firestore.doc(state.db, COLLECTION, state.user.uid)
      );
      if (!snap.exists()) {
        updateUi("No cloud progress found yet. Press Sync now first.");
        return false;
      }
      applyPayload(snap.data());
      updateUi("Cloud progress restored. Reloading...");
      setTimeout(() => window.location.reload(), 700);
      return true;
    } catch (err) {
      state.error = err.message || "Cloud restore failed.";
      updateUi(state.error);
      emitState();
      return false;
    }
  }

  function queueSync() {
    if (!state.ready || !state.user) return;
    clearTimeout(state.syncTimer);
    state.syncTimer = setTimeout(() => syncNow("auto"), 1600);
  }

  if (els.login) els.login.addEventListener("click", signIn);
  if (els.logout) els.logout.addEventListener("click", signOut);
  if (els.sync) els.sync.addEventListener("click", () => syncNow("manual"));
  if (els.restore) els.restore.addEventListener("click", restoreNow);
  document.addEventListener("click", (event) => {
    const login = event.target.closest("[data-cloud-login]");
    const sync = event.target.closest("[data-cloud-sync]");
    const logout = event.target.closest("[data-cloud-logout]");
    if (login) {
      event.preventDefault();
      signIn();
    } else if (sync) {
      event.preventDefault();
      syncNow("manual");
    } else if (logout) {
      event.preventDefault();
      signOut();
    }
  });

  window.EliteCloud = {
    init,
    signIn,
    signOut,
    syncNow,
    restoreNow,
    queueSync,
    state: () => ({ ...state, auth: null, db: null, modules: null })
  };

  patchLocalStorageSync();
  init();
})();
