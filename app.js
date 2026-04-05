(function () {
  "use strict";

  const SORT_KEY = "carded.sort";
  const BACKUP_DISMISS_KEY = "carded.backupDismissedAt";
  const LAST_EXPORT_KEY = "carded.lastExportAt";
  const MIGRATION_DONE_KEY = "carded_v1_migration_done";
  const MIGRATION_SKIPPED_KEY = "carded_v1_migration_skipped";
  const STUDY_SESSION_KEY = "carded_study_session";
  const MAX_NAME_LENGTH = 30;
  const DAY_MS = 24 * 60 * 60 * 1000;

  const state = {
    folders: [],
    sets: [],
    cards: [],
    stats: { id: "stats", currentStreak: 0, lastStudiedDate: "", longestStreak: 0 },
    route: { view: "home" },
    search: "",
    sort: window.CardedUtils.safeGet(SORT_KEY) || "alphabetical",
    userId: null,
    userEmail: "",
    online: true,
    isLoading: true,
    longLoad: false,
    drag: {
      setId: null,
      cardId: null,
    },
    keyboardMove: null,
    modal: null,
    toastTimer: null,
    quizSession: null,
    studySession: null,
  };

  const els = {
    app: null,
    appShell: null,
    storageError: null,
    toastRoot: null,
    modalRoot: null,
    headerActions: null,
  };
  let writeQueue = Promise.resolve();
  let modalTriggerEl = null;
  let modalCloseTimer = null;
  let dirtyEditor = false;

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    els.app = document.getElementById("app");
    els.appShell = document.getElementById("app-shell");
    els.storageError = document.getElementById("storage-error");
    els.toastRoot = document.getElementById("toast-root");
    els.modalRoot = document.getElementById("modal-root");
    els.headerActions = document.getElementById("header-actions");

    let session = null;

    if (window.CardedAuthGuard && typeof window.CardedAuthGuard.guardPage === "function") {
      session = await window.CardedAuthGuard.guardPage({ requiresAuth: true }).catch((error) => {
        console.error(error);
        return null;
      });
      if (!session) return;
    }

    if (!("indexedDB" in window) || !window.CardedDB || !window.CardedSync) {
      showStorageError();
      return;
    }

    state.userId = session.user.id;
    state.userEmail = session.user.email || "";
    state.localMode = Boolean(session.local) || (window.CardedAuthGuard && window.CardedAuthGuard.isLocalMode());
    if (
      !state.localMode &&
      window.location.pathname === window.BASE_PATH + "/library" &&
      (window.location.search.includes("code=") || window.location.hash.includes("access_token="))
    ) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    document.getElementById("auth-loading")?.classList.add("hidden");
    els.appShell.classList.remove("hidden");
    renderLoadingState();

    const slowLoadTimer = window.setTimeout(function () {
      state.longLoad = true;
      renderLoadingState();
    }, 5000);

    // Safari private browsing detection — Dexie fails to write
    try {
      await window.CardedDB.put("_healthcheck", { id: "__health__" }).catch(() => {});
    } catch (_) {
      showStorageError();
      return;
    }

    try {
      let bundle;
      if (state.localMode) {
        // Local mode: skip Supabase sync entirely
        state.online = false;
        bundle = await window.CardedDB.getAllUserData(state.userId);
      } else {
        bundle = await window.CardedSync.initSync(state.userId, state.userEmail);
        state.online = window.CardedSync.isOnline();
      }
      await loadAll(bundle);
      await cleanOrphanedLocalData();
    } catch (error) {
      if (error && error.name === "OpenFailedError") {
        showStorageError();
        return;
      }
      console.error(error);
      showStorageError();
      return;
    } finally {
      window.clearTimeout(slowLoadTimer);
      state.isLoading = false;
      state.longLoad = false;
    }

    bindGlobalEvents();
    registerServiceWorker();
    window.addEventListener("carded:data-changed", reloadFromCacheAndRender);
    window.addEventListener("carded:connectivity", handleConnectivityChange);
    window.addEventListener("carded:auth-state", handleAuthEvent);

    // Multi-tab consistency: broadcast local changes to other tabs
    if (typeof BroadcastChannel !== "undefined") {
      const bc = new BroadcastChannel("carded-data");
      bc.onmessage = function () { reloadFromCacheAndRender(); };
      window.addEventListener("carded:data-changed", function () {
        bc.postMessage("changed");
      });
    } else {
      // Fallback: re-fetch when tab regains focus
      window.addEventListener("focus", reloadFromCacheAndRender);
    }
    window.addEventListener("carded:sync-paused", function () {
      showToast("Sync paused — will retry automatically.");
    });
    window.addEventListener("carded:sync-overflow", function () {
      showToast("Too many offline changes. Please connect to sync before making more edits.");
    });
    window.addEventListener("carded:session-expired", function () {
      window.CardedUtils.redirectTo(window.BASE_PATH + "/login", null, true);
    });
    handleRouteChange();
    maybePromptLegacyMigration();
    document.body.classList.add("ready");
  }

  function showStorageError() {
    els.storageError.classList.remove("hidden");
  }

  function enqueueWrite(work) {
    const run = () => Promise.resolve().then(work);
    const next = writeQueue.then(run, run);
    writeQueue = next.catch(() => {});
    return next;
  }

  async function loadAll(bundle) {
    const cached = bundle || await window.CardedDB.getAllUserData(state.userId);
    const progressByCardId = new Map((cached.progress || []).map(function (row) {
      return [row.card_id, row];
    }));

    state.folders = (cached.folders || []).map(mapFolderRowToState);
    state.sets = (cached.sets || []).map(mapSetRowToState);
    state.cards = (cached.cards || []).map(function (row) {
      return mapCardRowToState(row, progressByCardId.get(row.id));
    });
    state.stats = mapStatsRowToState(cached.stats);
  }

  async function cleanOrphanedLocalData() {
    const folderIds = new Set(state.folders.map((f) => f.id));
    const setIds = new Set(state.sets.map((s) => s.id));
    const cardIds = new Set(state.cards.map((c) => c.id));

    // Sets whose folder no longer exists
    const orphanedSets = state.sets.filter((s) => s.folderId && !folderIds.has(s.folderId));
    for (const set of orphanedSets) {
      await window.CardedDB.deleteById("sets", set.id);
    }

    // Cards whose set no longer exists
    const orphanedCards = state.cards.filter((c) => !setIds.has(c.setId));
    for (const card of orphanedCards) {
      await window.CardedDB.deleteById("cards", card.id);
    }

    // Progress entries whose card no longer exists
    const allProgress = await window.CardedDB.getAll("user_card_progress").catch(() => []);
    for (const row of allProgress) {
      if (!cardIds.has(row.card_id)) {
        await window.CardedDB.deleteById("user_card_progress", row.id);
      }
    }

    const cleaned = orphanedSets.length + orphanedCards.length;
    if (cleaned > 0) {
      window.CardedUtils.debugLog(`Cleaned ${cleaned} orphaned local records`);
    }
  }

  async function reloadFromCacheAndRender() {
    await loadAll();
    render();
  }

  function handleConnectivityChange(event) {
    state.online = Boolean(event.detail && event.detail.online);
    render();
  }

  function handleAuthEvent(event) {
    if (event.detail.event === "USER_UPDATED" && event.detail.session && event.detail.session.user) {
      state.userEmail = event.detail.session.user.email || state.userEmail;
      render();
    }
  }

  function renderLoadingState() {
    els.app.innerHTML = `
      <section class="stack">
        <div class="skeleton skeleton-title"></div>
        <div class="skeleton skeleton-copy"></div>
        <div class="tile-grid">
          <div class="skeleton skeleton-tile"></div>
          <div class="skeleton skeleton-tile"></div>
          <div class="skeleton skeleton-tile"></div>
        </div>
        ${state.longLoad ? `<p class="section-copy">Taking longer than usual...</p>` : ""}
      </section>
    `;
  }

  function mapFolderRowToState(row) {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      order: row.order || 0,
      createdAt: toMillis(row.created_at) || Date.now(),
      updatedAt: row.updated_at || null,
    };
  }

  function mapSetRowToState(row) {
    return {
      id: row.id,
      userId: row.user_id,
      folderId: row.folder_id || null,
      name: row.name,
      order: row.order || 0,
      createdAt: toMillis(row.created_at) || Date.now(),
      updatedAt: row.updated_at || null,
      lastStudied: toMillis(row.last_studied),
      bestScore: row.best_score ?? null,
      timesStudied: row.times_studied || 0,
    };
  }

  function mapCardRowToState(row, progress) {
    return {
      id: row.id,
      userId: row.user_id,
      setId: row.set_id,
      term: row.term,
      definition: row.definition,
      order: row.order || 0,
      createdAt: toMillis(row.created_at) || Date.now(),
      updatedAt: row.updated_at || null,
      progressId: progress ? progress.id : null,
      correctCount: progress ? (progress.correct_count || 0) : 0,
      incorrectCount: progress ? (progress.incorrect_count || 0) : 0,
      lastSeen: progress ? toMillis(progress.last_seen) : null,
      box: Math.max(1, Math.min(3, (progress && progress.repetitions ? progress.repetitions : 0) + 1)),
      points: progress ? Math.max(0, Math.min(10, progress.points || 0)) : 0,
    };
  }

  function mapStatsRowToState(row) {
    if (!row) {
      return {
        id: "stats",
        currentStreak: 0,
        lastStudiedDate: "",
        longestStreak: 0,
        totalStudyTime: 0,
        totalCardsReviewed: 0,
        totalSessions: 0,
      };
    }

    return {
      id: row.id,
      userId: row.user_id,
      totalStudyTime: row.total_study_time || 0,
      totalCardsReviewed: row.total_cards_reviewed || 0,
      totalSessions: row.total_sessions || 0,
      currentStreak: row.current_streak || 0,
      longestStreak: row.longest_streak || 0,
      lastStudiedDate: row.last_studied_date || "",
      updatedAt: row.updated_at || null,
    };
  }

  function toMillis(value) {
    return value ? Date.parse(value) : null;
  }

  function toIso(value) {
    return value ? new Date(value).toISOString() : null;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function getMigrationKey(prefix) {
    return `${prefix}:${state.userId || "guest"}`;
  }

  function folderToRow(folder) {
    return {
      id: folder.id,
      user_id: state.userId,
      name: folder.name,
      order: folder.order,
      created_at: toIso(folder.createdAt) || nowIso(),
      updated_at: nowIso(),
    };
  }

  function setToRow(set) {
    return {
      id: set.id,
      user_id: state.userId,
      folder_id: set.folderId,
      name: set.name,
      order: set.order,
      created_at: toIso(set.createdAt) || nowIso(),
      updated_at: nowIso(),
      last_studied: toIso(set.lastStudied),
      best_score: set.bestScore,
      times_studied: set.timesStudied || 0,
    };
  }

  function cardToRow(card) {
    return {
      id: card.id,
      user_id: state.userId,
      set_id: card.setId,
      term: card.term,
      definition: card.definition,
      order: card.order,
      created_at: toIso(card.createdAt) || nowIso(),
      updated_at: nowIso(),
    };
  }

  function progressToRow(card) {
    return {
      id: card.progressId || crypto.randomUUID(),
      user_id: state.userId,
      card_id: card.id,
      ease_factor: 2.5,
      interval: 0,
      repetitions: Math.max(0, (card.box || 1) - 1),
      next_review: null,
      correct_count: card.correctCount || 0,
      incorrect_count: card.incorrectCount || 0,
      last_seen: toIso(card.lastSeen),
      updated_at: nowIso(),
      points: Math.max(0, Math.min(10, card.points || 0)),
    };
  }

  function statsToRow() {
    return {
      id: state.stats.id,
      user_id: state.userId,
      total_study_time: state.stats.totalStudyTime || 0,
      total_cards_reviewed: state.stats.totalCardsReviewed || 0,
      total_sessions: state.stats.totalSessions || 0,
      current_streak: state.stats.currentStreak || 0,
      longest_streak: state.stats.longestStreak || 0,
      last_studied_date: state.stats.lastStudiedDate || null,
      updated_at: nowIso(),
    };
  }

  async function persistEntity(table, operation, row) {
    return enqueueWrite(async function () {
      try {
        if (operation === "delete") {
          await window.CardedDB.deleteById(table, row.id);
        } else {
          await window.CardedDB.put(table, row);
        }
      } catch (dbError) {
        if (dbError && (dbError.name === "QuotaExceededError" || (dbError.inner && dbError.inner.name === "QuotaExceededError"))) {
          showToast("Storage is full — try deleting unused sets or clearing browser data.");
          return;
        }
        throw dbError;
      }

      // Skip remote sync in local mode
      if (state.localMode) return { queued: false };

      const result = await window.CardedSync.syncMutation(table, operation, row);
      state.online = window.CardedSync.isOnline();
      if (result && result.queued) {
        showToast("Couldn't save — you're offline. Changes will sync when you're back online.");
      }
      return result;
    });
  }

  async function persistProgress(card) {
    return persistEntity("user_card_progress", "upsert", progressToRow(card));
  }

  async function persistStats() {
    return persistEntity("user_stats", "upsert", statsToRow());
  }

  function idbRequest(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error);
      };
    });
  }

  async function readLegacyDatabase() {
    return new Promise(function (resolve, reject) {
      const request = indexedDB.open("FlashCardsDB");

      request.onerror = function () {
        reject(request.error);
      };

      request.onsuccess = async function () {
        const legacyDb = request.result;
        const storeNames = Array.from(legacyDb.objectStoreNames);

        if (!storeNames.includes("folders") || !storeNames.includes("sets") || !storeNames.includes("cards")) {
          legacyDb.close();
          resolve({ folders: [], sets: [], cards: [] });
          return;
        }

        try {
          const tx = legacyDb.transaction(["folders", "sets", "cards"], "readonly");
          const folders = await idbRequest(tx.objectStore("folders").getAll());
          const sets = await idbRequest(tx.objectStore("sets").getAll());
          const cards = await idbRequest(tx.objectStore("cards").getAll());
          legacyDb.close();
          resolve({ folders, sets, cards });
        } catch (error) {
          legacyDb.close();
          reject(error);
        }
      };
    });
  }

  async function clearLegacyDatabase() {
    return new Promise(function (resolve, reject) {
      const request = indexedDB.open("FlashCardsDB");

      request.onerror = function () {
        reject(request.error);
      };

      request.onsuccess = async function () {
        const legacyDb = request.result;
        const stores = ["folders", "sets", "cards", "stats"].filter(function (name) {
          return legacyDb.objectStoreNames.contains(name);
        });
        const tx = legacyDb.transaction(stores, "readwrite");
        const clearOps = stores
          .map(function (name) {
            return idbRequest(tx.objectStore(name).clear());
          });

        try {
          await Promise.all(clearOps);
          legacyDb.close();
          resolve();
        } catch (error) {
          legacyDb.close();
          reject(error);
        }
      };
    });
  }

  async function maybePromptLegacyMigration() {
    if (window.CardedUtils.safeGet(getMigrationKey(MIGRATION_DONE_KEY)) || window.CardedUtils.safeGet(getMigrationKey(MIGRATION_SKIPPED_KEY))) {
      return;
    }

    const legacy = await readLegacyDatabase().catch(function () {
      return null;
    });

    if (!legacy) return;

    const totalItems = legacy.folders.length + legacy.sets.length + legacy.cards.length;
    if (!totalItems) {
      window.CardedUtils.safeSet(getMigrationKey(MIGRATION_DONE_KEY), "empty");
      return;
    }

    state.modal = {
      title: "Import your local v1 library?",
      copy: `We found ${legacy.folders.length} folders, ${legacy.sets.length} sets, and ${legacy.cards.length} cards saved locally. Upload them to your new account?`,
      confirmLabel: "Upload data",
      onCancel: function () {
        window.CardedUtils.safeSet(getMigrationKey(MIGRATION_SKIPPED_KEY), nowIso());
      },
      onConfirm: async function () {
        state.modal = null;
        renderModal();
        await runLegacyMigration(legacy);
      },
    };
    renderModal();
  }

  async function runLegacyMigration(legacy) {
    const folderIdMap = new Map();
    const setIdMap = new Map();

    const folders = legacy.folders.map(function (folder, index) {
      const id = crypto.randomUUID();
      folderIdMap.set(folder.id, id);
      return {
        id,
        user_id: state.userId,
        name: folder.name,
        order: folder.order ?? index,
        created_at: toIso(folder.createdAt) || nowIso(),
      };
    });

    const sets = legacy.sets.map(function (set, index) {
      const id = crypto.randomUUID();
      setIdMap.set(set.id, id);
      return {
        id,
        user_id: state.userId,
        folder_id: set.folderId ? (folderIdMap.get(set.folderId) || null) : null,
        name: set.name,
        order: set.order ?? index,
        created_at: toIso(set.createdAt) || nowIso(),
      };
    });

    const cards = legacy.cards.map(function (card, index) {
      return {
        id: crypto.randomUUID(),
        user_id: state.userId,
        set_id: setIdMap.get(card.setId),
        term: card.term,
        definition: card.definition,
        order: card.order ?? index,
        created_at: nowIso(),
      };
    }).filter(function (card) {
      return Boolean(card.set_id);
    });

    try {
      if (folders.length) {
        const { error } = await window.supabaseClient.from("folders").insert(folders);
        if (error) throw error;
      }
      if (sets.length) {
        const { error } = await window.supabaseClient.from("sets").insert(sets);
        if (error) throw error;
      }
      if (cards.length) {
        const { error } = await window.supabaseClient.from("cards").insert(cards);
        if (error) throw error;
      }

      await clearLegacyDatabase();
      window.CardedUtils.safeSet(getMigrationKey(MIGRATION_DONE_KEY), nowIso());
      await window.CardedSync.refetchLatest();
      await loadAll();
      render();
      showToast("Local v1 data uploaded.");
    } catch (error) {
      console.error(error);
      showToast("Some data couldn't be uploaded. Your local data is still safe.");
    }
  }

  function setDirty(isDirty) {
    dirtyEditor = isDirty;
    if (isDirty) {
      window.addEventListener("beforeunload", handleBeforeUnload);
    } else {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    }
  }

  function handleBeforeUnload(event) {
    event.preventDefault();
  }

  function bindGlobalEvents() {
    document.addEventListener("click", onDocumentClick);
    document.addEventListener("submit", onDocumentSubmit);
    document.addEventListener("keydown", onDocumentKeydown);
    document.addEventListener("input", onDocumentInput);
    document.addEventListener("blur", onEditableBlur, true);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);
    document.addEventListener("change", onDocumentChange);
  }

  function handleRouteChange() {
    const path = window.CardedUtils.currentPath();
    const params = new URLSearchParams(window.location.search);
    const folderId = params.get("folder");
    const setId = params.get("set");
    const mode = params.get("mode");

    const dir = params.get("dir") || "term-definition";
    const reviewOnly = params.get("review") === "1";

    if (path === window.BASE_PATH + "/study" && setId) {
      if (mode === "quiz") {
        state.route = { view: "quiz", setId: setId, quizDir: dir, reviewOnly: reviewOnly };
        initQuizSession(setId, { direction: dir, reviewOnly: reviewOnly });
      } else {
        // flip mode (default, also handles legacy "study" mode)
        state.route = { view: "flip", setId: setId, reviewOnly: reviewOnly };
        const savedSession = loadSavedStudySession(setId);
        if (savedSession && savedSession.currentIndex > 0 && savedSession.mode === "flip" && savedSession.reviewOnly === reviewOnly) {
          initStudySession(setId, savedSession.shuffle, savedSession);
          state.studySession.resumed = true;
        } else {
          initStudySession(setId, false, null, reviewOnly);
        }
      }
    } else if (path === window.BASE_PATH + "/library" && setId) {
      state.route = { view: "set", setId: setId };
    } else if (path === window.BASE_PATH + "/library" && folderId) {
      state.route = { view: "folder", folderId: folderId };
    } else {
      state.route = { view: "home" };
    }

    render();
  }

  function buildLibraryHref(options) {
    const params = {};
    if (options && options.folderId) params.folder = options.folderId;
    if (options && options.setId) params.set = options.setId;
    return window.CardedUtils.buildAppUrl(window.BASE_PATH + "/library", params);
  }

  function buildStudyHref(setId, options) {
    const params = { set: setId };
    if (options && options.mode === "quiz") {
      params.mode = "quiz";
      if (options.dir) params.dir = options.dir;
    } else {
      params.mode = "flip";
    }
    if (options && options.reviewOnly) params.review = "1";
    return window.CardedUtils.buildAppUrl(window.BASE_PATH + "/study", params);
  }

  function navigateToLibrary(options, replace) {
    setDirty(false);
    const href = buildLibraryHref(options);
    if (replace) {
      window.location.replace(href);
      return;
    }
    window.location.assign(href);
  }

  function navigateToStudy(setId, options) {
    window.location.assign(buildStudyHref(setId, options));
  }

  function render() {
    if (state.isLoading) {
      renderLoadingState();
      return;
    }

    renderHeaderActions();
    els.app.innerHTML = "";

    // Offline indicator — top banner outside main content
    const existingOfflineBanner = document.getElementById("offline-status-banner");
    if (!state.online) {
      if (!existingOfflineBanner) {
        const banner = document.createElement("div");
        banner.id = "offline-status-banner";
        banner.className = "offline-status-banner";
        banner.setAttribute("role", "status");
        banner.textContent = "You're offline — changes will sync when you reconnect";
        els.appShell.insertBefore(banner, els.appShell.querySelector("main"));
      }
    } else if (existingOfflineBanner) {
      existingOfflineBanner.remove();
    }

    switch (state.route.view) {
      case "folder":
        renderFolderView(state.route.folderId);
        break;
      case "set":
        renderSetView(state.route.setId);
        break;
      case "flip":
        renderFlipView(state.route.setId);
        break;
      case "quiz":
        renderQuizView(state.route.setId);
        break;
      default:
        renderHomeView();
    }

    renderModal();
  }

  function renderHeaderActions() {
    const themeEff = window.CardedTheme ? window.CardedTheme.effectiveTheme(window.CardedTheme.getStoredTheme()) : "dark";
    const avatarInitial = state.localMode
      ? "L"
      : escapeHtml((window.CardedUtils.safeGet("carded_display_name") || state.userEmail || "U").slice(0, 1).toUpperCase());
    els.headerActions.innerHTML = `
      <button class="ghost-button" data-action="create-folder">New folder</button>
      <button class="button" data-action="create-set">New set</button>
      <button class="icon-button" data-theme-toggle aria-label="${themeEff === "dark" ? "Switch to light theme" : "Switch to dark theme"}">
        <span class="theme-icon-moon" aria-hidden="true" ${themeEff !== "dark" ? 'style="display:none"' : ""}>🌙</span>
        <span class="theme-icon-sun" aria-hidden="true" ${themeEff === "dark" ? 'style="display:none"' : ""}>☀️</span>
      </button>
      <a class="account-link" href="${window.BASE_PATH}/account" aria-label="${state.localMode ? "Settings (local mode)" : "Open account"}">
        <span class="account-link__avatar${state.localMode ? " local-mode-avatar" : ""}" aria-hidden="true">${avatarInitial}</span>
      </a>
    `;
    // Wire theme toggle
    const toggleBtn = els.headerActions.querySelector("[data-theme-toggle]");
    if (toggleBtn && window.CardedTheme) {
      toggleBtn.addEventListener("click", function () {
        window.CardedTheme.cycleTheme();
        renderHeaderActions();
      });
    }
  }

  function renderHomeView() {
    const folders = getSortedFolders(getFilteredFolders());
    const standaloneSets = getSortedSets(getFilteredStandaloneSets());
    const totalCards = state.cards.length;
    const backupBanner = shouldShowBackupBanner(totalCards);

    const wrapper = document.createElement("div");
    wrapper.className = "stack";

    if (backupBanner) {
      wrapper.appendChild(createElement(`
        <section class="banner" aria-label="Backup reminder">
          <p>You have ${totalCards} cards — consider exporting a backup.</p>
          <div class="control-row">
            <button class="ghost-button" data-action="export-all">Export all</button>
            <button class="icon-button" aria-label="Dismiss backup reminder" data-action="dismiss-backup-banner">Dismiss</button>
          </div>
        </section>
      `));
    }

    wrapper.appendChild(createElement(`
      <section>
        <div class="section-header">
          <div class="stack">
            <h1 class="section-title">Your library</h1>
            <p class="section-copy">Folders for courses, standalone sets for everything else.</p>
          </div>
        </div>
        ${renderLibraryControls()}
        ${renderStandaloneDropzone()}
        ${folders.length || standaloneSets.length ? `
          <div class="tile-grid">
            ${folders.map(renderFolderTile).join("")}
            ${standaloneSets.map((item) => renderSetTile(item, null)).join("")}
          </div>
        ` : renderEmptyState("No sets yet — create your first one", [
          { action: "create-set", label: "Create set", primary: true },
          { action: "create-folder", label: "Create folder" }
        ])}
      </section>
    `));

    els.app.appendChild(wrapper);
  }

  function renderFolderView(folderId) {
    const folder = getFolder(folderId);
    if (!folder) {
      navigateToLibrary(null, true);
      return;
    }

    const sets = getSortedSets(getFilteredSetsByFolder(folderId));
    els.app.appendChild(createElement(`
      <section class="stack">
        ${renderBreadcrumbs([
          { href: buildLibraryHref(), label: "Home" },
          { label: escapeHtml(folder.name) }
        ])}
        <div class="view-header">
          <div class="stack">
            <h1 class="view-title">
              <span
                class="inline-editable"
                contenteditable="false"
                spellcheck="false"
                data-edit-kind="folder"
                data-id="${folder.id}"
                title="${escapeAttribute(folder.name)}"
              >${escapeHtml(folder.name)}</span>
            </h1>
            <p class="view-copy">${sets.length} set${sets.length === 1 ? "" : "s"} inside this folder.</p>
          </div>
          <div class="control-row">
            <button class="ghost-button" data-action="create-set-in-folder" data-folder-id="${folder.id}">New set</button>
            <button class="danger-button" data-action="delete-folder" data-folder-id="${folder.id}">Delete folder</button>
          </div>
        </div>
        ${renderLibraryControls()}
        ${sets.length ? `
          <div class="tile-grid">
            ${sets.map((item) => renderSetTile(item, folder)).join("")}
          </div>
        ` : renderEmptyState("No sets in this folder yet", [
          { action: "create-set-in-folder", label: "Create set", primary: true, dataset: `data-folder-id="${folder.id}"` }
        ])}
      </section>
    `));
  }

  function renderSetView(setId) {
    const set = getSet(setId);
    if (!set) {
      navigateToLibrary(null, true);
      return;
    }

    const folder = set.folderId ? getFolder(set.folderId) : null;
    const cards = getCardsForSet(set.id);
    const stats = getSetStats(set.id);

    els.app.appendChild(createElement(`
      <section class="set-layout">
        ${renderBreadcrumbs([
          { href: buildLibraryHref(), label: "Home" },
          ...(folder ? [{ href: buildLibraryHref({ folderId: folder.id }), label: escapeHtml(folder.name) }] : []),
          { label: escapeHtml(set.name) }
        ])}
        <div class="view-header">
          <div class="stack">
            <h1 class="view-title">
              <span
                class="inline-editable"
                contenteditable="false"
                spellcheck="false"
                data-edit-kind="set"
                data-id="${set.id}"
                title="${escapeAttribute(set.name)}"
              >${escapeHtml(set.name)}</span>
            </h1>
            <div class="meta-inline">
              <span>${cards.length} cards</span>
              <span>Studied ${formatRelativeTime(set.lastStudied)}</span>
              <span>Best score ${set.bestScore == null ? "—" : `${set.bestScore}%`}</span>
            </div>
          </div>
          <div class="set-toolbar">
            <button class="ghost-button" data-action="export-set" data-set-id="${set.id}">Export .txt</button>
            <button class="button" data-action="show-study-modal" data-set-id="${set.id}" ${cards.length ? "" : "disabled"}>Study</button>
            <button class="danger-button" data-action="delete-set" data-set-id="${set.id}">Delete set</button>
          </div>
        </div>

        <section class="panel">
          <h2>Add a card</h2>
          <form class="stack" data-form="add-card" data-set-id="${set.id}">
            <div class="form-row">
              <div class="field" style="flex:1">
                <label for="term-input">Term</label>
                <input id="term-input" name="term" class="input" required>
              </div>
              <div class="field" style="flex:1">
                <label for="definition-input">Definition</label>
                <input id="definition-input" name="definition" class="input" required>
              </div>
            </div>
            <div>
              <button class="button" type="submit">Add card</button>
            </div>
          </form>
        </section>

        <section class="import-panel stack">
          <div>
            <h2>Import cards</h2>
            <p class="section-copy">Paste cards (one per line) or upload a .txt file. Supported formats: <code>Term | Definition</code>, <code>Term, Definition</code>, or tab-separated.</p>
          </div>
          <form class="stack" data-form="bulk-import" data-set-id="${set.id}">
            <div class="field">
              <label for="bulk-import-input">Paste cards</label>
              <textarea id="bulk-import-input" class="textarea" name="bulkText" placeholder="Term | Definition"></textarea>
            </div>
            <div class="import-panel__actions">
              <button class="ghost-button" type="button" data-action="trigger-file-upload" data-set-id="${set.id}">Choose .txt file</button>
              <input class="visually-hidden" type="file" accept=".txt,.zip,text/plain,application/zip" data-upload-input="${set.id}">
              <button class="button" type="submit">Import</button>
            </div>
          </form>
        </section>

        <section class="summary-grid">
          <div class="stat-card">
            <div class="meta-label">Times studied</div>
            <div class="stat-value">${set.timesStudied}</div>
          </div>
          <div class="stat-card">
            <div class="meta-label">Best score</div>
            <div class="stat-value">${set.bestScore == null ? "—" : `${set.bestScore}%`}</div>
          </div>
          <div class="stat-card">
            <div class="meta-label">Correct answers</div>
            <div class="stat-value">${stats.correct}</div>
          </div>
          <div class="stat-card">
            <div class="meta-label">Incorrect answers</div>
            <div class="stat-value">${stats.incorrect}</div>
          </div>
        </section>

        <section class="stack">
          <div class="section-header">
            <div class="stack">
              <h2 class="section-title">Cards</h2>
              <p class="section-copy">Drag to reorder. Click any term or definition to edit in place.</p>
            </div>
          </div>
          ${cards.length ? `
            <div class="list" data-card-list="${set.id}">
              ${cards.map((card, index) => renderCardRow(card, index)).join("")}
            </div>
          ` : renderEmptyState("No cards yet — add one or import a .txt file", [
            { action: "focus-add-card", label: "Add card", primary: true },
            { action: "focus-import", label: "Import .txt" }
          ])}
        </section>
      </section>
    `));
  }

  function renderFlipView(setId) {
    const set = getSet(setId);
    if (!set) {
      els.app.appendChild(createElement(`
        <section class="empty-state">
          <p>Set not found.</p>
          <div class="empty-state__actions">
            <a class="button" href="${window.BASE_PATH}/library">Back to library</a>
          </div>
        </section>
      `));
      return;
    }

    const session = state.studySession;
    if (!session) {
      els.app.appendChild(createElement(`
        <section class="empty-state">
          <p>${state.route.reviewOnly ? "No cards need review — you've got them all!" : "No cards to study yet!"}</p>
          <div class="empty-state__actions">
            ${state.route.reviewOnly
              ? `<button class="button" data-action="show-study-modal" data-set-id="${setId}">Try a full session</button>`
              : `<a class="button" href="${window.CardedUtils.buildAppUrl(window.BASE_PATH + "/library", { set: setId })}">Add cards to this set</a>`
            }
          </div>
        </section>
      `));
      return;
    }

    if (session.resumed) {
      delete session.resumed;
    }

    if (session.complete) {
      els.app.appendChild(createElement(renderSessionComplete(set, session, "flip")));
      return;
    }

    const card = session.deck[session.index];
    const termFirst = session.direction === "term-definition";
    const front = termFirst ? card.term : card.definition;
    const back = termFirst ? card.definition : card.term;

    els.app.appendChild(createElement(`
      <section class="session-shell">
        ${renderBreadcrumbs([
          { href: buildLibraryHref(), label: "Home" },
          { href: buildLibraryHref({ setId: set.id }), label: escapeHtml(set.name) },
          { label: state.route.reviewOnly ? "Review" : "Flip" }
        ])}
        <div class="session-toolbar">
          <div class="control-row">
            <button class="pill-button ${session.shuffle ? "active" : ""}" data-action="toggle-study-shuffle">Shuffle</button>
            <button class="pill-button" data-action="toggle-study-direction">
              ${session.direction === "term-definition" ? "Term → Def" : "Def → Term"}
            </button>
          </div>
          <div class="meta-inline">
            <span>${session.index + 1} / ${session.deck.length}</span>
          </div>
        </div>
        <div class="progress" aria-hidden="true">
          <div class="progress__bar" style="width:${((session.index) / session.deck.length) * 100}%"></div>
        </div>
        <div class="session-card" role="region" aria-live="polite">
          <button class="flip-card ${session.isFlipped ? "is-flipped" : ""}" data-action="flip-study-card" aria-label="Flip card">
            <span class="flip-face front">
              <span class="flip-label">${termFirst ? "Term" : "Definition"}</span>
              <span class="flip-content ${termFirst ? "term" : ""}">${escapeHtml(front)}</span>
            </span>
            <span class="flip-face back">
              <span class="flip-label">${termFirst ? "Definition" : "Term"}</span>
              <span class="flip-content ${termFirst ? "" : "term"}">${escapeHtml(back)}</span>
            </span>
          </button>
        </div>
        ${session.isFlipped ? `
          <div class="flip-verdict-row">
            <button class="verdict-btn verdict-missed" data-action="flip-missed">
              <span aria-hidden="true">✗</span> Missed it
            </button>
            <button class="verdict-btn verdict-got" data-action="flip-got-it">
              <span aria-hidden="true">✓</span> Got it
            </button>
          </div>
        ` : `
          <div class="flip-hint">Tap the card to reveal the answer</div>
        `}
      </section>
    `));
  }

  function renderQuizView(setId) {
    const set = getSet(setId);
    if (!set) {
      els.app.appendChild(createElement(`
        <section class="empty-state">
          <p>Set not found.</p>
          <div class="empty-state__actions">
            <a class="button" href="${window.BASE_PATH}/library">Back to library</a>
          </div>
        </section>
      `));
      return;
    }

    const session = state.quizSession;
    if (!session) {
      els.app.appendChild(createElement(`
        <section class="empty-state">
          <p>${state.route.reviewOnly ? "No cards need review — you've got them all!" : "Not enough cards for quiz mode (need at least 4)."}</p>
          <div class="empty-state__actions">
            <button class="button" data-action="show-study-modal" data-set-id="${setId}">Choose another mode</button>
          </div>
        </section>
      `));
      return;
    }

    if (session.complete) {
      els.app.appendChild(createElement(renderSessionComplete(set, session, "quiz")));
      return;
    }

    const q = session.currentQuestion;
    els.app.appendChild(createElement(`
      <section class="session-shell">
        ${renderBreadcrumbs([
          { href: buildLibraryHref(), label: "Home" },
          { href: buildLibraryHref({ setId: set.id }), label: escapeHtml(set.name) },
          { label: state.route.reviewOnly ? "Review Quiz" : "Quiz" }
        ])}
        <div class="session-toolbar">
          <div class="meta-inline">
            <span>${session.index + 1} / ${session.deck.length}</span>
            <span>${q.direction === "term-definition" ? "Term → Def" : "Def → Term"}</span>
          </div>
          <button class="ghost-button" data-action="back-to-set" data-set-id="${set.id}">Exit</button>
        </div>
        <div class="progress" aria-hidden="true">
          <div class="progress__bar" style="width:${(session.index / session.deck.length) * 100}%"></div>
        </div>
        <div class="session-card ${session.feedbackClass || ""}" role="region" aria-live="polite">
          <div class="flip-face">
            <span class="flip-label">${q.direction === "term-definition" ? "Term" : "Definition"}</span>
            <p class="flip-content ${q.direction === "term-definition" ? "term" : ""}">${escapeHtml(q.prompt)}</p>
          </div>
        </div>
        <div class="quiz-grid">
          ${q.choices.map((choice, i) => `
            <button
              class="quiz-choice ${getQuizChoiceClass(session, choice)}"
              data-action="answer-quiz"
              data-card-id="${q.card.id}"
              data-choice-id="${choice.id}"
              ${session.pendingNext ? "disabled" : ""}
            >
              <span class="quiz-choice__num">${i + 1}</span>
              <span class="quiz-choice__label">${escapeHtml(choice.label)}</span>
            </button>
          `).join("")}
        </div>
      </section>
    `));
  }

  function renderSessionComplete(set, session, mode) {
    const correct = session.results ? session.results.filter((r) => r.correct).length : 0;
    const total = session.results ? session.results.length : session.deck ? session.deck.length : 0;
    const missed = total - correct;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    const mastered = session.results
      ? session.results.filter((r) => r.correct && r.pointsAfter === 0).length
      : 0;
    const needsReview = session.results
      ? session.results.filter((r) => r.pointsAfter > 0).length
      : 0;
    const hasMissed = missed > 0;
    const reviewParam = hasMissed ? "" : "";

    return `
      <section class="session-shell">
        ${renderBreadcrumbs([
          { href: buildLibraryHref(), label: "Home" },
          { href: buildLibraryHref({ setId: set.id }), label: escapeHtml(set.name) },
          { label: "Session complete" }
        ])}
        <div class="summary-card">
          <div class="summary-card__header">
            <div class="stack">
              <h2>Session complete!</h2>
              <p>${set.name}</p>
            </div>
            <div class="badge">${pct}%</div>
          </div>
          <div class="summary-grid" style="margin:20px 0">
            <div class="stat-card">
              <div class="meta-label">Cards studied</div>
              <div class="stat-value">${total}</div>
            </div>
            <div class="stat-card">
              <div class="meta-label">Correct</div>
              <div class="stat-value correct-value">${correct}</div>
            </div>
            <div class="stat-card">
              <div class="meta-label">Missed</div>
              <div class="stat-value missed-value">${missed}</div>
            </div>
            <div class="stat-card">
              <div class="meta-label">Mastered</div>
              <div class="stat-value">${mastered}</div>
            </div>
          </div>
          <div class="summary-actions">
            <button class="button" data-action="study-again" data-set-id="${set.id}" data-mode="${mode}">Study again</button>
            ${hasMissed ? `<button class="ghost-button" data-action="review-missed" data-set-id="${set.id}" data-mode="${mode}">Review missed cards</button>` : ""}
            <button class="ghost-button" data-action="back-to-set" data-set-id="${set.id}">Back to set</button>
          </div>
        </div>
      </section>
    `;
  }

  function renderLibraryControls() {
    return `
      <div class="control-row">
        <div class="control-group">
          <div class="field">
            <label for="library-search">Search</label>
            <input id="library-search" class="input" data-action="search-library" value="${escapeAttribute(state.search)}" placeholder="Search folders and sets">
          </div>
          <div class="field">
            <label for="sort-library">Sort</label>
            <select id="sort-library" class="select" data-action="sort-library">
              <option value="alphabetical" ${state.sort === "alphabetical" ? "selected" : ""}>Alphabetical</option>
              <option value="lastStudied" ${state.sort === "lastStudied" ? "selected" : ""}>Last studied</option>
              <option value="createdAt" ${state.sort === "createdAt" ? "selected" : ""}>Date created</option>
            </select>
          </div>
        </div>
      </div>
    `;
  }

  function renderStandaloneDropzone() {
    return `<div class="standalone-dropzone" data-drop-standalone>Drop a set here to make it standalone</div>`;
  }

  function renderFolderTile(folder) {
    const sets = state.sets.filter((item) => item.folderId === folder.id);
    const totalCards = sets.reduce((sum, item) => sum + getCardsForSet(item.id).length, 0);
    return `
      <article class="tile folder" data-folder-tile="${folder.id}" data-open-folder="${folder.id}" tabindex="0" role="button" aria-label="Open folder ${escapeAttribute(folder.name)}">
        <div class="tile__header">
          <div class="stack">
            <strong class="tile__name inline-editable" contenteditable="false" data-edit-kind="folder" data-id="${folder.id}" title="${escapeAttribute(folder.name)}">${escapeHtml(truncate(folder.name))}</strong>
            <span class="meta-copy">${sets.length} set${sets.length === 1 ? "" : "s"} · ${totalCards} card${totalCards === 1 ? "" : "s"}</span>
          </div>
        </div>
        <div class="tile__meta">
          <div class="meta-item"><span class="meta-label">Created</span><span>${formatDate(folder.createdAt)}</span></div>
        </div>
        <div class="tile__footer">
          <div class="tile__actions">
            <button class="icon-button" aria-label="Export folder" data-action="export-folder" data-folder-id="${folder.id}">Export</button>
            <button class="icon-button" aria-label="Delete folder" data-action="delete-folder" data-folder-id="${folder.id}">Delete</button>
          </div>
        </div>
      </article>
    `;
  }

  function renderSetTile(set, folder) {
    const cardCount = getCardsForSet(set.id).length;
    return `
      <article
        class="tile set"
        draggable="true"
        tabindex="0"
        role="button"
        data-set-tile="${set.id}"
        data-open-set="${set.id}"
        data-folder-id="${folder ? folder.id : ""}"
        aria-label="Open set ${escapeAttribute(set.name)}"
      >
        <div class="tile__header">
          <div class="stack">
            <strong class="tile__name inline-editable" contenteditable="false" data-edit-kind="set" data-id="${set.id}" title="${escapeAttribute(set.name)}">${escapeHtml(truncate(set.name))}</strong>
            <span class="meta-copy">${cardCount} card${cardCount === 1 ? "" : "s"}${folder ? " · " + escapeHtml(folder.name) : ""}</span>
          </div>
        </div>
        <div class="tile__meta">
          <div class="meta-item"><span class="meta-label">Last studied</span><span>${formatRelativeTime(set.lastStudied)}</span></div>
          <div class="meta-item"><span class="meta-label">Created</span><span>${formatDate(set.createdAt)}</span></div>
        </div>
        <div class="tile__footer">
          <div class="tile__actions">
            <button class="icon-button" aria-label="Delete set" data-action="delete-set" data-set-id="${set.id}">Delete</button>
          </div>
        </div>
      </article>
    `;
  }

  function renderCardRow(card, index) {
    return `
      <article
        class="card-row"
        draggable="true"
        tabindex="0"
        data-card-row="${card.id}"
        data-set-id="${card.setId}"
      >
        <div class="card-row__header">
          <div class="meta-inline">
            <span class="drag-handle" aria-hidden="true">⋮⋮</span>
            <span class="meta-label">Card ${index + 1}</span>
            <span class="meta-label">Box ${card.box}</span>
          </div>
          <div class="card-row__actions">
            <button class="icon-button" aria-label="Delete card" data-action="delete-card" data-card-id="${card.id}">Delete</button>
          </div>
        </div>
        <div class="card-row__body">
          <div class="card-content">
            <span class="meta-label">Term</span>
            <div
              class="card-content__value term inline-editable"
              contenteditable="false"
              spellcheck="false"
              data-edit-kind="card-term"
              data-id="${card.id}"
            >${escapeHtml(card.term)}</div>
          </div>
          <div class="card-content">
            <span class="meta-label">Definition</span>
            <div
              class="card-content__value inline-editable"
              contenteditable="false"
              spellcheck="false"
              data-edit-kind="card-definition"
              data-id="${card.id}"
            >${escapeHtml(card.definition)}</div>
          </div>
        </div>
      </article>
    `;
  }

  function renderBreadcrumbs(items) {
    return `
      <nav class="breadcrumbs" aria-label="Breadcrumb">
        ${items.map((item, index) => `
          ${item.href ? `<a href="${item.href}">${item.label}</a>` : `<span aria-current="page">${item.label}</span>`}
          ${index < items.length - 1 ? `<span aria-hidden="true">›</span>` : ""}
        `).join("")}
      </nav>
    `;
  }

  function renderEmptyState(title, actions) {
    return `
      <section class="empty-state">
        <h2>${title}</h2>
        <p>Everything stays local in your browser, so exporting a backup is always available.</p>
        <div class="empty-state__actions">
          ${actions.map((item) => `
            <button class="${item.primary ? "button" : "ghost-button"}" data-action="${item.action}" ${item.dataset || ""}>${item.label}</button>
          `).join("")}
        </div>
      </section>
    `;
  }

  async function onDocumentClick(event) {
    const target = event.target.closest("[data-action], [data-open-folder], [data-open-set], .inline-editable");
    if (!target) return;

    if (target.matches(".inline-editable")) {
      enableInlineEdit(target);
      return;
    }

    if (target.dataset.openFolder) {
      navigateToLibrary({ folderId: target.dataset.openFolder });
      return;
    }

    if (target.dataset.openSet) {
      navigateToLibrary({ setId: target.dataset.openSet });
      return;
    }

    const action = target.dataset.action;
    switch (action) {
      case "create-folder":
        promptCreateFolder();
        break;
      case "create-set":
        promptCreateSet();
        break;
      case "create-set-in-folder":
        promptCreateSet(target.dataset.folderId);
        break;
      case "delete-folder":
        confirmDeleteFolder(target.dataset.folderId);
        break;
      case "delete-set":
        confirmDeleteSet(target.dataset.setId);
        break;
      case "delete-card":
        confirmDeleteCard(target.dataset.cardId);
        break;
      case "trigger-file-upload":
        {
          const input = document.querySelector(`[data-upload-input="${target.dataset.setId}"]`);
          if (input) input.click();
        }
        break;
      case "show-study-modal":
        showStudyModeModal(target.dataset.setId);
        break;
      case "start-flip-mode":
        state.modal = null;
        els.appShell && els.appShell.removeAttribute("aria-hidden");
        renderModal();
        navigateToStudy(target.dataset.setId, { mode: "flip" });
        break;
      case "show-quiz-direction":
        state.modal.step = "select-quiz-direction";
        renderModal();
        break;
      case "start-quiz-direction":
        state.modal = null;
        els.appShell && els.appShell.removeAttribute("aria-hidden");
        renderModal();
        navigateToStudy(target.dataset.setId, { mode: "quiz", dir: target.dataset.dir });
        break;
      case "show-review-mode":
        state.modal.step = "select-review-mode";
        renderModal();
        break;
      case "start-review-flip":
        state.modal = null;
        els.appShell && els.appShell.removeAttribute("aria-hidden");
        renderModal();
        navigateToStudy(target.dataset.setId, { mode: "flip", reviewOnly: true });
        break;
      case "start-review-quiz":
        state.modal = null;
        els.appShell && els.appShell.removeAttribute("aria-hidden");
        renderModal();
        navigateToStudy(target.dataset.setId, { mode: "quiz", dir: "mixed", reviewOnly: true });
        break;
      case "back-to-set":
        navigateToLibrary({ setId: target.dataset.setId });
        break;
      case "flip-study-card":
        if (state.studySession && !state.studySession.complete) {
          flipStudyCard();
        }
        break;
      case "flip-got-it":
        advanceStudy("got-it");
        break;
      case "flip-missed":
        advanceStudy("missed");
        break;
      case "toggle-study-shuffle":
        toggleStudyShuffle();
        break;
      case "toggle-study-direction":
        if (state.studySession) {
          state.studySession.direction = state.studySession.direction === "term-definition" ? "definition-term" : "term-definition";
          state.studySession.isFlipped = false;
          render();
        }
        break;
      case "answer-quiz":
        answerQuizChoice(target.dataset.cardId, target.dataset.choiceId);
        break;
      case "study-again": {
        const studyAgainMode = target.dataset.mode;
        if (studyAgainMode === "quiz") {
          const route = state.route;
          initQuizSession(target.dataset.setId, { direction: route.quizDir || "term-definition", reviewOnly: false });
          render();
        } else {
          initStudySession(target.dataset.setId, false, null, false);
          render();
        }
        break;
      }
      case "review-missed": {
        const reviewMode = target.dataset.mode;
        if (reviewMode === "quiz") {
          const setId = target.dataset.setId;
          if (state.quizSession) {
            const missedIds = new Set(state.quizSession.results.filter((r) => !r.correct).map((r) => r.cardId));
            initQuizSession(setId, { direction: state.route.quizDir || "term-definition", reviewOnly: false, missedIds: missedIds });
          } else {
            initQuizSession(setId, { direction: "term-definition", reviewOnly: true });
          }
          render();
        } else {
          const setId = target.dataset.setId;
          if (state.studySession) {
            const missedIds = new Set(state.studySession.results.filter((r) => !r.correct).map((r) => r.cardId));
            initStudySession(setId, false, null, false, missedIds);
          } else {
            initStudySession(setId, false, null, true);
          }
          render();
        }
        break;
      }
      case "export-set":
        exportSet(target.dataset.setId);
        break;
      case "export-folder":
        exportFolder(target.dataset.folderId);
        break;
      case "export-all":
        exportAllSets();
        break;
      case "dismiss-backup-banner":
        window.CardedUtils.safeSet(BACKUP_DISMISS_KEY, String(Date.now()));
        render();
        break;
      case "dismiss-toast":
        hideToast();
        break;
      case "focus-add-card":
        document.getElementById("term-input")?.focus();
        break;
      case "focus-import":
        document.getElementById("bulk-import-input")?.focus();
        break;
      case "close-modal":
        if (state.modal && typeof state.modal.onCancel === "function") {
          state.modal.onCancel();
        }
        state.modal = null;
        els.appShell && els.appShell.removeAttribute("aria-hidden");
        renderModal();
        break;
      case "confirm-modal": {
        if (state.modal && typeof state.modal.onConfirm === "function") {
          const inputEl = els.modalRoot.querySelector("#modal-input");
          const inputValue = inputEl ? inputEl.value : undefined;
          const confirmBtn = target;
          window.CardedUtils.withLoading(confirmBtn, () => state.modal.onConfirm(inputValue));
        }
        break;
      }
    }
  }

  async function onDocumentSubmit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;

    event.preventDefault();
    if (form.dataset.busy === "true") return;
    form.dataset.busy = "true";

    try {
      if (form.dataset.form === "add-card") {
        const setId = form.dataset.setId;
        const formData = new FormData(form);
        const term = String(formData.get("term") || "").trim();
        const definition = String(formData.get("definition") || "").trim();
        if (!term || !definition) return;
        if (term.length > 5000 || definition.length > 5000) {
          showToast("Content is very long — consider shortening it for best results.");
        }
        await addCard(setId, term, definition);
        form.reset();
        setDirty(false);
        render();
        showToast("Card added");
      }

      if (form.dataset.form === "bulk-import") {
        const setId = form.dataset.setId;
        const formData = new FormData(form);
        const bulkText = String(formData.get("bulkText") || "");
        if (!bulkText.trim()) return;
        const result = await importCardsIntoSet(setId, bulkText);
        form.reset();
        render();
        showToast(`Imported ${result.imported} cards${result.skipped ? ` (${result.skipped} duplicates skipped)` : ""}`);
      }
    } finally {
      form.dataset.busy = "false";
    }
  }

  function onDocumentChange(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.matches("[data-action='sort-library']")) {
      state.sort = target.value;
      window.CardedUtils.safeSet(SORT_KEY, state.sort);
      render();
      return;
    }

    if (target.matches("[data-upload-input]")) {
      const input = target;
      const [file] = input.files || [];
      if (!file) return;

      if (file.name.endsWith(".zip")) {
        input.value = "";
        importFromZip(file);
        return;
      }

      file.text().then(async (text) => {
        const result = await importCardsIntoSet(input.dataset.uploadInput, text);
        input.value = "";
        render();
        showToast(`Imported ${result.imported} cards${result.skipped ? `, ${result.skipped} duplicates skipped` : ""}`);
      });
    }
  }

  function onDocumentInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.matches("[data-action='search-library']")) {
      state.search = target.value;
      render();
      return;
    }

    // Track dirty state for the add-card form
    const cardForm = target.closest("[data-form='add-card']");
    if (cardForm) {
      const term = cardForm.querySelector("[name='term']");
      const def = cardForm.querySelector("[name='definition']");
      const hasContent = (term && term.value.trim()) || (def && def.value.trim());
      setDirty(Boolean(hasContent));
    }
  }

  function onDocumentKeydown(event) {
    const target = event.target;
    const typingContext = isTypingContext(target);

    if (event.key === "Enter" && state.modal) {
      const inputEl = els.modalRoot && els.modalRoot.querySelector("#modal-input");
      if (inputEl && document.activeElement === inputEl) {
        event.preventDefault();
        const confirmBtn = els.modalRoot.querySelector("[data-action='confirm-modal']");
        confirmBtn && confirmBtn.click();
        return;
      }
    }

    if (event.key === "Escape") {
      event.preventDefault();
      if (state.modal) {
        if (typeof state.modal.onCancel === "function") state.modal.onCancel();
        state.modal = null;
        els.appShell && els.appShell.removeAttribute("aria-hidden");
        renderModal();
        return;
      }
      if (target instanceof HTMLElement && target.classList.contains("inline-editable")) {
        cancelInlineEdit(target);
        return;
      }
      handleEscapeNavigation();
      return;
    }

    if (target instanceof HTMLElement && target.classList.contains("inline-editable")) {
      if (event.key === "Enter") {
        event.preventDefault();
        target.blur();
      }
      return;
    }

    if (typingContext) return;

    if (state.route.view === "flip" && state.studySession && !state.studySession.complete) {
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        if (!state.studySession.isFlipped) {
          flipStudyCard();
        } else {
          // Enter = Got it, Backspace = Missed it when flipped
          advanceStudy("got-it");
        }
        return;
      }
      if (event.key === "Backspace") {
        event.preventDefault();
        if (state.studySession.isFlipped) advanceStudy("missed");
        return;
      }
      return;
    }

    if (state.route.view === "quiz" && state.quizSession && !state.quizSession.pendingNext && /^[1-4]$/.test(event.key)) {
      event.preventDefault();
      const choiceIndex = Number(event.key) - 1;
      const question = state.quizSession.currentQuestion;
      const choice = question?.choices?.[choiceIndex];
      if (choice) {
        answerQuizChoice(question.card.id, choice.id);
      }
      return;
    }

    if (event.key.toLowerCase() === "n" && (state.route.view === "home" || state.route.view === "folder")) {
      event.preventDefault();
      if (state.route.view === "folder") {
        promptCreateSet(state.route.folderId);
      } else {
        promptCreateSet();
      }
      return;
    }

    if (event.key.toLowerCase() === "f" && state.route.view === "home") {
      event.preventDefault();
      promptCreateFolder();
      return;
    }

    if (event.key === "/" && state.route.view === "home") {
      event.preventDefault();
      const searchEl = document.getElementById("library-search");
      if (searchEl) searchEl.focus();
      return;
    }

    const draggable = target instanceof HTMLElement ? target.closest("[data-set-tile], [data-card-row]") : null;
    if (!draggable) return;

    if ((event.key === "Enter" || event.key === " ") && !state.keyboardMove) {
      event.preventDefault();
      state.keyboardMove = {
        type: draggable.dataset.setTile ? "set" : "card",
        id: draggable.dataset.setTile || draggable.dataset.cardRow,
      };
      showToast("Move mode enabled. Use arrow keys, then Enter to confirm.");
      return;
    }

    if ((event.key === "Enter" || event.key === " ") && state.keyboardMove && state.keyboardMove.id === (draggable.dataset.setTile || draggable.dataset.cardRow)) {
      event.preventDefault();
      state.keyboardMove = null;
      showToast("Move mode complete");
      return;
    }

    if (state.keyboardMove && state.keyboardMove.type === "card" && draggable.dataset.cardRow === state.keyboardMove.id) {
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        moveCardByKeyboard(state.keyboardMove.id, event.key === "ArrowUp" ? -1 : 1);
      }
    }

    if (state.keyboardMove && state.keyboardMove.type === "set" && draggable.dataset.setTile === state.keyboardMove.id) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveSetToFolder(state.keyboardMove.id, null);
      }
      if (event.key === "ArrowRight" || event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        moveSetToNextFolder(state.keyboardMove.id, event.key === "ArrowUp" ? -1 : 1);
      }
    }
  }

  function isTypingContext(target) {
    return target instanceof HTMLElement && (
      target.matches("input, textarea, select") ||
      target.isContentEditable
    );
  }

  function handleEscapeNavigation() {
    if (state.route.view === "flip" || state.route.view === "quiz") {
      navigateToLibrary({ setId: state.route.setId });
      return;
    }
    if (state.route.view === "set") {
      const set = getSet(state.route.setId);
      navigateToLibrary(set?.folderId ? { folderId: set.folderId } : null);
      return;
    }
    if (state.route.view === "folder") {
      navigateToLibrary();
    }
  }

  function onEditableBlur(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.matches(".inline-editable[contenteditable='true']")) return;
    saveInlineEdit(target);
  }

  function onDragOver(event) {
    if (!(event.target instanceof Element)) return;
    const target = event.target.closest("[data-folder-tile], [data-drop-standalone], [data-card-row]");
    if (!target) return;
    event.preventDefault();
    target.classList.add("drop-target");
  }

  async function onDrop(event) {
    if (!(event.target instanceof Element)) return;
    const folderTarget = event.target.closest("[data-folder-tile]");
    const standaloneTarget = event.target.closest("[data-drop-standalone]");
    const cardTarget = event.target.closest("[data-card-row]");

    if (folderTarget && state.drag.setId) {
      event.preventDefault();
      await moveSetToFolder(state.drag.setId, folderTarget.dataset.folderTile);
      clearDragIndicators();
      return;
    }

    if (standaloneTarget && state.drag.setId) {
      event.preventDefault();
      await moveSetToFolder(state.drag.setId, null);
      clearDragIndicators();
      return;
    }

    if (cardTarget && state.drag.cardId) {
      event.preventDefault();
      await moveCardToPosition(state.drag.cardId, cardTarget.dataset.cardRow);
      clearDragIndicators();
    }
  }

  function clearDragIndicators() {
    document.querySelectorAll(".drop-target, .dragging").forEach((node) => node.classList.remove("drop-target", "dragging"));
    state.drag.setId = null;
    state.drag.cardId = null;
  }

  function promptCreateFolder() {
    modalTriggerEl = document.activeElement;
    state.modal = {
      title: "New folder",
      input: { label: "Folder name", placeholder: "e.g. Chemistry", value: "", maxLength: MAX_NAME_LENGTH },
      confirmLabel: "Create",
      danger: false,
      onConfirm: async function (inputValue) {
        const name = (inputValue || "").trim();
        if (!name) { showToast("Name can't be empty."); return; }
        const dupe = state.folders.find((f) => f.name.trim().toLowerCase() === name.toLowerCase());
        if (dupe) { showToast("A folder with this name already exists."); return; }
        state.modal = null;
        els.appShell && els.appShell.removeAttribute("aria-hidden");
        renderModal();
        await createFolder(name);
        render();
      },
    };
    renderModal();
  }

  function promptCreateSet(folderId) {
    folderId = folderId || null;
    modalTriggerEl = document.activeElement;
    state.modal = {
      title: "New set",
      input: { label: "Set name", placeholder: "e.g. Chapter 3 vocab", value: "", maxLength: MAX_NAME_LENGTH },
      confirmLabel: "Create",
      danger: false,
      onConfirm: async function (inputValue) {
        const name = (inputValue || "").trim();
        if (!name) { showToast("Name can't be empty."); return; }
        const siblingSets = state.sets.filter((s) => s.folderId === folderId);
        const dupe = siblingSets.find((s) => s.name.trim().toLowerCase() === name.toLowerCase());
        if (dupe) { showToast("A set with this name already exists."); return; }
        state.modal = null;
        els.appShell && els.appShell.removeAttribute("aria-hidden");
        renderModal();
        const set = await createSet(name, folderId);
        render();
        navigateToLibrary({ setId: set.id });
      },
    };
    renderModal();
  }

  function confirmDeleteFolder(folderId) {
    const folder = getFolder(folderId);
    if (!folder) return;
    const setCount = state.sets.filter((s) => s.folderId === folderId).length;
    modalTriggerEl = document.activeElement;
    state.modal = {
      title: "Delete folder?",
      copy: setCount > 0
        ? `This will permanently delete the folder and all ${setCount} set${setCount !== 1 ? "s" : ""} inside it, including all their cards. This cannot be undone.`
        : "This will permanently delete this folder. This cannot be undone.",
      confirmLabel: "Delete folder",
      danger: true,
      onConfirm: async () => {
        await deleteFolder(folderId);
        state.modal = null;
        render();
      },
    };
    renderModal();
  }

  function confirmDeleteSet(setId) {
    const set = getSet(setId);
    if (!set) return;
    modalTriggerEl = document.activeElement;
    state.modal = {
      title: "Delete set?",
      copy: "This removes the set, all of its cards, and its study stats from local storage.",
      confirmLabel: "Delete set",
      onConfirm: async () => {
        await deleteSet(setId);
        state.modal = null;
        if (state.route.view === "set" && state.route.setId === setId) {
          navigateToLibrary();
        } else {
          render();
        }
      },
    };
    renderModal();
  }

  function confirmDeleteCard(cardId) {
    modalTriggerEl = document.activeElement;
    state.modal = {
      title: "Delete card?",
      copy: "This card will be permanently removed from the set.",
      confirmLabel: "Delete card",
      onConfirm: async () => {
        await deleteCard(cardId);
        state.modal = null;
        render();
      },
    };
    renderModal();
  }

  function renderModal() {
    // Cancel any in-flight close animation so new open doesn't get cleared
    if (modalCloseTimer) {
      clearTimeout(modalCloseTimer);
      modalCloseTimer = null;
      els.modalRoot.innerHTML = "";
    }

    if (!state.modal) {
      const existingBackdrop = els.modalRoot.querySelector(".modal-backdrop");
      const trigger = modalTriggerEl;
      modalTriggerEl = null;
      if (existingBackdrop && !existingBackdrop.classList.contains("is-closing")) {
        existingBackdrop.classList.add("is-closing");
        modalCloseTimer = setTimeout(function () {
          modalCloseTimer = null;
          els.modalRoot.innerHTML = "";
          document.body.removeAttribute("aria-hidden");
          if (trigger && typeof trigger.focus === "function") trigger.focus();
        }, 200);
      } else {
        els.modalRoot.innerHTML = "";
        document.body.removeAttribute("aria-hidden");
        if (trigger && typeof trigger.focus === "function") trigger.focus();
      }
      return;
    }

    // Study mode modal — custom render
    if (state.modal.type === "study-mode") {
      els.modalRoot.innerHTML = renderStudyModeModal(state.modal);
      els.appShell && els.appShell.setAttribute("aria-hidden", "true");
      return;
    }

    const confirmClass = state.modal.danger !== false ? "danger-button" : "button";
    const modalInput = state.modal.input;
    const inputMaxLen = modalInput && modalInput.maxLength ? modalInput.maxLength : null;
    const inputHtml = modalInput
      ? `<div class="field">
           <label for="modal-input">${escapeHtml(modalInput.label || "")}</label>
           <input id="modal-input" class="input modal__input" type="text"
             value="${escapeHtml(modalInput.value || "")}"
             placeholder="${escapeHtml(modalInput.placeholder || "")}"
             ${inputMaxLen ? `maxlength="${inputMaxLen}"` : ""}
             autocomplete="off">
           ${inputMaxLen ? `<span id="modal-char-counter" style="font-size:0.88rem;color:var(--text-secondary);text-align:right">${(modalInput.value || "").length} / ${inputMaxLen}</span>` : ""}
         </div>`
      : "";

    els.modalRoot.innerHTML = `
      <div class="modal-backdrop" aria-hidden="false">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <h2 id="modal-title">${escapeHtml(state.modal.title)}</h2>
          ${state.modal.copy ? `<p>${escapeHtml(state.modal.copy)}</p>` : ""}
          ${inputHtml}
          <div class="modal__actions">
            <button class="ghost-button" data-action="close-modal">Cancel</button>
            <button class="${confirmClass}" data-action="confirm-modal">${escapeHtml(state.modal.confirmLabel)}</button>
          </div>
        </div>
      </div>
    `;

    // Prevent background interaction
    els.appShell && els.appShell.setAttribute("aria-hidden", "true");

    // Click outside to close
    const backdrop = els.modalRoot.querySelector(".modal-backdrop");
    if (backdrop) {
      backdrop.addEventListener("click", function (e) {
        if (e.target === backdrop) {
          if (state.modal && typeof state.modal.onCancel === "function") state.modal.onCancel();
          state.modal = null;
          els.appShell && els.appShell.removeAttribute("aria-hidden");
          renderModal();
        }
      });
    }

    // Character counter update
    const charInput = els.modalRoot.querySelector("#modal-input");
    const charCounter = els.modalRoot.querySelector("#modal-char-counter");
    if (charInput && charCounter) {
      charInput.addEventListener("input", function () {
        charCounter.textContent = charInput.value.length + " / " + (inputMaxLen || "");
      });
    }

    // Auto-focus: input if present, else confirm button
    const focusTarget = els.modalRoot.querySelector("#modal-input") ||
      els.modalRoot.querySelector("[data-action='confirm-modal']");
    if (focusTarget) {
      focusTarget.focus();
      if (focusTarget.tagName === "INPUT") focusTarget.select();
    }

    // Focus trap
    const modal = els.modalRoot.querySelector(".modal");
    if (modal) {
      modal.addEventListener("keydown", function (event) {
        if (event.key !== "Tab") return;
        const focusable = Array.from(modal.querySelectorAll(
          "input, button:not([disabled]), [tabindex]:not([tabindex='-1'])"
        ));
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey) {
          if (document.activeElement === first) {
            event.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      });
    }
  }

  function enableInlineEdit(element) {
    if (element.getAttribute("contenteditable") === "true") return;
    element.dataset.originalValue = element.textContent;
    element.setAttribute("contenteditable", "true");
    element.focus();
    document.execCommand("selectAll", false, null);
  }

  function cancelInlineEdit(element) {
    element.textContent = element.dataset.originalValue || element.textContent;
    element.setAttribute("contenteditable", "false");
  }

  async function saveInlineEdit(element) {
    const kind = element.dataset.editKind;
    const id = element.dataset.id;
    const value = (element.textContent || "").trim();
    element.setAttribute("contenteditable", "false");

    if (!value) {
      element.textContent = element.dataset.originalValue || "";
      return;
    }

    if (value === (element.dataset.originalValue || "").trim()) return;

    if (kind === "folder") {
      const dupe = state.folders.find((f) => f.id !== id && f.name.trim().toLowerCase() === value.toLowerCase());
      if (dupe) { showToast("A folder with this name already exists."); element.textContent = element.dataset.originalValue || ""; return; }
      await updateFolderName(id, value);
    }
    if (kind === "set") {
      const set = getSet(id);
      const sibs = set ? state.sets.filter((s) => s.folderId === set.folderId && s.id !== id) : [];
      const dupe = sibs.find((s) => s.name.trim().toLowerCase() === value.toLowerCase());
      if (dupe) { showToast("A set with this name already exists."); element.textContent = element.dataset.originalValue || ""; return; }
      await updateSetName(id, value);
    }
    if (kind === "card-term") await updateCardField(id, "term", value);
    if (kind === "card-definition") await updateCardField(id, "definition", value);

    render();
    showToast("Saved");
  }

  async function createFolder(name) {
    const folder = {
      id: crypto.randomUUID(),
      name,
      createdAt: Date.now(),
      order: nextOrder(state.folders),
    };
    await persistEntity("folders", "insert", folderToRow(folder));
    state.folders.push(folder);
    return folder;
  }

  async function createSet(name, folderId) {
    const set = {
      id: crypto.randomUUID(),
      name,
      folderId,
      createdAt: Date.now(),
      lastStudied: null,
      bestScore: null,
      timesStudied: 0,
      order: nextOrder(state.sets.filter((item) => item.folderId === folderId)),
    };
    await persistEntity("sets", "insert", setToRow(set));
    state.sets.push(set);
    return set;
  }

  async function addCard(setId, term, definition) {
    const card = {
      id: crypto.randomUUID(),
      setId,
      term,
      definition,
      correctCount: 0,
      incorrectCount: 0,
      box: 1,
      lastSeen: null,
      order: nextOrder(getCardsForSet(setId)),
    };
    await persistEntity("cards", "insert", cardToRow(card));
    state.cards.push(card);
    return card;
  }

  async function updateFolderName(id, name) {
    const folder = getFolder(id);
    if (!folder) return;
    folder.name = name;
    await persistEntity("folders", "update", folderToRow(folder));
  }

  async function updateSetName(id, name) {
    const set = getSet(id);
    if (!set) return;
    set.name = name;
    await persistEntity("sets", "update", setToRow(set));
  }

  async function updateCardField(id, field, value) {
    const card = getCard(id);
    if (!card) return;
    card[field] = value;
    await persistEntity("cards", "update", cardToRow(card));
  }

  async function deleteFolder(folderId) {
    const affectedSets = state.sets.filter((item) => item.folderId === folderId);
    for (const set of affectedSets) {
      await deleteSet(set.id);
    }
    await persistEntity("folders", "delete", { id: folderId });
    state.folders = state.folders.filter((item) => item.id !== folderId);
  }

  async function deleteSet(setId) {
    const cardsToDelete = state.cards.filter((item) => item.setId === setId);
    for (const card of cardsToDelete) {
      if (card.progressId) {
        await window.CardedDB.deleteWhere("user_card_progress", function (row) {
          return row.card_id === card.id;
        });
      }
    }
    await window.CardedDB.deleteWhere("cards", function (row) {
      return row.set_id === setId;
    });
    await persistEntity("sets", "delete", { id: setId });
    state.sets = state.sets.filter((item) => item.id !== setId);
    state.cards = state.cards.filter((item) => item.setId !== setId);
  }

  async function deleteCard(cardId) {
    const card = getCard(cardId);
    if (card && card.progressId) {
      await window.CardedDB.deleteWhere("user_card_progress", function (row) {
        return row.card_id === cardId;
      });
    }
    await persistEntity("cards", "delete", { id: cardId });
    state.cards = state.cards.filter((item) => item.id !== cardId);
  }

  async function resetSetBoxes(setId) {
    const cards = getCardsForSet(setId);
    for (const card of cards) {
      card.box = 1;
      card.lastSeen = null;
      await persistProgress(card);
    }
  }

  function parseCardLine(line) {
    // Supports: "Term | Definition", "Term\tDefinition", "Term, Definition"
    const trimmed = line.trim();
    if (!trimmed) return null;
    let sep = -1;
    if (trimmed.includes(" | ")) sep = trimmed.indexOf(" | ");
    else if (trimmed.includes("\t")) sep = trimmed.indexOf("\t");
    else if (trimmed.includes(",")) sep = trimmed.indexOf(",");
    if (sep === -1) return null;
    const term = trimmed.slice(0, sep).trim();
    const definition = trimmed.slice(sep + (trimmed[sep] === " " ? 3 : 1)).trim();
    return term && definition ? { term, definition } : null;
  }

  async function importCardsIntoSet(setId, text) {
    const lines = text.split(/\r?\n/);
    const existing = new Set(getCardsForSet(setId).map((card) => `${card.term}\u0000${card.definition}`));
    const newCards = [];
    let skipped = 0;

    for (const line of lines) {
      const parsed = parseCardLine(line);
      if (!parsed) continue;
      const { term, definition } = parsed;
      const signature = `${term}\u0000${definition}`;
      if (existing.has(signature)) {
        skipped += 1;
        continue;
      }
      existing.add(signature);
      newCards.push({
        id: crypto.randomUUID(),
        setId,
        term,
        definition,
        correctCount: 0,
        incorrectCount: 0,
        box: 1,
        points: 0,
        lastSeen: null,
        order: nextOrder(getCardsForSet(setId).concat(newCards)),
      });
    }

    if (!newCards.length) {
      return { imported: 0, skipped };
    }

    for (const card of newCards) {
      await persistEntity("cards", "insert", cardToRow(card));
    }
    state.cards.push(...newCards);
    return { imported: newCards.length, skipped };
  }

  function setToTxtContent(setId) {
    return getCardsForSet(setId)
      .map((card) => `${card.term} | ${card.definition}`)
      .join("\n");
  }

  async function exportSet(setId) {
    const set = getSet(setId);
    if (!set) return;
    downloadTextFile(`${sanitizeFileName(set.name)}.txt`, setToTxtContent(setId));
    window.CardedUtils.safeSet(LAST_EXPORT_KEY, String(Date.now()));
    showToast("Set exported");
    render();
  }

  async function exportFolder(folderId) {
    const folder = getFolder(folderId);
    if (!folder) return;
    const sets = state.sets.filter((s) => s.folderId === folderId);
    if (!sets.length) { showToast("No sets in this folder to export"); return; }

    if (typeof window.JSZip !== "undefined") {
      const zip = new window.JSZip();
      sets.forEach((set) => {
        const content = setToTxtContent(set.id);
        zip.file(`${sanitizeFileName(set.name)}.txt`, content);
      });
      const blob = await zip.generateAsync({ type: "blob" });
      downloadBlob(`${sanitizeFileName(folder.name)}.zip`, blob);
      showToast("Folder exported as .zip");
    } else {
      // Fallback: export as one combined .txt
      const sections = sets.map((set) => `# ${set.name}\n${setToTxtContent(set.id)}`);
      downloadTextFile(`${sanitizeFileName(folder.name)}.txt`, sections.join("\n\n"));
      showToast("Folder exported as .txt");
    }
    window.CardedUtils.safeSet(LAST_EXPORT_KEY, String(Date.now()));
    render();
  }

  async function exportAllSets() {
    if (typeof window.JSZip !== "undefined") {
      const zip = new window.JSZip();
      const date = new Date().toISOString().slice(0, 10);

      // Folders
      for (const folder of state.folders) {
        const folderSets = state.sets.filter((s) => s.folderId === folder.id);
        for (const set of folderSets) {
          const safeFolderName = sanitizeFileName(folder.name);
          zip.file(`${safeFolderName}/${sanitizeFileName(set.name)}.txt`, setToTxtContent(set.id));
        }
      }
      // Standalone sets
      const standalone = state.sets.filter((s) => !s.folderId);
      for (const set of standalone) {
        zip.file(`${sanitizeFileName(set.name)}.txt`, setToTxtContent(set.id));
      }

      const blob = await zip.generateAsync({ type: "blob" });
      downloadBlob(`Carded_Export_${date}.zip`, blob);
      showToast("All data exported");
    } else {
      const sections = state.sets.map((set) => {
        return `# ${set.name}\n${setToTxtContent(set.id)}`;
      });
      downloadTextFile("carded-backup.txt", sections.join("\n\n"));
      showToast("Backup exported");
    }
    window.CardedUtils.safeSet(LAST_EXPORT_KEY, String(Date.now()));
    render();
  }

  function downloadTextFile(filename, content) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    downloadBlob(filename, blob);
  }

  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function importFromZip(file) {
    if (typeof window.JSZip === "undefined") {
      showToast("Zip import is not available right now — try again when online.");
      return;
    }
    let zip;
    try {
      zip = await window.JSZip.loadAsync(file);
    } catch (_) {
      showToast("Could not read zip file.");
      return;
    }

    const txtFiles = Object.keys(zip.files).filter((name) => !zip.files[name].dir && name.endsWith(".txt"));
    if (!txtFiles.length) { showToast("No .txt files found in zip."); return; }

    let imported = 0;
    let setsCreated = 0;

    for (const filePath of txtFiles) {
      const parts = filePath.split("/");
      const fileName = parts[parts.length - 1];
      const setName = fileName.replace(/\.txt$/, "").trim();
      if (!setName) continue;

      const folderName = parts.length > 1 ? parts[0] : null;
      const text = await zip.files[filePath].async("string");

      // Find or create folder
      let folderId = null;
      if (folderName) {
        let folder = state.folders.find((f) => f.name.toLowerCase() === folderName.toLowerCase());
        if (!folder) {
          folder = await createFolder(folderName.slice(0, MAX_NAME_LENGTH));
        }
        folderId = folder.id;
      }

      // Find or create set
      let set = state.sets.find((s) => s.name.toLowerCase() === setName.toLowerCase() && s.folderId === folderId);
      if (!set) {
        set = await createSet(setName.slice(0, MAX_NAME_LENGTH), folderId);
        setsCreated += 1;
      }

      const result = await importCardsIntoSet(set.id, text);
      imported += result.imported;
    }

    showToast(`Imported ${imported} card${imported !== 1 ? "s" : ""} across ${setsCreated} new set${setsCreated !== 1 ? "s" : ""}`);
    render();
  }

  function saveStudySessionState() {
    const s = state.studySession;
    if (!s || s.complete) {
      window.CardedUtils.safeRemove(STUDY_SESSION_KEY);
      return;
    }
    window.CardedUtils.safeSet(STUDY_SESSION_KEY, JSON.stringify({
      setId: s.setId,
      mode: "flip",
      cardOrder: s.deck.map((c) => c.id),
      currentIndex: s.index,
      shuffle: s.shuffle,
      direction: s.direction,
      reviewOnly: s.reviewOnly || false,
      startedAt: s.startedAt || Date.now(),
    }));
  }

  function loadSavedStudySession(setId) {
    try {
      const raw = window.CardedUtils.safeGet(STUDY_SESSION_KEY);
      if (!raw) return null;
      const saved = JSON.parse(raw);
      if (saved.setId !== setId) return null;
      // Validate: all saved card IDs still exist in this set
      const currentCards = getCardsForSet(setId);
      const currentIds = new Set(currentCards.map((c) => c.id));
      if (!saved.cardOrder.every((id) => currentIds.has(id))) return null;
      return saved;
    } catch (_) {
      return null;
    }
  }

  function initStudySession(setId, shuffle = false, resumeData = null, reviewOnly = false, missedIds = null) {
    let cards = getCardsForSet(setId);
    if (missedIds && missedIds.size > 0) {
      cards = cards.filter((c) => missedIds.has(c.id));
    } else if (reviewOnly) {
      cards = cards.filter((c) => (c.points || 0) > 0);
    }
    if (!cards.length) {
      state.studySession = null;
      return;
    }

    let deck;
    let index = 0;
    let direction = "term-definition";
    const cardMap = new Map(cards.map((c) => [c.id, c]));

    if (resumeData && resumeData.cardOrder) {
      deck = resumeData.cardOrder.map((id) => cardMap.get(id)).filter(Boolean);
      if (!deck.length) deck = cards.slice();
      index = Math.min(resumeData.currentIndex || 0, deck.length - 1);
      direction = resumeData.direction || "term-definition";
      shuffle = resumeData.shuffle || false;
    } else {
      deck = cards.slice();
      if (shuffle) shuffleArray(deck);
    }

    state.studySession = {
      setId,
      deck,
      index,
      isFlipped: false,
      shuffle,
      direction,
      complete: false,
      reviewOnly,
      startedAt: (resumeData && resumeData.startedAt) || Date.now(),
      results: [],
      mode: "flip",
    };
    saveStudySessionState();
  }

  function flipStudyCard() {
    if (!state.studySession || state.studySession.complete) return;
    state.studySession.isFlipped = !state.studySession.isFlipped;
    const flipEl = document.querySelector(".flip-card");
    if (flipEl) {
      flipEl.classList.toggle("is-flipped", state.studySession.isFlipped);
      // Update verdict row / hint without a full re-render
      const hintEl = document.querySelector(".flip-hint");
      const verdictEl = document.querySelector(".flip-verdict-row");
      if (state.studySession.isFlipped && hintEl) {
        const newEl = createElement(`
          <div class="flip-verdict-row">
            <button class="verdict-btn verdict-missed" data-action="flip-missed">
              <span aria-hidden="true">✗</span> Missed it
            </button>
            <button class="verdict-btn verdict-got" data-action="flip-got-it">
              <span aria-hidden="true">✓</span> Got it
            </button>
          </div>`);
        hintEl.parentNode.replaceChild(newEl, hintEl);
      } else if (!state.studySession.isFlipped && verdictEl) {
        const newEl = createElement(`<div class="flip-hint">Tap the card to reveal the answer</div>`);
        verdictEl.parentNode.replaceChild(newEl, verdictEl);
      }
    } else {
      render();
    }
  }

  async function advanceStudy(result) {
    const session = state.studySession;
    if (!session || session.complete) return;

    const card = session.deck[session.index];

    if (result === "got-it" || result === "missed") {
      const isCorrect = result === "got-it";
      const prevPoints = card.points || 0;
      if (isCorrect) {
        card.points = Math.max(0, prevPoints - 1);
        card.correctCount = (card.correctCount || 0) + 1;
      } else {
        card.points = Math.min(10, prevPoints + 2);
        card.incorrectCount = (card.incorrectCount || 0) + 1;
      }
      card.lastSeen = Date.now();
      session.results.push({ cardId: card.id, correct: isCorrect, pointsAfter: card.points });
      await persistProgress(card);
    }

    const isLast = session.index + 1 >= session.deck.length;
    if (isLast && (result === "got-it" || result === "missed")) {
      session.complete = true;
      window.CardedUtils.safeRemove(STUDY_SESSION_KEY);
      const correct = session.results.filter((r) => r.correct).length;
      const pct = Math.round((correct / Math.max(1, session.results.length)) * 100);
      await recordStudyCompletion(session.setId, pct, {
        mode: "flip",
        totalCards: session.results.length,
        correctCount: correct,
        startedAt: session.startedAt,
      });
      render();
      return;
    }

    if (result === "got-it" || result === "missed") {
      session.index += 1;
      session.isFlipped = false;
      saveStudySessionState();
      render();
    }
  }

  function toggleStudyShuffle() {
    const session = state.studySession;
    if (!session) return;
    session.shuffle = !session.shuffle;
    if (session.shuffle) {
      const completed = session.deck.slice(0, session.index + 1);
      const remaining = session.deck.slice(session.index + 1);
      shuffleArray(remaining);
      session.deck = completed.concat(remaining);
    }
    render();
  }

  function initQuizSession(setId, options = {}) {
    let cards = getCardsForSet(setId);
    if (options.missedIds && options.missedIds.size > 0) {
      cards = cards.filter((c) => options.missedIds.has(c.id));
    } else if (options.reviewOnly) {
      cards = cards.filter((c) => (c.points || 0) > 0);
    }
    if (cards.length < 4) {
      state.quizSession = null;
      return;
    }

    const direction = options.direction || "term-definition";
    const deck = cards.slice();
    shuffleArray(deck);

    state.quizSession = {
      setId,
      deck,
      index: 0,
      direction,
      reviewOnly: options.reviewOnly || false,
      complete: false,
      startedAt: Date.now(),
      pendingNext: false,
      feedbackClass: "",
      results: [],
      currentQuestion: null,
    };
    nextQuizQuestion();
  }

  function nextQuizQuestion() {
    const session = state.quizSession;
    if (!session) return;

    if (session.index >= session.deck.length) {
      session.complete = true;
      const correct = session.results.filter((r) => r.correct).length;
      recordStudyCompletion(session.setId, Math.round((correct / Math.max(1, session.results.length)) * 100), {
        mode: "quiz",
        totalCards: session.results.length,
        correctCount: correct,
        startedAt: session.startedAt,
      });
      return;
    }

    const card = session.deck[session.index];
    const allCards = getCardsForSet(session.setId);
    let dir = session.direction;
    if (dir === "mixed") dir = Math.random() > 0.5 ? "term-definition" : "definition-term";

    const choices = buildQuizChoices(card, allCards, dir);
    session.currentQuestion = {
      card,
      direction: dir,
      prompt: dir === "term-definition" ? card.term : card.definition,
      choices,
      correctChoiceId: card.id,
      selectedChoiceId: null,
    };
    session.feedbackClass = "";
    session.pendingNext = false;
  }

  async function answerQuizChoice(cardId, choiceId) {
    const session = state.quizSession;
    if (!session || session.pendingNext) return;

    const question = session.currentQuestion;
    const card = getCard(cardId);
    if (!question || !card) return;

    const isCorrect = choiceId === question.correctChoiceId;
    session.pendingNext = true;
    question.selectedChoiceId = choiceId;
    session.feedbackClass = isCorrect ? "flash-correct" : "flash-incorrect";

    const prevPoints = card.points || 0;
    if (isCorrect) {
      card.points = Math.max(0, prevPoints - 1);
      card.correctCount = (card.correctCount || 0) + 1;
    } else {
      card.points = Math.min(10, prevPoints + 2);
      card.incorrectCount = (card.incorrectCount || 0) + 1;
    }
    card.lastSeen = Date.now();
    session.results.push({ cardId: card.id, correct: isCorrect, pointsAfter: card.points });
    await persistProgress(card);

    render();

    setTimeout(async () => {
      session.index += 1;
      session.pendingNext = false;
      nextQuizQuestion();
      if (session.complete) {
        const correct = session.results.filter((r) => r.correct).length;
        await recordStudyCompletion(session.setId, Math.round((correct / Math.max(1, session.results.length)) * 100), {
          mode: "quiz",
          totalCards: session.results.length,
          correctCount: correct,
          startedAt: session.startedAt,
        });
      }
      render();
    }, isCorrect ? 500 : 1200);
  }

  function buildQuizChoices(card, pool, direction) {
    const others = pool.filter((item) => item.id !== card.id);
    shuffleArray(others);
    const choices = [card].concat(others.slice(0, 3));
    shuffleArray(choices);
    return choices.map((item) => ({
      id: item.id,
      label: direction === "term-definition" ? item.definition : item.term,
    }));
  }

  function getQuizChoiceClass(session, choice) {
    if (!session.pendingNext) return "";
    if (choice.id === session.currentQuestion.correctChoiceId) return "correct";
    if (choice.id === session.currentQuestion.selectedChoiceId) return "incorrect";
    return "";
  }

  function showStudyModeModal(setId) {
    const cards = getCardsForSet(setId);
    const reviewCards = cards.filter((c) => (c.points || 0) > 0);
    const canQuiz = cards.length >= 4;
    const hasReview = reviewCards.length > 0;
    const canReviewQuiz = reviewCards.length >= 4;

    modalTriggerEl = document.activeElement;
    state.modal = {
      type: "study-mode",
      setId,
      step: "select-mode",
      cardCount: cards.length,
      reviewCount: reviewCards.length,
      canQuiz,
      hasReview,
      canReviewQuiz,
    };
    renderModal();
  }

  function renderStudyModeModal(modal) {
    const { setId, step, canQuiz, hasReview, reviewCount, canReviewQuiz } = modal;

    if (step === "select-quiz-direction") {
      return `
        <div class="modal-backdrop" aria-hidden="false">
          <div class="modal study-mode-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <h2 id="modal-title">Quiz direction</h2>
            <p style="color:var(--text-secondary);margin-bottom:16px">What do you want to see as the prompt?</p>
            <div class="mode-options">
              <button class="mode-option" data-action="start-quiz-direction" data-dir="term-definition" data-set-id="${setId}" title="You'll see the term and choose the matching definition">
                <span class="mode-option__icon">→</span>
                <div>
                  <div class="mode-option__label">Term → Definition</div>
                  <div class="mode-option__desc">See the term, pick the definition</div>
                </div>
              </button>
              <button class="mode-option" data-action="start-quiz-direction" data-dir="definition-term" data-set-id="${setId}" title="You'll see the definition and choose the matching term">
                <span class="mode-option__icon">←</span>
                <div>
                  <div class="mode-option__label">Definition → Term</div>
                  <div class="mode-option__desc">See the definition, pick the term</div>
                </div>
              </button>
              <button class="mode-option" data-action="start-quiz-direction" data-dir="mixed" data-set-id="${setId}" title="Randomly switches between both directions">
                <span class="mode-option__icon">↔</span>
                <div>
                  <div class="mode-option__label">Both (mixed)</div>
                  <div class="mode-option__desc">Randomly alternates directions</div>
                </div>
              </button>
            </div>
            <div class="modal__actions" style="margin-top:16px">
              <button class="ghost-button" data-action="close-modal">Cancel</button>
            </div>
          </div>
        </div>`;
    }

    if (step === "select-review-mode") {
      return `
        <div class="modal-backdrop" aria-hidden="false">
          <div class="modal study-mode-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <h2 id="modal-title">Needs Review — ${reviewCount} card${reviewCount !== 1 ? "s" : ""}</h2>
            <p style="color:var(--text-secondary);margin-bottom:16px">How do you want to study them?</p>
            <div class="mode-options">
              <button class="mode-option" data-action="start-review-flip" data-set-id="${setId}">
                <span class="mode-option__icon">🃏</span>
                <div>
                  <div class="mode-option__label">Flip Mode</div>
                  <div class="mode-option__desc">Flip cards, mark Got it or Missed it</div>
                </div>
              </button>
              <button class="mode-option ${canReviewQuiz ? "" : "mode-option--disabled"}" data-action="start-review-quiz" data-set-id="${setId}" ${canReviewQuiz ? "" : "disabled"}>
                <span class="mode-option__icon">🎯</span>
                <div>
                  <div class="mode-option__label">Quiz Mode</div>
                  <div class="mode-option__desc">${canReviewQuiz ? "Multiple choice questions" : "Need at least 4 cards to review"}</div>
                </div>
              </button>
            </div>
            <div class="modal__actions" style="margin-top:16px">
              <button class="ghost-button" data-action="close-modal">Cancel</button>
            </div>
          </div>
        </div>`;
    }

    // Default: select-mode
    return `
      <div class="modal-backdrop" aria-hidden="false">
        <div class="modal study-mode-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <h2 id="modal-title">Choose study mode</h2>
          <div class="mode-options">
            <button class="mode-option" data-action="start-flip-mode" data-set-id="${setId}">
              <span class="mode-option__icon">🃏</span>
              <div>
                <div class="mode-option__label">Flip Mode</div>
                <div class="mode-option__desc">Flip cards and mark Got it or Missed it</div>
              </div>
            </button>
            <button class="mode-option ${canQuiz ? "" : "mode-option--disabled"}" data-action="show-quiz-direction" data-set-id="${setId}" ${canQuiz ? "" : "disabled"}>
              <span class="mode-option__icon">🎯</span>
              <div>
                <div class="mode-option__label">Quiz Mode</div>
                <div class="mode-option__desc">${canQuiz ? "Multiple choice questions" : "Need at least 4 cards"}</div>
              </div>
            </button>
            <button class="mode-option ${hasReview ? "" : "mode-option--disabled"}" data-action="show-review-mode" data-set-id="${setId}" ${hasReview ? "" : "disabled"}>
              <span class="mode-option__icon">⚠️</span>
              <div>
                <div class="mode-option__label">Needs Review</div>
                <div class="mode-option__desc">${hasReview ? `${reviewCount} card${reviewCount !== 1 ? "s" : ""} need practice` : "All cards mastered!"}</div>
              </div>
            </button>
          </div>
          <div class="modal__actions" style="margin-top:16px">
            <button class="ghost-button" data-action="close-modal">Cancel</button>
          </div>
        </div>
      </div>`;
  }

  async function recordStudyCompletion(setId, percentage, sessionMeta) {
    const set = getSet(setId);
    if (!set) return;
    set.lastStudied = Date.now();
    set.timesStudied += 1;
    if (set.bestScore == null || percentage > set.bestScore) {
      set.bestScore = percentage;
    }

    const today = new Date().toISOString().slice(0, 10);
    const previous = state.stats.lastStudiedDate;
    if (!previous) {
      state.stats.currentStreak = 1;
      state.stats.longestStreak = 1;
    } else if (previous !== today) {
      const diff = daysBetween(previous, today);
      if (diff === 1) {
        state.stats.currentStreak += 1;
      } else if (diff > 1) {
        state.stats.currentStreak = 1;
      }
      state.stats.longestStreak = Math.max(state.stats.longestStreak, state.stats.currentStreak);
    }
    state.stats.lastStudiedDate = today;
    state.stats.totalSessions = (state.stats.totalSessions || 0) + 1;

    // Count cards studied this session
    const meta = sessionMeta || {};
    const totalCards = meta.totalCards || getCardsForSet(setId).length;
    const correctCount = meta.correctCount || 0;
    state.stats.totalCardsReviewed = (state.stats.totalCardsReviewed || 0) + totalCards;

    await persistEntity("sets", "update", setToRow(set));
    await persistStats();

    // Save study session record
    if (state.userId) {
      const sessionRow = {
        id: crypto.randomUUID(),
        user_id: state.userId,
        set_id: setId,
        mode: meta.mode || "flip",
        total_cards: totalCards,
        correct_count: correctCount,
        wrong_count: totalCards - correctCount,
        started_at: toIso(meta.startedAt || Date.now()),
        completed_at: nowIso(),
      };
      await persistEntity("study_sessions", "insert", sessionRow);
    }
  }

  function getChoiceClass(session, choice) {
    if (!session.pendingNext) return "";
    if (choice.id === session.currentQuestion.correctChoiceId) return "correct";
    if (choice.id === session.currentQuestion.selectedChoiceId) return "incorrect";
    return "";
  }

  function renderLearnFeedback(session) {
    return session.feedbackText ? escapeHtml(session.feedbackText) : "&nbsp;";
  }

  function getFilteredFolders() {
    return state.folders.filter((folder) => folder.name.toLowerCase().includes(state.search.toLowerCase()));
  }

  function getFilteredStandaloneSets() {
    return state.sets.filter((set) => !set.folderId && set.name.toLowerCase().includes(state.search.toLowerCase()));
  }

  function getFilteredSetsByFolder(folderId) {
    return state.sets.filter((set) => set.folderId === folderId && set.name.toLowerCase().includes(state.search.toLowerCase()));
  }

  function getSortedFolders(folders) {
    return folders.slice().sort((a, b) => sortEntities(a, b, "folder"));
  }

  function getSortedSets(sets) {
    return sets.slice().sort((a, b) => sortEntities(a, b, "set"));
  }

  function sortEntities(a, b, type) {
    if (state.sort === "alphabetical") return a.name.localeCompare(b.name);
    if (state.sort === "createdAt") return (b.createdAt || 0) - (a.createdAt || 0);
    if (type === "set") return (b.lastStudied || 0) - (a.lastStudied || 0) || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  }

  function shouldShowBackupBanner(totalCards) {
    if (totalCards <= 100) return false;
    const lastExport = Number(window.CardedUtils.safeGet(LAST_EXPORT_KEY) || 0);
    const dismissed = Number(window.CardedUtils.safeGet(BACKUP_DISMISS_KEY) || 0);
    const lastSeen = Math.max(lastExport, dismissed);
    return !lastSeen || Date.now() - lastSeen > 7 * DAY_MS;
  }

  async function moveSetToFolder(setId, folderId) {
    const set = getSet(setId);
    if (!set) return;
    set.folderId = folderId;
    set.order = nextOrder(state.sets.filter((item) => item.folderId === folderId && item.id !== set.id));
    await persistEntity("sets", "update", setToRow(set));
    render();
    showToast(folderId ? "Set moved into folder" : "Set moved to standalone");
  }

  async function moveSetToNextFolder(setId, direction) {
    const folders = getSortedFolders(state.folders);
    const set = getSet(setId);
    if (!set) return;
    const currentIndex = folders.findIndex((folder) => folder.id === set.folderId);
    const nextIndex = currentIndex === -1
      ? (direction > 0 ? 0 : folders.length - 1)
      : Math.max(-1, Math.min(folders.length - 1, currentIndex + direction));
    const nextFolder = folders[nextIndex] || null;
    await moveSetToFolder(setId, nextFolder ? nextFolder.id : null);
  }

  async function moveCardToPosition(cardId, targetCardId) {
    const list = getCardsForSet(state.route.setId).slice();
    const fromIndex = list.findIndex((item) => item.id === cardId);
    const toIndex = list.findIndex((item) => item.id === targetCardId);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
    const [moved] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, moved);
    await persistCardOrder(list);
    render();
  }

  async function moveCardByKeyboard(cardId, direction) {
    const list = getCardsForSet(state.route.setId).slice();
    const index = list.findIndex((item) => item.id === cardId);
    const nextIndex = index + direction;
    if (index === -1 || nextIndex < 0 || nextIndex >= list.length) return;
    const [moved] = list.splice(index, 1);
    list.splice(nextIndex, 0, moved);
    await persistCardOrder(list);
    render();
  }

  async function persistCardOrder(cards) {
    for (const [index, card] of cards.entries()) {
      card.order = index;
      await persistEntity("cards", "update", cardToRow(card));
    }
  }

  function getFolder(id) {
    return state.folders.find((item) => item.id === id);
  }

  function getSet(id) {
    return state.sets.find((item) => item.id === id);
  }

  function getCard(id) {
    return state.cards.find((item) => item.id === id);
  }

  function getCardsForSet(setId) {
    return state.cards
      .filter((card) => card.setId === setId)
      .sort((a, b) => a.order - b.order);
  }

  function getSetStats(setId) {
    return getCardsForSet(setId).reduce((acc, card) => {
      acc.correct += card.correctCount;
      acc.incorrect += card.incorrectCount;
      return acc;
    }, { correct: 0, incorrect: 0 });
  }

  function nextOrder(items) {
    if (!items.length) return 0;
    return Math.max(...items.map((item) => item.order || 0)) + 1;
  }

  function weightedPick(cards) {
    const weighted = cards.flatMap((card) => {
      const pts = card.points || 0;
      // Higher points = more repetitions (1 to 3 extra)
      const repeats = 1 + Math.floor(pts / 4);
      return Array.from({ length: repeats }, () => card);
    });
    return weighted[Math.floor(Math.random() * weighted.length)];
  }

  function formatRelativeTime(timestamp) {
    if (!timestamp) return "Never";
    const diff = Date.now() - timestamp;
    if (diff < 60 * 1000) return "just now";
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}m ago`;
    if (diff < DAY_MS) return `${Math.floor(diff / (60 * 60 * 1000))}h ago`;
    if (diff < 7 * DAY_MS) return `${Math.floor(diff / DAY_MS)}d ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString();
  }

  function formatDuration(ms) {
    const seconds = Math.round(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return minutes ? `${minutes}m ${remainder}s` : `${remainder}s`;
  }

  function daysBetween(a, b) {
    const start = new Date(`${a}T00:00:00Z`);
    const end = new Date(`${b}T00:00:00Z`);
    return Math.round((end - start) / DAY_MS);
  }

  function truncate(value) {
    return value.length > MAX_NAME_LENGTH ? `${value.slice(0, MAX_NAME_LENGTH - 1)}…` : value;
  }

  function sanitizeFileName(name) {
    return name.replace(/[^\w\-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "cards";
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }

  function shuffleArray(list) {
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  function createElement(html) {
    const template = document.createElement("template");
    template.innerHTML = html.trim();
    return template.content.firstElementChild;
  }

  function showToast(message) {
    clearTimeout(state.toastTimer);
    els.toastRoot.innerHTML = `
      <div class="toast" role="alert">
        <p>${escapeHtml(message)}</p>
        <button class="icon-button" aria-label="Dismiss notification" data-action="dismiss-toast">Dismiss</button>
      </div>
    `;
    const dismissButton = els.toastRoot.querySelector("[data-action='dismiss-toast']");
    dismissButton?.addEventListener("click", hideToast, { once: true });
    state.toastTimer = setTimeout(hideToast, 4000);
  }

  function hideToast() {
    const toast = els.toastRoot.querySelector(".toast");
    if (!toast) return;
    toast.classList.add("hide");
    setTimeout(() => {
      els.toastRoot.innerHTML = "";
    }, 180);
  }

  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    try {
      await navigator.serviceWorker.register("/carded/sw.js");
    } catch (error) {
      console.warn("Service worker registration failed", error);
    }
  }

  document.addEventListener("dragstart", (event) => {
    const setTile = event.target.closest("[data-set-tile]");
    const cardRow = event.target.closest("[data-card-row]");
    if (setTile) {
      state.drag.setId = setTile.dataset.setTile;
      setTile.classList.add("dragging");
    }
    if (cardRow) {
      state.drag.cardId = cardRow.dataset.cardRow;
      cardRow.classList.add("dragging");
    }
  });

  document.addEventListener("dragend", () => {
    clearDragIndicators();
  });

  window.addEventListener("touchstart", handleTouchStart, { passive: true });
  window.addEventListener("touchend", handleTouchEnd, { passive: true });

  let touchStartX = 0;

  function handleTouchStart(event) {
    if (state.route.view !== "flip") return;
    touchStartX = event.changedTouches[0]?.clientX || 0;
  }

  function handleTouchEnd(event) {
    if (state.route.view !== "flip" || !state.studySession || !state.studySession.isFlipped) return;
    const touchEndX = event.changedTouches[0]?.clientX || 0;
    const diff = touchEndX - touchStartX;
    if (Math.abs(diff) < 60) return;
    advanceStudy(diff < 0 ? "got-it" : "missed");
  }
})();
