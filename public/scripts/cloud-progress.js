(function () {
  const KEYS = {
    profile: "eliteStudentProfileV2",
    pathway: "elitePathway",
    modularUnit: "modularUnit",
    activeBank: "activeQuestionBank",
    layout: "elitePracticeLayout",
    solved: "elitePracticeSolved",
    selected: "elitePracticeSelected",
    mistakes: "elitePracticeMistakes",
    corrections: "eliteTopicCorrections"
  };

  const SDK_VERSION = "10.12.5";
  const ROOT_COLLECTION = "students";
  const PROGRESS_COLLECTION = "progress";
  const PROGRESS_DOC = "practice-v2";
  const SYNC_KEYS = new Set(Object.values(KEYS));

  const state = {
    configured: false,
    ready: false,
    user: null,
    auth: null,
    db: null,
    modules: null,
    syncTimer: null,
    lastSyncAt: null,
    hydratedUid: "",
    suppressSync: false,
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

  function readJSON(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function readString(key, fallback = "") {
    return localStorage.getItem(key) || fallback;
  }

  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function writeString(key, value) {
    if (value === undefined || value === null || value === "") {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, String(value));
  }

  function configured() {
    const setup = window.ELITE_FIREBASE || {};
    const config = setup.config || {};
    return Boolean(setup.enabled && config.apiKey && config.authDomain && config.projectId && config.appId);
  }

  function ensureFloatingWidget() {
    if (!document.body || document.getElementById("cloudSyncPanel") || document.querySelector(".cloud-floating-widget")) return;
    const widget = document.createElement("aside");
    widget.className = "cloud-floating-widget";
    widget.setAttribute("aria-label", "Google progress sync");
    widget.innerHTML = `
      <span data-cloud-mini-status>Save progress across devices</span>
      <button class="cloud-floating-login" type="button" data-cloud-login>Continue with Google</button>
      <a class="cloud-floating-account" href="/progress" data-cloud-account hidden>My progress</a>
      <button class="cloud-floating-sync" type="button" data-cloud-sync hidden>Sync</button>
    `;
    document.body.append(widget);
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function uniqueArray(...lists) {
    return [...new Set(lists.flatMap((list) => asArray(list)))];
  }

  function dateNumber(value, fallback) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    const parsed = Date.parse(value || "");
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function normalizeMistakes(value) {
    const now = Date.now();
    const normalized = {};
    const add = (id, raw = {}) => {
      if (!id) return;
      const key = String(id);
      const updatedAt = dateNumber(raw.updatedAt, now);
      const addedAt = dateNumber(raw.addedAt, updatedAt);
      normalized[key] = {
        id: key,
        reason: typeof raw.reason === "string" ? raw.reason : "manual",
        level: Math.max(0, Math.min(3, Number(raw.level || 0))),
        attempts: Math.max(1, Number(raw.attempts || 1)),
        addedAt,
        updatedAt,
        dueAt: dateNumber(raw.dueAt, now),
        masteredAt: raw.masteredAt ? dateNumber(raw.masteredAt, updatedAt) : null
      };
    };

    if (Array.isArray(value)) {
      value.forEach((id) => add(id));
    } else if (value && typeof value === "object") {
      Object.entries(value).forEach(([id, raw]) => {
        const source = raw && typeof raw === "object" ? raw : {};
        add(source.id || id, source);
      });
    }
    return normalized;
  }

  function mergeMistakes(localValue, cloudValue) {
    const localIsLegacyArray = Array.isArray(localValue);
    const merged = normalizeMistakes(cloudValue);
    const local = normalizeMistakes(localValue);
    for (const [id, localItem] of Object.entries(local)) {
      const cloudItem = merged[id];
      if (cloudItem && localIsLegacyArray) continue;
      if (!cloudItem || Number(localItem.updatedAt || 0) >= Number(cloudItem.updatedAt || 0)) {
        merged[id] = localItem;
      }
    }
    return merged;
  }

  function mergeCorrections(localMap, cloudMap) {
    const merged = { ...(cloudMap || {}) };
    for (const [id, localFix] of Object.entries(localMap || {})) {
      const cloudFix = merged[id];
      const localTime = Date.parse(localFix?.savedAt || "") || 0;
      const cloudTime = Date.parse(cloudFix?.savedAt || "") || 0;
      if (!cloudFix || localTime >= cloudTime) merged[id] = localFix;
    }
    return merged;
  }

  function publicState() {
    return {
      configured: state.configured,
      ready: state.ready,
      user: state.user ? {
        uid: state.user.uid,
        name: state.user.displayName,
        email: state.user.email
      } : null,
      lastSyncAt: state.lastSyncAt,
      error: state.error
    };
  }

  function exposeState() {
    const snapshot = publicState();
    window.CLOUD_SYNC = {
      state: snapshot,
      signIn,
      signOut,
      syncNow,
      restoreNow,
      queueSync
    };
    return snapshot;
  }

  function emitState() {
    const snapshot = exposeState();
    window.dispatchEvent(new CustomEvent("elite-cloud-state", { detail: snapshot }));
  }

  function emitLocalUpdated(reason) {
    window.dispatchEvent(new CustomEvent("elite-cloud-local-updated", { detail: { reason } }));
  }

  function profile() {
    return readJSON(KEYS.profile, {});
  }

  function payload() {
    const currentProfile = profile();
    const displayName = state.user?.displayName || "";
    const email = state.user?.email || "";
    return {
      version: 2,
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
      progress: {
        solved: readJSON(KEYS.solved, []),
        selected: readJSON(KEYS.selected, []),
        mistakes: normalizeMistakes(readJSON(KEYS.mistakes, {})),
        topicCorrections: readJSON(KEYS.corrections, {})
      },
      preferences: {
        pathway: readString(KEYS.pathway, "linear"),
        modularUnit: readString(KEYS.modularUnit, ""),
        activeBank: readString(KEYS.activeBank, "all"),
        layout: readString(KEYS.layout, "grid")
      }
    };
  }

  function applyPayload(data, options = {}) {
    if (!data || typeof data !== "object") return false;
    const merge = Boolean(options.merge);
    const progress = data.progress || {};
    const preferences = data.preferences || {};

    state.suppressSync = true;
    try {
      if (data.profile) writeJSON(KEYS.profile, data.profile);

      const solved = merge
        ? uniqueArray(readJSON(KEYS.solved, []), progress.solved)
        : asArray(progress.solved);
      const selected = merge
        ? uniqueArray(readJSON(KEYS.selected, []), progress.selected)
        : asArray(progress.selected);
      const mistakes = merge
        ? mergeMistakes(readJSON(KEYS.mistakes, {}), progress.mistakes)
        : normalizeMistakes(progress.mistakes);
      const corrections = merge
        ? mergeCorrections(readJSON(KEYS.corrections, {}), progress.topicCorrections || {})
        : (progress.topicCorrections || {});

      writeJSON(KEYS.solved, solved);
      writeJSON(KEYS.selected, selected);
      writeJSON(KEYS.mistakes, mistakes);
      writeJSON(KEYS.corrections, corrections);

      if (!merge) {
        writeString(KEYS.pathway, preferences.pathway || "linear");
        writeString(KEYS.modularUnit, preferences.modularUnit || "");
        writeString(KEYS.activeBank, preferences.activeBank || "all");
        writeString(KEYS.layout, preferences.layout || "grid");
      } else {
        if (!localStorage.getItem(KEYS.pathway) && preferences.pathway) writeString(KEYS.pathway, preferences.pathway);
        if (!localStorage.getItem(KEYS.modularUnit) && preferences.modularUnit) writeString(KEYS.modularUnit, preferences.modularUnit);
        if (!localStorage.getItem(KEYS.activeBank) && preferences.activeBank) writeString(KEYS.activeBank, preferences.activeBank);
        if (!localStorage.getItem(KEYS.layout) && preferences.layout) writeString(KEYS.layout, preferences.layout);
      }
    } finally {
      state.suppressSync = false;
    }

    emitLocalUpdated(options.reason || "cloud");
    return true;
  }

  function progressDoc() {
    return state.modules.firestore.doc(
      state.db,
      ROOT_COLLECTION,
      state.user.uid,
      PROGRESS_COLLECTION,
      PROGRESS_DOC
    );
  }

  function patchLocalStorageSync() {
    if (window.__eliteCloudStoragePatched) return;
    window.__eliteCloudStoragePatched = true;
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function patchedSetItem(key, value) {
      const result = originalSetItem.apply(this, arguments);
      try {
        if (!state.suppressSync && this === localStorage && SYNC_KEYS.has(String(key)) && window.EliteCloud?.queueSync) {
          window.EliteCloud.queueSync();
        }
      } catch (_) {
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
      if (els.status) els.status.textContent = "Google sync is not configured yet. Local progress still works.";
      if (els.user) els.user.textContent = "Local progress is saving on this device.";
      [els.logout, els.sync, els.restore].forEach((button) => { if (button) button.disabled = true; });
      if (els.login) els.login.disabled = true;
      return;
    }

    const signedIn = Boolean(state.user);
    if (els.login) els.login.hidden = signedIn;
    if (els.logout) els.logout.hidden = !signedIn;
    [els.sync, els.restore].forEach((button) => { if (button) button.disabled = !signedIn || !state.ready; });

    if (els.user) {
      els.user.textContent = signedIn
        ? `${state.user.displayName || "Student"} - ${state.user.email || "Google account"}`
        : "Not signed in yet.";
    }
    if (els.status) {
      if (message) els.status.textContent = message;
      else if (!signedIn) els.status.textContent = "Sign in with Google to sync progress across devices.";
      else if (state.lastSyncAt) els.status.textContent = `Cloud sync active. Last saved ${state.lastSyncAt}.`;
      else els.status.textContent = "Signed in. Progress saves automatically while you practise.";
    }
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
      modules.auth.onAuthStateChanged(state.auth, async (user) => {
        state.user = user;
        updateUi();
        emitState();
        if (user) await hydrateFromCloud();
      });
    } catch (err) {
      state.error = err.message || "Firebase could not start.";
      updateUi(state.error);
      emitState();
    }
  }

  async function hydrateFromCloud() {
    if (!state.ready || !state.user) return;
    if (state.hydratedUid === state.user.uid) {
      queueSync();
      return;
    }

    state.hydratedUid = state.user.uid;
    try {
      const snap = await state.modules.firestore.getDoc(progressDoc());
      if (snap.exists()) {
        applyPayload(snap.data(), { merge: true, reason: "signin" });
        updateUi("Cloud progress loaded.");
      }
      queueSync();
    } catch (err) {
      state.error = err.message || "Cloud restore failed.";
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
    state.hydratedUid = "";
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
    if (source === "manual") {
      if (els.sync) {
        els.sync.disabled = true;
        els.sync.textContent = "Saving...";
      }
      globalSyncButtons.forEach((button) => {
        button.disabled = true;
        button.textContent = "Saving";
      });
    }

    try {
      const data = payload();
      await state.modules.firestore.setDoc(
        progressDoc(),
        {
          ...data,
          syncSource: source,
          serverUpdatedAt: state.modules.firestore.serverTimestamp()
        },
        { merge: true }
      );
      state.lastSyncAt = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

      if (source === "manual") {
        if (els.sync) {
          els.sync.textContent = "Saved";
          setTimeout(() => { els.sync.textContent = originalSyncText; }, 1600);
        }
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
      const snap = await state.modules.firestore.getDoc(progressDoc());
      if (!snap.exists()) {
        updateUi("No cloud progress found yet. Press Sync now first.");
        return false;
      }
      applyPayload(snap.data(), { merge: false, reason: "restore" });
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
    if (state.suppressSync || !state.ready || !state.user) return;
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
    state: () => publicState()
  };

  patchLocalStorageSync();
  exposeState();
  init();
})();
