(function () {
  "use strict";

  const DB_NAME = "FlashCardsDB";
  const DB_VERSION = 1;
  const SORT_KEY = "carded.sort";
  const BACKUP_DISMISS_KEY = "carded.backupDismissedAt";
  const LAST_EXPORT_KEY = "carded.lastExportAt";
  const MAX_NAME_LENGTH = 40;
  const DAY_MS = 24 * 60 * 60 * 1000;

  const state = {
    folders: [],
    sets: [],
    cards: [],
    stats: { id: "global", currentStreak: 0, lastStudiedDate: "", longestStreak: 0 },
    route: { view: "home" },
    search: "",
    sort: localStorage.getItem(SORT_KEY) || "alphabetical",
    drag: {
      setId: null,
      cardId: null,
    },
    keyboardMove: null,
    modal: null,
    toastTimer: null,
    learnSession: null,
    studySession: null,
  };

  const els = {
    app: document.getElementById("app"),
    appShell: document.getElementById("app-shell"),
    storageError: document.getElementById("storage-error"),
    toastRoot: document.getElementById("toast-root"),
    modalRoot: document.getElementById("modal-root"),
    headerActions: document.getElementById("header-actions"),
  };

  let db;
  let writeQueue = Promise.resolve();

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    if (!("indexedDB" in window)) {
      showStorageError();
      return;
    }

    try {
      db = await openDatabase();
      await ensureStatsRow();
      await loadAll();
    } catch (error) {
      console.error(error);
      showStorageError();
      return;
    }

    bindGlobalEvents();
    registerServiceWorker();
    window.addEventListener("hashchange", handleRouteChange);
    handleRouteChange();
    els.appShell.classList.remove("hidden");
    document.body.classList.add("ready");
  }

  function showStorageError() {
    els.storageError.classList.remove("hidden");
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const database = event.target.result;

        if (!database.objectStoreNames.contains("folders")) {
          const folders = database.createObjectStore("folders", { keyPath: "id" });
          folders.createIndex("order", "order", { unique: false });
        }

        if (!database.objectStoreNames.contains("sets")) {
          const sets = database.createObjectStore("sets", { keyPath: "id" });
          sets.createIndex("folderId", "folderId", { unique: false });
          sets.createIndex("order", "order", { unique: false });
        }

        if (!database.objectStoreNames.contains("cards")) {
          const cards = database.createObjectStore("cards", { keyPath: "id" });
          cards.createIndex("setId", "setId", { unique: false });
          cards.createIndex("order", "order", { unique: false });
        }

        if (!database.objectStoreNames.contains("stats")) {
          database.createObjectStore("stats", { keyPath: "id" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function tx(storeNames, mode) {
    return db.transaction(storeNames, mode);
  }

  function enqueueWrite(work) {
    const run = () => Promise.resolve().then(work);
    const next = writeQueue.then(run, run);
    writeQueue = next.catch(() => {});
    return next;
  }

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function ensureStatsRow() {
    const transaction = tx(["stats"], "readwrite");
    const store = transaction.objectStore("stats");
    const existing = await requestToPromise(store.get("global"));
    if (!existing) {
      store.put({ id: "global", currentStreak: 0, lastStudiedDate: "", longestStreak: 0 });
    }
    await transactionDone(transaction);
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  async function getAll(storeName) {
    const transaction = tx([storeName], "readonly");
    const result = await requestToPromise(transaction.objectStore(storeName).getAll());
    await transactionDone(transaction);
    return result;
  }

  async function loadAll() {
    const [folders, sets, cards, statsRows] = await Promise.all([
      getAll("folders"),
      getAll("sets"),
      getAll("cards"),
      getAll("stats"),
    ]);

    state.folders = folders;
    state.sets = sets;
    state.cards = cards;
    state.stats = statsRows.find((row) => row.id === "global") || state.stats;
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
    const hash = location.hash.replace(/^#/, "") || "/";
    const parts = hash.split("/").filter(Boolean);

    if (parts.length === 0) {
      state.route = { view: "home" };
    } else if (parts[0] === "folder" && parts[1]) {
      state.route = { view: "folder", folderId: parts[1] };
    } else if (parts[0] === "set" && parts[1]) {
      state.route = { view: "set", setId: parts[1] };
    } else if (parts[0] === "study" && parts[1]) {
      state.route = { view: "study", setId: parts[1] };
      initStudySession(parts[1]);
    } else if (parts[0] === "learn" && parts[1]) {
      state.route = { view: "learn", setId: parts[1] };
      initLearnSession(parts[1]);
    } else {
      state.route = { view: "home" };
      location.hash = "#/";
      return;
    }

    render();
    requestAnimationFrame(() => els.app.focus());
  }

  function render() {
    renderHeaderActions();
    els.app.innerHTML = "";

    switch (state.route.view) {
      case "folder":
        renderFolderView(state.route.folderId);
        break;
      case "set":
        renderSetView(state.route.setId);
        break;
      case "study":
        renderStudyView(state.route.setId);
        break;
      case "learn":
        renderLearnView(state.route.setId);
        break;
      default:
        renderHomeView();
    }

    renderModal();
  }

  function renderHeaderActions() {
    els.headerActions.innerHTML = `
      <button class="ghost-button" data-action="create-folder">New folder</button>
      <button class="button" data-action="create-set">New set</button>
    `;
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
      location.hash = "#/";
      return;
    }

    const sets = getSortedSets(getFilteredSetsByFolder(folderId));
    els.app.appendChild(createElement(`
      <section class="stack">
        ${renderBreadcrumbs([
          { href: "#/", label: "Home" },
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
      location.hash = "#/";
      return;
    }

    const folder = set.folderId ? getFolder(set.folderId) : null;
    const cards = getCardsForSet(set.id);
    const stats = getSetStats(set.id);
    const canLearn = cards.length >= 2;

    els.app.appendChild(createElement(`
      <section class="set-layout">
        ${renderBreadcrumbs([
          { href: "#/", label: "Home" },
          ...(folder ? [{ href: `#/folder/${folder.id}`, label: escapeHtml(folder.name) }] : []),
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
            <button class="ghost-button" data-action="start-study" data-set-id="${set.id}" ${cards.length ? "" : "disabled"}>Study mode</button>
            <button class="button" data-action="start-learn" data-set-id="${set.id}" ${canLearn ? "" : "disabled"}>Learn mode</button>
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
            <p class="section-copy">Paste Term, Definition lines or upload a UTF-8 .txt file.</p>
          </div>
          <form class="stack" data-form="bulk-import" data-set-id="${set.id}">
            <div class="field">
              <label for="bulk-import-input">Paste cards</label>
              <textarea id="bulk-import-input" class="textarea" name="bulkText" placeholder="Term, Definition"></textarea>
            </div>
            <div class="import-panel__actions">
              <button class="ghost-button" type="button" data-action="trigger-file-upload" data-set-id="${set.id}">Choose .txt file</button>
              <input class="visually-hidden" type="file" accept=".txt,text/plain" data-upload-input="${set.id}">
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

  function renderStudyView(setId) {
    const set = getSet(setId);
    if (!set) {
      location.hash = "#/";
      return;
    }

    const session = state.studySession;
    if (!session) {
      location.hash = `#/set/${setId}`;
      return;
    }

    if (session.complete) {
      els.app.appendChild(createElement(renderStudyComplete(set, session)));
      return;
    }

    const card = session.deck[session.index];
    const termFirst = session.direction === "term-definition";
    const front = termFirst ? card.term : card.definition;
    const back = termFirst ? card.definition : card.term;

    els.app.appendChild(createElement(`
      <section class="session-shell">
        ${renderBreadcrumbs([
          { href: "#/", label: "Home" },
          { href: `#/set/${set.id}`, label: escapeHtml(set.name) },
          { label: "Study" }
        ])}
        <div class="session-toolbar">
          <div class="control-row">
            <button class="pill-button ${session.shuffle ? "active" : ""}" data-action="toggle-study-shuffle">Shuffle remaining</button>
            <button class="pill-button" data-action="toggle-study-direction">
              ${session.direction === "term-definition" ? "Term → Definition" : "Definition → Term"}
            </button>
          </div>
          <div class="meta-inline">
            <span>${session.index + 1}/${session.deck.length}</span>
            <span>${session.isFlipped ? "Answer shown" : "Prompt side"}</span>
          </div>
        </div>
        <div class="progress" aria-hidden="true">
          <div class="progress__bar" style="width:${((session.index + 1) / session.deck.length) * 100}%"></div>
        </div>
        <div class="session-card ${session.flashClass || ""}" role="region" aria-live="polite">
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
        <div class="session-toolbar">
          <button class="ghost-button" data-action="study-prev" ${session.index === 0 ? "disabled" : ""}>Previous</button>
          <button class="button" data-action="study-next">${session.index + 1 === session.deck.length ? "Finish deck" : "Next"}</button>
        </div>
      </section>
    `));
  }

  function renderLearnView(setId) {
    const set = getSet(setId);
    const session = state.learnSession;
    if (!set || !session) {
      location.hash = `#/set/${setId}`;
      return;
    }

    if (session.complete) {
      els.app.appendChild(createElement(renderLearnSummary(set, session)));
      return;
    }

    const question = session.currentQuestion;
    els.app.appendChild(createElement(`
      <section class="learn-shell">
        ${renderBreadcrumbs([
          { href: "#/", label: "Home" },
          { href: `#/set/${set.id}`, label: escapeHtml(set.name) },
          { label: "Learn" }
        ])}
        <div class="session-toolbar">
          <div class="meta-inline">
            <span>${session.answered + 1}/${session.goal}</span>
            <span>Score ${session.correctAnswers}/${Math.max(1, session.answered)}</span>
          </div>
          <button class="ghost-button" data-action="back-to-set" data-set-id="${set.id}">Back to set</button>
        </div>
        <div class="progress" aria-hidden="true">
          <div class="progress__bar" style="width:${(session.answered / session.goal) * 100}%"></div>
        </div>
        <div class="session-card ${session.feedbackClass || ""}" role="region" aria-live="polite">
          <div class="flip-face">
            <span class="session-caption">${question.direction === "term-definition" ? "Pick the definition" : "Pick the term"}</span>
            <h2>${escapeHtml(question.prompt)}</h2>
          </div>
        </div>
        <div class="choices">
          ${question.choices.map((choice) => `
            <button
              class="ghost-button choice-button ${getChoiceClass(session, choice)}"
              data-action="answer-choice"
              data-card-id="${question.card.id}"
              data-choice-id="${choice.id}"
              ${session.pendingNext ? "disabled" : ""}
            >${escapeHtml(choice.label)}</button>
          `).join("")}
        </div>
        <div class="feedback">${renderLearnFeedback(session)}</div>
      </section>
    `));
  }

  function renderStudyComplete(set, session) {
    return `
      <section class="session-shell">
        ${renderBreadcrumbs([
          { href: "#/", label: "Home" },
          { href: `#/set/${set.id}`, label: escapeHtml(set.name) },
          { label: "Study complete" }
        ])}
        <div class="summary-card">
          <h2>Deck complete</h2>
          <p>You reached the end of the deck. Start again, shuffle, or return to the set.</p>
          <div class="summary-actions" style="margin-top:20px">
            <button class="ghost-button" data-action="restart-study" data-mode="normal">Start over</button>
            <button class="button" data-action="restart-study" data-mode="shuffle">Shuffle &amp; restart</button>
            <button class="ghost-button" data-action="back-to-set" data-set-id="${set.id}">Back to set</button>
          </div>
        </div>
      </section>
    `;
  }

  function renderLearnSummary(set, session) {
    const percentage = Math.round((session.correctAnswers / Math.max(1, session.answered)) * 100);
    return `
      <section class="session-shell">
        ${renderBreadcrumbs([
          { href: "#/", label: "Home" },
          { href: `#/set/${set.id}`, label: escapeHtml(set.name) },
          { label: "Round summary" }
        ])}
        <div class="summary-card" style="width:min(760px,100%)">
          <div class="summary-card__header">
            <div class="stack">
              <h2>Round summary</h2>
              <p>${session.correctAnswers}/${session.answered} correct in ${formatDuration(Date.now() - session.startedAt)}.</p>
            </div>
            <div class="badge">${percentage}%</div>
          </div>
          <div class="summary-grid" style="margin:20px 0">
            <div class="stat-card">
              <div class="meta-label">Score</div>
              <div class="stat-value">${session.correctAnswers}/${session.answered}</div>
            </div>
            <div class="stat-card">
              <div class="meta-label">Time taken</div>
              <div class="stat-value">${formatDuration(Date.now() - session.startedAt)}</div>
            </div>
            <div class="stat-card">
              <div class="meta-label">Missed cards</div>
              <div class="stat-value">${session.missedMap.size}</div>
            </div>
          </div>
          ${session.missedMap.size ? `
            <div class="stack">
              <h3>Missed cards</h3>
              <div class="list">
                ${Array.from(session.missedMap.values()).map((entry) => `
                  <div class="panel">
                    <strong>${escapeHtml(entry.term)}</strong>
                    <p>${escapeHtml(entry.definition)}</p>
                  </div>
                `).join("")}
              </div>
            </div>
          ` : `<p>No misses this round.</p>`}
          <div class="summary-actions" style="margin-top:20px">
            <button class="ghost-button" data-action="retry-missed" data-set-id="${set.id}" ${session.missedMap.size ? "" : "disabled"}>Retry missed cards only</button>
            <button class="button" data-action="retry-all" data-set-id="${set.id}">Retry all cards</button>
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
      <article class="tile folder" data-folder-tile="${folder.id}">
        <div class="tile__header">
          <div class="stack">
            <strong class="tile__name inline-editable" data-open-folder="${folder.id}" contenteditable="false" data-edit-kind="folder" data-id="${folder.id}" title="${escapeAttribute(folder.name)}">${escapeHtml(truncate(folder.name))}</strong>
            <span class="meta-copy">${sets.length} set${sets.length === 1 ? "" : "s"}</span>
          </div>
          <span class="badge">${totalCards}</span>
        </div>
        <div class="tile__meta">
          <div class="meta-item"><span class="meta-label">Created</span><span>${formatDate(folder.createdAt)}</span></div>
          <div class="meta-item"><span class="meta-label">Cards</span><span>${totalCards}</span></div>
        </div>
        <div class="tile__footer">
          <a class="tile__open" href="#/folder/${folder.id}">Open folder</a>
          <div class="tile__actions">
            <button class="icon-button" aria-label="Delete folder" data-action="delete-folder" data-folder-id="${folder.id}">Delete</button>
          </div>
        </div>
      </article>
    `;
  }

  function renderSetTile(set, folder) {
    return `
      <article
        class="tile set"
        draggable="true"
        tabindex="0"
        data-set-tile="${set.id}"
        data-folder-id="${folder ? folder.id : ""}"
        aria-label="Set ${escapeAttribute(set.name)}"
      >
        <div class="tile__header">
          <div class="stack">
            <strong class="tile__name inline-editable" data-open-set="${set.id}" contenteditable="false" data-edit-kind="set" data-id="${set.id}" title="${escapeAttribute(set.name)}">${escapeHtml(truncate(set.name))}</strong>
            <span class="meta-copy">${folder ? escapeHtml(folder.name) : "Standalone set"}</span>
          </div>
          <span class="badge">${getCardsForSet(set.id).length}</span>
        </div>
        <div class="tile__meta">
          <div class="meta-item"><span class="meta-label">Last studied</span><span>${formatRelativeTime(set.lastStudied)}</span></div>
          <div class="meta-item"><span class="meta-label">Created</span><span>${formatDate(set.createdAt)}</span></div>
        </div>
        <div class="tile__footer">
          <a class="tile__open" href="#/set/${set.id}">Open set</a>
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
      location.hash = `#/folder/${target.dataset.openFolder}`;
      return;
    }

    if (target.dataset.openSet) {
      location.hash = `#/set/${target.dataset.openSet}`;
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
      case "start-study":
        location.hash = `#/study/${target.dataset.setId}`;
        break;
      case "start-learn":
        location.hash = `#/learn/${target.dataset.setId}`;
        break;
      case "back-to-set":
        location.hash = `#/set/${target.dataset.setId}`;
        break;
      case "flip-study-card":
        if (state.studySession) {
          state.studySession.isFlipped = !state.studySession.isFlipped;
          render();
        }
        break;
      case "study-next":
        advanceStudy(1);
        break;
      case "study-prev":
        advanceStudy(-1);
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
      case "answer-choice":
        answerLearnChoice(target.dataset.cardId, target.dataset.choiceId);
        break;
      case "retry-missed":
        initLearnSession(target.dataset.setId, { missedOnly: true });
        render();
        break;
      case "retry-all":
        await resetSetBoxes(target.dataset.setId);
        initLearnSession(target.dataset.setId);
        render();
        break;
      case "restart-study":
        initStudySession(state.route.setId, target.dataset.mode === "shuffle");
        render();
        break;
      case "export-set":
        exportSet(target.dataset.setId);
        break;
      case "export-all":
        exportAllSets();
        break;
      case "dismiss-backup-banner":
        localStorage.setItem(BACKUP_DISMISS_KEY, String(Date.now()));
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
        state.modal = null;
        renderModal();
        break;
      case "confirm-modal":
        if (state.modal && typeof state.modal.onConfirm === "function") {
          state.modal.onConfirm();
        }
        break;
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
        await addCard(setId, term, definition);
        form.reset();
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
      localStorage.setItem(SORT_KEY, state.sort);
      render();
      return;
    }

    if (target.matches("[data-upload-input]")) {
      const input = target;
      const [file] = input.files || [];
      if (!file) return;

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
    }
  }

  function onDocumentKeydown(event) {
    const target = event.target;
    const typingContext = isTypingContext(target);

    if (event.key === "Escape") {
      event.preventDefault();
      if (state.modal) {
        state.modal = null;
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

    if (state.route.view === "study" && state.studySession) {
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
        event.preventDefault();
        advanceStudy(1);
      } else if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
        event.preventDefault();
        advanceStudy(-1);
      } else if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        state.studySession.isFlipped = !state.studySession.isFlipped;
        render();
      }
      return;
    }

    if (state.route.view === "learn" && state.learnSession && /^[1-4]$/.test(event.key)) {
      event.preventDefault();
      const choiceIndex = Number(event.key) - 1;
      const question = state.learnSession.currentQuestion;
      const choice = question?.choices?.[choiceIndex];
      if (choice) {
        answerLearnChoice(question.card.id, choice.id);
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
    if (state.route.view === "study" || state.route.view === "learn") {
      location.hash = `#/set/${state.route.setId}`;
      return;
    }
    if (state.route.view === "set") {
      const set = getSet(state.route.setId);
      location.hash = set?.folderId ? `#/folder/${set.folderId}` : "#/";
      return;
    }
    if (state.route.view === "folder") {
      location.hash = "#/";
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

  async function promptCreateFolder() {
    const name = window.prompt("Folder name");
    if (!name || !name.trim()) return;
    await createFolder(name.trim());
    render();
  }

  async function promptCreateSet(folderId = null) {
    const name = window.prompt("Set name");
    if (!name || !name.trim()) return;
    const set = await createSet(name.trim(), folderId || null);
    render();
    location.hash = `#/set/${set.id}`;
  }

  function confirmDeleteFolder(folderId) {
    const folder = getFolder(folderId);
    if (!folder) return;
    state.modal = {
      title: "Delete folder?",
      copy: "Sets inside this folder will become standalone. The folder itself will be removed.",
      confirmLabel: "Delete folder",
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
    state.modal = {
      title: "Delete set?",
      copy: "This removes the set, all of its cards, and its study stats from local storage.",
      confirmLabel: "Delete set",
      onConfirm: async () => {
        await deleteSet(setId);
        state.modal = null;
        if (state.route.view === "set" && state.route.setId === setId) {
          location.hash = "#/";
        } else {
          render();
        }
      },
    };
    renderModal();
  }

  function confirmDeleteCard(cardId) {
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
    if (!state.modal) {
      els.modalRoot.innerHTML = "";
      return;
    }

    els.modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <h2 id="modal-title">${escapeHtml(state.modal.title)}</h2>
          <p>${escapeHtml(state.modal.copy)}</p>
          <div class="modal__actions">
            <button class="ghost-button" data-action="close-modal">Cancel</button>
            <button class="danger-button" data-action="confirm-modal">${escapeHtml(state.modal.confirmLabel)}</button>
          </div>
        </div>
      </div>
    `;
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

    if (kind === "folder") await updateFolderName(id, value);
    if (kind === "set") await updateSetName(id, value);
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
    await putRecord("folders", folder);
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
    await putRecord("sets", set);
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
    await putRecord("cards", card);
    state.cards.push(card);
    return card;
  }

  async function updateFolderName(id, name) {
    const folder = getFolder(id);
    if (!folder) return;
    folder.name = name;
    await putRecord("folders", folder);
  }

  async function updateSetName(id, name) {
    const set = getSet(id);
    if (!set) return;
    set.name = name;
    await putRecord("sets", set);
  }

  async function updateCardField(id, field, value) {
    const card = getCard(id);
    if (!card) return;
    card[field] = value;
    await putRecord("cards", card);
  }

  async function deleteFolder(folderId) {
    await enqueueWrite(async () => {
      const affectedSets = state.sets.filter((item) => item.folderId === folderId);
      const transaction = tx(["folders", "sets"], "readwrite");
      const folderStore = transaction.objectStore("folders");
      const setStore = transaction.objectStore("sets");

      for (const set of affectedSets) {
        set.folderId = null;
        set.order = nextOrder(state.sets.filter((item) => item.folderId === null && item.id !== set.id));
        setStore.put(set);
      }

      folderStore.delete(folderId);
      await transactionDone(transaction);
      state.folders = state.folders.filter((item) => item.id !== folderId);
    });
  }

  async function deleteSet(setId) {
    await enqueueWrite(async () => {
      const transaction = tx(["sets", "cards"], "readwrite");
      transaction.objectStore("sets").delete(setId);
      const cardStore = transaction.objectStore("cards");
      for (const card of state.cards.filter((item) => item.setId === setId)) {
        cardStore.delete(card.id);
      }
      await transactionDone(transaction);
      state.sets = state.sets.filter((item) => item.id !== setId);
      state.cards = state.cards.filter((item) => item.setId !== setId);
    });
  }

  async function deleteCard(cardId) {
    await deleteRecord("cards", cardId);
    state.cards = state.cards.filter((item) => item.id !== cardId);
  }

  async function resetSetBoxes(setId) {
    await enqueueWrite(async () => {
      const cards = getCardsForSet(setId);
      const transaction = tx(["cards"], "readwrite");
      const store = transaction.objectStore("cards");
      cards.forEach((card) => {
        card.box = 1;
        card.lastSeen = null;
        store.put(card);
      });
      await transactionDone(transaction);
    });
  }

  async function putRecord(storeName, record) {
    await enqueueWrite(async () => {
      const transaction = tx([storeName], "readwrite");
      transaction.objectStore(storeName).put(record);
      await transactionDone(transaction);
    });
  }

  async function deleteRecord(storeName, key) {
    await enqueueWrite(async () => {
      const transaction = tx([storeName], "readwrite");
      transaction.objectStore(storeName).delete(key);
      await transactionDone(transaction);
    });
  }

  async function importCardsIntoSet(setId, text) {
    const lines = text.split(/\r?\n/);
    const existing = new Set(getCardsForSet(setId).map((card) => `${card.term}\u0000${card.definition}`));
    const newCards = [];
    let skipped = 0;

    for (const line of lines) {
      if (!line.trim()) continue;
      const commaIndex = line.indexOf(",");
      if (commaIndex === -1) continue;
      const term = line.slice(0, commaIndex).trim();
      const definition = line.slice(commaIndex + 1).trim();
      if (!term || !definition) continue;
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
        lastSeen: null,
        order: nextOrder(getCardsForSet(setId).concat(newCards)),
      });
    }

    if (!newCards.length) {
      return { imported: 0, skipped };
    }

    await enqueueWrite(async () => {
      const transaction = tx(["cards"], "readwrite");
      const store = transaction.objectStore("cards");
      for (const card of newCards) {
        store.put(card);
      }
      await transactionDone(transaction);
    });
    state.cards.push(...newCards);
    return { imported: newCards.length, skipped };
  }

  async function exportSet(setId) {
    const set = getSet(setId);
    if (!set) return;
    const text = getCardsForSet(setId)
      .map((card) => `${card.term}, ${card.definition}`)
      .join("\n");
    downloadTextFile(`${sanitizeFileName(set.name)}.txt`, text);
    localStorage.setItem(LAST_EXPORT_KEY, String(Date.now()));
    showToast("Set exported");
    render();
  }

  function exportAllSets() {
    const sections = state.sets.map((set) => {
      const lines = getCardsForSet(set.id).map((card) => `${card.term}, ${card.definition}`).join("\n");
      return `# ${set.name}\n${lines}`;
    });
    downloadTextFile("carded-backup.txt", sections.join("\n\n"));
    localStorage.setItem(LAST_EXPORT_KEY, String(Date.now()));
    showToast("Backup exported");
    render();
  }

  function downloadTextFile(filename, content) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function initStudySession(setId, shuffle = false) {
    const cards = getCardsForSet(setId);
    if (!cards.length) {
      state.studySession = null;
      return;
    }
    const deck = cards.slice();
    if (shuffle) shuffleArray(deck);
    state.studySession = {
      setId,
      deck,
      index: 0,
      isFlipped: false,
      shuffle,
      direction: "term-definition",
      complete: false,
    };
  }

  async function advanceStudy(step) {
    const session = state.studySession;
    if (!session) return;

    if (step > 0 && session.index + 1 >= session.deck.length) {
      session.complete = true;
      await recordStudyCompletion(session.setId, 100);
      render();
      return;
    }

    session.index = Math.max(0, Math.min(session.deck.length - 1, session.index + step));
    session.isFlipped = false;
    render();
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

  function initLearnSession(setId, options = {}) {
    const cards = options.missedOnly && state.learnSession
      ? Array.from(state.learnSession.missedMap.values())
      : getCardsForSet(setId);

    if (cards.length < 2) {
      state.learnSession = null;
      return;
    }

    state.learnSession = {
      setId,
      pool: cards.map((card) => ({ ...card })),
      goal: Math.max(cards.length * 2, 10),
      answered: 0,
      correctAnswers: 0,
      startedAt: Date.now(),
      currentQuestion: null,
      pendingNext: false,
      feedbackText: "",
      feedbackClass: "",
      complete: false,
      missedMap: new Map(),
    };
    nextLearnQuestion();
  }

  function nextLearnQuestion() {
    const session = state.learnSession;
    if (!session) return;

    if (session.answered >= session.goal) {
      session.complete = true;
      recordStudyCompletion(session.setId, Math.round((session.correctAnswers / Math.max(1, session.answered)) * 100));
      return;
    }

    const card = weightedPick(session.pool);
    const direction = Math.random() > 0.5 ? "term-definition" : "definition-term";
    const choices = buildChoices(card, session.pool, direction);

    session.currentQuestion = {
      card,
      direction,
      prompt: direction === "term-definition" ? card.term : card.definition,
      choices,
      correctChoiceId: card.id,
      selectedChoiceId: null,
    };
    session.feedbackText = "";
    session.feedbackClass = "";
    session.pendingNext = false;
  }

  async function answerLearnChoice(cardId, choiceId) {
    const session = state.learnSession;
    if (!session || session.pendingNext) return;

    const question = session.currentQuestion;
    const card = getCard(cardId);
    if (!question || !card) return;

    const isCorrect = choiceId === question.correctChoiceId;
    session.pendingNext = true;
    session.answered += 1;
    question.selectedChoiceId = choiceId;

    if (isCorrect) {
      session.correctAnswers += 1;
      session.feedbackText = "Correct";
      session.feedbackClass = "flash-correct";
      card.correctCount += 1;
      card.box = Math.min(3, card.box + 1);
    } else {
      session.feedbackText = `Incorrect. Correct answer: ${question.choices.find((choice) => choice.id === question.correctChoiceId).label}`;
      session.feedbackClass = "flash-incorrect";
      card.incorrectCount += 1;
      card.box = 1;
      session.missedMap.set(card.id, { term: card.term, definition: card.definition });
    }

    card.lastSeen = Date.now();
    await putRecord("cards", card);
    const poolCard = session.pool.find((item) => item.id === card.id);
    if (poolCard) {
      poolCard.correctCount = card.correctCount;
      poolCard.incorrectCount = card.incorrectCount;
      poolCard.box = card.box;
      poolCard.lastSeen = card.lastSeen;
    }

    setTimeout(() => {
      session.pendingNext = false;
      nextLearnQuestion();
      render();
    }, isCorrect ? 500 : 1500);

    render();
  }

  function buildChoices(card, pool, direction) {
    const others = pool.filter((item) => item.id !== card.id);
    shuffleArray(others);
    const choices = [card].concat(others.slice(0, Math.min(3, others.length)));
    shuffleArray(choices);
    return choices.map((item) => ({
      id: item.id,
      label: direction === "term-definition" ? item.definition : item.term,
    }));
  }

  async function recordStudyCompletion(setId, percentage) {
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

    await enqueueWrite(async () => {
      const transaction = tx(["sets", "stats"], "readwrite");
      transaction.objectStore("sets").put(set);
      transaction.objectStore("stats").put(state.stats);
      await transactionDone(transaction);
    });
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
    const lastExport = Number(localStorage.getItem(LAST_EXPORT_KEY) || 0);
    const dismissed = Number(localStorage.getItem(BACKUP_DISMISS_KEY) || 0);
    const lastSeen = Math.max(lastExport, dismissed);
    return !lastSeen || Date.now() - lastSeen > 7 * DAY_MS;
  }

  async function moveSetToFolder(setId, folderId) {
    const set = getSet(setId);
    if (!set) return;
    set.folderId = folderId;
    set.order = nextOrder(state.sets.filter((item) => item.folderId === folderId && item.id !== set.id));
    await putRecord("sets", set);
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
    await enqueueWrite(async () => {
      const transaction = tx(["cards"], "readwrite");
      const store = transaction.objectStore("cards");
      cards.forEach((card, index) => {
        card.order = index;
        store.put(card);
      });
      await transactionDone(transaction);
    });
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
      const repeats = Math.max(1, 4 - (card.box || 1)) + Math.min(card.incorrectCount || 0, 3);
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
    state.toastTimer = setTimeout(hideToast, 3000);
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
      await navigator.serviceWorker.register("./sw.js");
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
    if (state.route.view !== "study") return;
    touchStartX = event.changedTouches[0]?.clientX || 0;
  }

  function handleTouchEnd(event) {
    if (state.route.view !== "study" || !state.studySession) return;
    const touchEndX = event.changedTouches[0]?.clientX || 0;
    const diff = touchEndX - touchStartX;
    if (Math.abs(diff) < 40) return;
    advanceStudy(diff < 0 ? 1 : -1);
  }
})();
