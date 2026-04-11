(function () {
  "use strict";

  // ── State ──────────────────────────────────────────────────────────────────────
  const MAX_PUBLISHES = 10;
  const MIN_CARDS_SET = 5;
  const MAX_CARDS_SET = 500;
  const MIN_SETS_FOLDER = 2;
  const MAX_SETS_FOLDER = 20;

  const state = {
    view: "browse",       // "browse" | "profile" | "shared"
    items: [],            // community_publishes rows on the current page
    page: 0,
    hasMore: true,
    search: "",
    filter: "all",        // "all" | "set" | "folder"
    sort: "newest",       // "newest" | "most-added" | "alphabetical"
    loading: false,
    userId: null,         // null = unauthenticated
    userEmail: "",
    localMode: false,
    myAdds: new Map(),    // publish_id → community_add row (for the current user)
    myPublishes: [],      // community_publishes owned by current user
    mySharedLinks: [],    // shared_links owned by current user
    profileUser: null,    // for profile view: { id, display_name, bio, avatar_url }
    profileItems: [],     // community items owned by profileUser
    sharedLink: null,     // for shared view: shared_links row
    sharedContent: null,  // for shared view: { set/folder + cards/sets }
    sharedPublish: null,  // for shared view: matching publish if any
  };

  // ── DOM helpers ────────────────────────────────────────────────────────────────
  function esc(str) {
    return window.CardedUtils ? window.CardedUtils.escapeHtml(String(str || "")) : String(str || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function escAttr(str) { return esc(str); }

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) Object.entries(attrs).forEach(function ([k, v]) {
      if (k === "class") node.className = v;
      else if (k === "style") node.style.cssText = v;
      else node.setAttribute(k, v);
    });
    children.forEach(function (c) {
      if (typeof c === "string") node.insertAdjacentHTML("beforeend", c);
      else if (c) node.appendChild(c);
    });
    return node;
  }

  function getApp() { return document.getElementById("community-app"); }
  function getModal() { return document.getElementById("modal-root"); }
  function getToast() { return document.getElementById("toast-root"); }

  function showToast(msg, type) {
    if (window.CardedComponents) {
      window.CardedComponents.showToast(msg, type);
    } else {
      alert(msg);
    }
  }

  function formatDate(iso) {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }
    catch (_) { return "—"; }
  }

  // ── Init ───────────────────────────────────────────────────────────────────────
  async function init() {
    // Optionally get session (community is public — no redirect)
    try {
      if (window.supabaseClient) {
        const { data } = await window.supabaseClient.auth.getSession();
        const session = data && data.session;
        if (session && session.user) {
          state.userId = session.user.id;
          state.userEmail = session.user.email || "";
        }
      }
    } catch (_) {}

    // Local mode
    if (!state.userId && window.CardedUtils && window.CardedUtils.safeGet("carded_local_mode") === "true") {
      state.userId = "local-user";
      state.localMode = true;
    }

    // If authenticated, load user's own data in background
    if (state.userId && !state.localMode) {
      loadUserContext().catch(function () {});
    }

    // Render topbar
    renderTopbar();

    // Route
    const params = new URLSearchParams(window.location.search);
    const sharedId = params.get("shared");
    const profileId = params.get("user");

    if (sharedId) {
      state.view = "shared";
      await initSharedView(sharedId);
    } else if (profileId) {
      state.view = "profile";
      await initProfileView(profileId);
    } else {
      state.view = "browse";
      await initBrowseView();
    }

    // Check orphans for authenticated users
    if (state.userId && !state.localMode) {
      checkAndShowOrphans().catch(function () {});
    }
  }

  async function loadUserContext() {
    try {
      const [adds, publishes, links] = await Promise.all([
        window.CardedSupabaseDB.getUserCommunityAdds(state.userId),
        window.CardedSupabaseDB.getUserPublishes(state.userId),
        window.CardedSupabaseDB.getUserSharedLinks(state.userId),
      ]);
      state.myAdds = new Map((adds || []).map(function (r) { return [r.publish_id, r]; }));
      state.myPublishes = publishes || [];
      state.mySharedLinks = links || [];
      // Re-render to show correct Add/Added buttons
      reRenderItems();
    } catch (_) {}
  }

  // ── Browse view ────────────────────────────────────────────────────────────────
  async function initBrowseView() {
    const app = getApp();
    if (!app) return;
    app.innerHTML = "";

    if (!state.userId) {
      app.appendChild(renderUnauthBanner(
        "You're browsing community sets. Sign in to add sets to your library or publish your own.",
        "/carded/login"
      ));
    }

    // Controls
    app.appendChild(renderBrowseControls());

    // Grid placeholder
    const grid = document.createElement("div");
    grid.id = "community-grid";
    grid.className = "tile-grid";
    app.appendChild(grid);

    // Load more button
    const loadMoreWrap = document.createElement("div");
    loadMoreWrap.id = "load-more-wrap";
    loadMoreWrap.style.cssText = "text-align:center;padding:24px 0";
    app.appendChild(loadMoreWrap);

    await loadPage(true);
  }

  function renderBrowseControls() {
    const wrap = document.createElement("div");
    wrap.className = "community-controls";

    wrap.innerHTML = `
      <div class="control-row" style="flex-wrap:wrap;gap:12px;margin-bottom:20px">
        <div class="community-search-wrap">
          <input
            id="community-search"
            class="input community-search"
            type="search"
            placeholder="Search by title…"
            value="${escAttr(state.search)}"
            aria-label="Search community"
          >
        </div>
        <div class="control-group" role="group" aria-label="Filter by type">
          ${["all","set","folder"].map(function (f) {
            return `<button class="pill-button${state.filter === f ? " active" : ""}" data-community-filter="${f}" type="button">
              ${f === "all" ? "All" : f === "set" ? "Sets" : "Folders"}
            </button>`;
          }).join("")}
        </div>
        <select id="community-sort" class="select" aria-label="Sort by" style="width:auto">
          <option value="newest" ${state.sort === "newest" ? "selected" : ""}>Newest</option>
          <option value="most-added" ${state.sort === "most-added" ? "selected" : ""}>Most added</option>
          <option value="alphabetical" ${state.sort === "alphabetical" ? "selected" : ""}>A–Z</option>
        </select>
      </div>
    `;

    wrap.querySelector("#community-search").addEventListener("input", debounce(function (e) {
      state.search = e.target.value.trim();
      loadPage(true);
    }, 350));

    wrap.querySelector("#community-sort").addEventListener("change", function (e) {
      state.sort = e.target.value;
      loadPage(true);
    });

    wrap.querySelectorAll("[data-community-filter]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.filter = btn.dataset.communityFilter;
        wrap.querySelectorAll("[data-community-filter]").forEach(function (b) {
          b.classList.toggle("active", b.dataset.communityFilter === state.filter);
        });
        loadPage(true);
      });
    });

    return wrap;
  }

  async function loadPage(reset) {
    if (state.loading) return;
    state.loading = true;

    if (reset) {
      state.page = 0;
      state.items = [];
      state.hasMore = true;
    }

    const grid = document.getElementById("community-grid");
    const loadMoreWrap = document.getElementById("load-more-wrap");
    if (!grid) { state.loading = false; return; }

    if (reset) {
      grid.innerHTML = `<div class="community-loading" style="grid-column:1/-1;text-align:center;padding:48px;color:var(--text-secondary)">Loading…</div>`;
    }

    try {
      const items = await window.CardedSupabaseDB.getCommunityPublishes({
        search: state.search,
        filter: state.filter,
        sort: state.sort,
        page: state.page,
      });

      if (reset) grid.innerHTML = "";
      state.hasMore = items.length === 20;
      state.items = reset ? items : state.items.concat(items);

      if (state.items.length === 0) {
        grid.innerHTML = `
          <div class="empty-state" style="grid-column:1/-1">
            <p>No community sets found.</p>
            ${state.search ? `<p style="color:var(--text-secondary);font-size:0.9rem">Try a different search term.</p>` : ""}
          </div>`;
      } else {
        items.forEach(function (item) {
          grid.appendChild(renderPublishTile(item));
        });
      }

      if (loadMoreWrap) {
        loadMoreWrap.innerHTML = state.hasMore
          ? `<button class="ghost-button" id="load-more-btn" type="button">Load more</button>`
          : "";
        const loadBtn = loadMoreWrap.querySelector("#load-more-btn");
        if (loadBtn) {
          loadBtn.addEventListener("click", function () {
            state.page += 1;
            loadPage(false);
          });
        }
      }
    } catch (err) {
      console.error("Community load error:", err);
      if (reset) {
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p>Could not load community content. Check your connection.</p></div>`;
      }
    }

    state.loading = false;
  }

  function reRenderItems() {
    const grid = document.getElementById("community-grid");
    if (!grid || !state.items.length) return;
    const newTiles = state.items.map(renderPublishTile);
    grid.innerHTML = "";
    newTiles.forEach(function (t) { grid.appendChild(t); });
  }

  // ── Profile view ───────────────────────────────────────────────────────────────
  async function initProfileView(profileUserId) {
    const app = getApp();
    if (!app) return;
    app.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-secondary)">Loading profile…</div>`;

    try {
      const [profile, publishes] = await Promise.all([
        window.CardedSupabaseDB.getPublicProfile(profileUserId),
        window.CardedSupabaseDB.getUserPublishes(profileUserId),
      ]);

      if (!profile) {
        app.innerHTML = `<div class="empty-state"><p>Profile not found.</p></div>`;
        return;
      }

      state.profileUser = profile;
      state.profileItems = publishes || [];
      renderProfilePage(profile, publishes);
    } catch (err) {
      console.error("Profile load error:", err);
      app.innerHTML = `<div class="empty-state"><p>Could not load profile.</p></div>`;
    }
  }

  function renderProfilePage(profile, items) {
    const app = getApp();
    if (!app) return;
    app.innerHTML = "";

    const displayName = profile.display_name || "Anonymous";
    const avatarHtml = profile.avatar_url
      ? `<img src="${escAttr(profile.avatar_url)}" alt="${escAttr(displayName)}" class="profile-pic-lg" style="object-fit:cover">`
      : `<div class="profile-pic-lg" aria-hidden="true" style="display:flex;align-items:center;justify-content:center;font-size:2rem;font-weight:700">${esc(displayName.charAt(0).toUpperCase())}</div>`;

    const headerEl = document.createElement("section");
    headerEl.className = "community-profile-header panel";
    headerEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
        ${avatarHtml}
        <div class="stack" style="flex:1;min-width:0">
          <h1 style="margin:0;font-size:1.4rem">${esc(displayName)}</h1>
          ${profile.bio ? `<p style="color:var(--text-secondary);margin:4px 0 0;max-width:500px">${esc(profile.bio)}</p>` : ""}
        </div>
      </div>
    `;
    app.appendChild(headerEl);

    const sectionEl = document.createElement("section");
    sectionEl.className = "stack";

    const heading = document.createElement("h2");
    heading.style.cssText = "margin:0 0 16px";
    heading.textContent = `Published sets & folders (${items.length})`;
    sectionEl.appendChild(heading);

    if (items.length === 0) {
      sectionEl.innerHTML += `<div class="empty-state"><p>No published content yet.</p></div>`;
    } else {
      const grid = document.createElement("div");
      grid.className = "tile-grid";
      items.forEach(function (item) { grid.appendChild(renderPublishTile(item)); });
      sectionEl.appendChild(grid);
    }
    app.appendChild(sectionEl);
  }

  // ── Shared link view ───────────────────────────────────────────────────────────
  async function initSharedView(shareId) {
    const app = getApp();
    if (!app) return;
    app.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-secondary)">Loading shared content…</div>`;

    try {
      const link = await window.CardedSupabaseDB.getSharedLink(shareId);
      if (!link) {
        app.innerHTML = `
          <div class="empty-state">
            <p>This shared link is no longer active.</p>
            <a class="button" href="${esc(window.BASE_PATH || "/carded")}/community/" style="margin-top:16px">Browse Community</a>
          </div>`;
        return;
      }

      state.sharedLink = link;
      const content = await window.CardedSupabaseDB.getCommunityPublishContent(link);
      if (!content) {
        app.innerHTML = `<div class="empty-state"><p>The shared content could not be found.</p></div>`;
        return;
      }
      state.sharedContent = content;
      renderSharedPage(link, content);
    } catch (err) {
      console.error("Shared link error:", err);
      app.innerHTML = `<div class="empty-state"><p>Could not load shared content. Check your connection.</p></div>`;
    }
  }

  function renderSharedPage(link, content) {
    const app = getApp();
    if (!app) return;
    app.innerHTML = "";

    if (!state.userId) {
      app.appendChild(renderUnauthBanner(
        "You're viewing a shared set. Sign in to add it to your library — or study it right here.",
        "/carded/login"
      ));
    }

    const profile = link.user_profiles || {};
    const ownerName = profile.display_name || "Unknown";

    if (link.item_type === "set") {
      const { set, cards } = content;
      const section = document.createElement("section");
      section.className = "stack";
      section.innerHTML = `
        <div class="view-header">
          <div class="stack">
            <p class="eyebrow">Shared set · by
              <a href="${esc(window.BASE_PATH || "/carded")}/community/?user=${esc(link.user_id)}" class="link">${esc(ownerName)}</a>
            </p>
            <h1>${esc(set.name)}</h1>
            <p class="meta-copy">${cards.length} card${cards.length === 1 ? "" : "s"}</p>
          </div>
          <div class="control-row" id="shared-actions" style="flex-wrap:wrap;gap:8px"></div>
        </div>
        <div id="shared-card-list" class="stack"></div>
      `;
      app.appendChild(section);

      const cardList = section.querySelector("#shared-card-list");
      cards.forEach(function (card, i) {
        const row = document.createElement("article");
        row.className = "card-row";
        row.innerHTML = `
          <div class="card-row__header">
            <span class="meta-label">Card ${i + 1}</span>
          </div>
          <div class="card-row__body">
            <div class="card-content"><span class="meta-label">Term</span><div class="card-content__value">${esc(card.term)}</div></div>
            <div class="card-content"><span class="meta-label">Definition</span><div class="card-content__value">${esc(card.definition)}</div></div>
          </div>
        `;
        cardList.appendChild(row);
      });

      // Actions
      const actionsEl = section.querySelector("#shared-actions");
      if (state.userId && !state.localMode) {
        renderAddDuplicateButtons(actionsEl, { item_type: "set", item_id: set.id, id: null, title: set.name }, content);
      }
    } else {
      const { folder, sets, cards } = content;
      const section = document.createElement("section");
      section.className = "stack";
      section.innerHTML = `
        <div class="view-header">
          <div class="stack">
            <p class="eyebrow">Shared folder · by
              <a href="${esc(window.BASE_PATH || "/carded")}/community/?user=${esc(link.user_id)}" class="link">${esc(ownerName)}</a>
            </p>
            <h1>${esc(folder.name)}</h1>
            <p class="meta-copy">${sets.length} set${sets.length === 1 ? "" : "s"} · ${cards.length} card${cards.length === 1 ? "" : "s"}</p>
          </div>
          <div class="control-row" id="shared-actions" style="flex-wrap:wrap;gap:8px"></div>
        </div>
        <div id="shared-set-list" class="tile-grid" style="margin-top:16px"></div>
      `;
      app.appendChild(section);

      const setList = section.querySelector("#shared-set-list");
      sets.forEach(function (s) {
        const setCards = cards.filter(function (c) { return c.set_id === s.id; });
        const tile = document.createElement("article");
        tile.className = "tile set";
        tile.innerHTML = `
          <div class="tile__header"><div class="stack">
            <strong class="tile__name">${esc(s.name)}</strong>
            <span class="meta-copy">${setCards.length} card${setCards.length === 1 ? "" : "s"}</span>
          </div></div>
        `;
        setList.appendChild(tile);
      });

      const actionsEl = section.querySelector("#shared-actions");
      if (state.userId && !state.localMode) {
        renderAddDuplicateButtons(actionsEl, { item_type: "folder", item_id: folder.id, id: null, title: folder.name }, content);
      }
    }
  }

  // ── Publish tile ───────────────────────────────────────────────────────────────
  function renderPublishTile(item) {
    const isOwner = state.userId && item.user_id === state.userId;
    const myAdd = state.myAdds.get(item.id);
    const isAdded = !!myAdd;
    const profile = item.user_profiles || {};
    const authorName = profile.display_name || "Anonymous";
    const basePath = window.BASE_PATH || "/carded";

    const tile = document.createElement("article");
    tile.className = `tile${item.item_type === "folder" ? " folder" : " set"}`;
    tile.dataset.publishId = item.id;

    const metaLine = item.item_type === "set"
      ? `${item.card_count || 0} card${(item.card_count || 0) === 1 ? "" : "s"}`
      : `${item.set_count || 0} set${(item.set_count || 0) === 1 ? "" : "s"}`;

    tile.innerHTML = `
      <div class="tile__header">
        <div class="stack">
          <strong class="tile__name">${esc(item.title)}</strong>
          <span class="meta-copy">
            ${metaLine} · by
            <a href="${esc(basePath)}/community/?user=${esc(item.user_id)}" class="link community-author-link">${esc(authorName)}</a>
          </span>
        </div>
        ${item.category ? `<span class="community-tag">${esc(item.category)}</span>` : ""}
      </div>
      ${item.description ? `<p class="community-description">${esc(item.description)}</p>` : ""}
      <div class="tile__meta">
        <div class="meta-item"><span class="meta-label">Published</span><span>${formatDate(item.created_at)}</span></div>
        <div class="meta-item"><span class="meta-label">Added by</span><span>${item.add_count || 0}</span></div>
      </div>
      <div class="tile__footer">
        <div class="tile__actions community-tile-actions" id="tile-actions-${esc(item.id)}">
        </div>
      </div>
    `;

    // Build action buttons
    const actionsEl = tile.querySelector(`#tile-actions-${item.id}`);
    if (actionsEl) {
      if (isOwner) {
        const unpubBtn = document.createElement("button");
        unpubBtn.className = "icon-button";
        unpubBtn.setAttribute("aria-label", "Unpublish");
        unpubBtn.textContent = "Unpublish";
        unpubBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          confirmUnpublish(item);
        });
        actionsEl.appendChild(unpubBtn);
      } else if (state.userId && !state.localMode) {
        renderAddDuplicateButtons(actionsEl, item, null, myAdd);
      }
    }

    // Clicking tile itself (non-button area) goes to profile
    tile.addEventListener("click", function (e) {
      if (e.target.closest("button") || e.target.closest("a")) return;
      window.location.href = `${basePath}/community/?user=${encodeURIComponent(item.user_id)}`;
    });

    return tile;
  }

  function renderAddDuplicateButtons(container, item, content, existingAdd) {
    container.innerHTML = "";
    if (existingAdd || (state.myAdds && state.myAdds.has(item.id))) {
      const addedBtn = document.createElement("button");
      addedBtn.className = "icon-button";
      addedBtn.textContent = "✓ Added";
      addedBtn.setAttribute("aria-label", "Already in library");
      addedBtn.disabled = true;
      container.appendChild(addedBtn);
    } else {
      const addBtn = document.createElement("button");
      addBtn.className = "ghost-button";
      addBtn.textContent = "Add to Library";
      addBtn.setAttribute("aria-label", `Add ${esc(item.title || "item")} to library`);
      addBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        handleAddToLibrary(item, addBtn);
      });
      container.appendChild(addBtn);
    }

    const dupBtn = document.createElement("button");
    dupBtn.className = "icon-button";
    dupBtn.textContent = "Duplicate";
    dupBtn.setAttribute("aria-label", `Duplicate ${esc(item.title || "item")}`);
    dupBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      handleDuplicate(item, content, dupBtn);
    });
    container.appendChild(dupBtn);
  }

  // ── Add to library ─────────────────────────────────────────────────────────────
  async function handleAddToLibrary(item, btn) {
    if (!state.userId || state.localMode) {
      showToast("Sign in to add items to your library.", "info");
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = "Adding…"; }
    try {
      const add = await window.CardedSupabaseDB.createCommunityAdd(state.userId, item.id);
      state.myAdds.set(item.id, add);
      // Cache add in Dexie for offline reference
      if (window.CardedDB) {
        await window.CardedDB.put("community_adds", {
          id: add.id,
          user_id: state.userId,
          publish_id: item.id,
          is_orphaned: false,
          orphan_notified: false,
        }).catch(function () {});
      }
      // Increment add_count best-effort
      window.CardedSupabaseDB.adjustAddCount(item.id, 1).catch(function () {});

      // Refresh tile button state
      const actionsEl = document.getElementById(`tile-actions-${item.id}`);
      if (actionsEl) renderAddDuplicateButtons(actionsEl, item, null, add);
      showToast("Added to your library.", "success");
    } catch (err) {
      console.error("Add to library error:", err);
      if (btn) { btn.disabled = false; btn.textContent = "Add to Library"; }
      showToast("Could not add item. Try again.", "error");
    }
  }

  // ── Duplicate ──────────────────────────────────────────────────────────────────
  async function handleDuplicate(item, cachedContent, btn) {
    if (!state.userId) {
      showToast("Sign in to duplicate items.", "info");
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = "Duplicating…"; }
    try {
      const content = cachedContent || await window.CardedSupabaseDB.getCommunityPublishContent(item);
      if (!content) throw new Error("Could not fetch content");

      const now = new Date().toISOString();
      const uid = state.userId === "local-user" ? "local-user" : state.userId;

      if (item.item_type === "set") {
        await duplicateSet(content.set, content.cards, uid, now, null);
      } else {
        await duplicateFolder(content.folder, content.sets, content.cards, uid, now);
      }

      showToast("Duplicated to your library.", "success");
    } catch (err) {
      console.error("Duplicate error:", err);
      showToast("Could not duplicate. Try again.", "error");
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Duplicate"; }
    }
  }

  async function duplicateSet(origSet, cards, uid, now, folderId) {
    const newSetId = crypto.randomUUID();
    const newSet = {
      id: newSetId,
      user_id: uid,
      folder_id: folderId || null,
      name: origSet.name + " (copy)",
      order: Date.now(),
      created_at: now,
      updated_at: now,
    };
    await window.CardedDB.put("sets", newSet);
    const newCards = cards.map(function (card, i) {
      return {
        id: crypto.randomUUID(),
        user_id: uid,
        set_id: newSetId,
        term: card.term,
        definition: card.definition,
        order: i,
        created_at: now,
        updated_at: now,
      };
    });
    await window.CardedDB.bulkPut("cards", newCards);
    if (uid !== "local-user" && navigator.onLine && window.CardedSync) {
      window.CardedSync.syncMutation("sets", "insert", newSet).catch(function () {});
      newCards.forEach(function (c) {
        window.CardedSync.syncMutation("cards", "insert", c).catch(function () {});
      });
    }
    return newSetId;
  }

  async function duplicateFolder(origFolder, sets, cards, uid, now) {
    const newFolderId = crypto.randomUUID();
    const newFolder = {
      id: newFolderId,
      user_id: uid,
      name: origFolder.name + " (copy)",
      order: Date.now(),
      created_at: now,
      updated_at: now,
    };
    await window.CardedDB.put("folders", newFolder);
    if (uid !== "local-user" && navigator.onLine && window.CardedSync) {
      window.CardedSync.syncMutation("folders", "insert", newFolder).catch(function () {});
    }
    for (const set of sets) {
      const setCards = cards.filter(function (c) { return c.set_id === set.id; });
      await duplicateSet(set, setCards, uid, now, newFolderId);
    }
  }

  // ── Confirm unpublish ──────────────────────────────────────────────────────────
  function confirmUnpublish(item) {
    if (window.CardedComponents) {
      window.CardedComponents.showModal({
        title: "Unpublish from Community?",
        copy: `This will remove "${item.title}" from the community. Users who added it will be offered a local copy.`,
        confirmLabel: "Unpublish",
        cancelLabel: "Cancel",
        danger: true,
        onConfirm: function () { doUnpublish(item); },
      });
    } else if (confirm(`Unpublish "${item.title}"?`)) {
      doUnpublish(item);
    }
  }

  async function doUnpublish(item) {
    try {
      await window.CardedSupabaseDB.deletePublish(item.id);
      state.myPublishes = state.myPublishes.filter(function (p) { return p.id !== item.id; });
      // Remove tile from grid
      const tile = document.querySelector(`[data-publish-id="${item.id}"]`);
      if (tile) tile.remove();
      showToast("Unpublished.", "success");
    } catch (err) {
      console.error("Unpublish error:", err);
      showToast("Could not unpublish. Try again.", "error");
    }
  }

  // ── Orphan check ───────────────────────────────────────────────────────────────
  async function checkAndShowOrphans() {
    if (!window.CardedSupabaseDB) return;
    try {
      const orphans = await window.CardedSupabaseDB.getOrphanedAdds(state.userId);
      if (!orphans || orphans.length === 0) return;
      // Show one at a time
      showOrphanModal(orphans, 0);
    } catch (_) {}
  }

  function showOrphanModal(orphans, index) {
    if (index >= orphans.length) return;
    const orphan = orphans[index];
    const title = orphan.content_title || "A set or folder";

    if (window.CardedComponents) {
      window.CardedComponents.showModal({
        title: "Community content removed",
        copy: `"${title}" was removed from Community. Would you like to keep a local copy in your library?`,
        confirmLabel: "Keep copy",
        cancelLabel: "Remove",
        onConfirm: async function () {
          await handleKeepOrphan(orphan);
          showOrphanModal(orphans, index + 1);
        },
        onCancel: async function () {
          await handleRemoveOrphan(orphan);
          showOrphanModal(orphans, index + 1);
        },
      });
    }
  }

  async function handleKeepOrphan(orphan) {
    try {
      await window.CardedSupabaseDB.markAddNotified(orphan.id);
      if (window.CardedDB) {
        await window.CardedDB.put("community_adds", {
          ...orphan,
          is_orphaned: true,
          orphan_notified: true,
        }).catch(function () {});
      }
    } catch (_) {}
  }

  async function handleRemoveOrphan(orphan) {
    try {
      await window.CardedSupabaseDB.deleteCommunityAdd(orphan.id);
      if (window.CardedDB) {
        await window.CardedDB.deleteById("community_adds", orphan.id).catch(function () {});
      }
    } catch (_) {}
  }

  // ── Topbar ─────────────────────────────────────────────────────────────────────
  function renderTopbar() {
    const topbar = document.querySelector(".topbar");
    if (!topbar) return;
    const actionsEl = topbar.querySelector("#header-actions");
    if (!actionsEl) return;

    const basePath = window.BASE_PATH || "/carded";
    const themeEff = window.CardedTheme
      ? window.CardedTheme.effectiveTheme(window.CardedTheme.getStoredTheme())
      : "dark";

    let accountHtml = "";
    if (state.userId && !state.localMode) {
      const initial = ((window.CardedUtils && window.CardedUtils.safeGet("carded_display_name")) || state.userEmail || "U")
        .charAt(0).toUpperCase();
      accountHtml = `<a class="account-link" href="${esc(basePath)}/account/" aria-label="Open account"><span class="account-link__avatar" aria-hidden="true">${esc(initial)}</span></a>`;
    } else if (!state.userId) {
      accountHtml = `<a class="ghost-button" href="${esc(basePath)}/login">Sign in</a>`;
    } else {
      // local mode
      accountHtml = `<a class="account-link" href="${esc(basePath)}/account/" aria-label="Settings (local mode)"><span class="account-link__avatar local-mode-avatar" aria-hidden="true">L</span></a>`;
    }

    actionsEl.innerHTML = `
      <button class="icon-button" data-theme-toggle aria-label="${themeEff === "dark" ? "Switch to light theme" : "Switch to dark theme"}">
        <span class="theme-icon-moon" aria-hidden="true" ${themeEff !== "dark" ? 'style="display:none"' : ""}>🌙</span>
        <span class="theme-icon-sun" aria-hidden="true" ${themeEff === "dark" ? 'style="display:none"' : ""}>☀️</span>
      </button>
      ${accountHtml}
    `;

    const toggleBtn = actionsEl.querySelector("[data-theme-toggle]");
    if (toggleBtn && window.CardedTheme) {
      toggleBtn.addEventListener("click", function () {
        window.CardedTheme.cycleTheme();
        renderTopbar();
      });
    }
  }

  // ── Unauth banner ──────────────────────────────────────────────────────────────
  function renderUnauthBanner(msg, loginHref) {
    const banner = document.createElement("div");
    banner.className = "banner community-unauth-banner";
    banner.setAttribute("role", "status");
    banner.innerHTML = `
      <p>${esc(msg)}</p>
      <div class="control-row">
        <a class="button" href="${esc(loginHref)}">Sign in</a>
        <a class="ghost-button" href="${esc((window.BASE_PATH || "/carded") + "/signup")}">Create account</a>
      </div>
    `;
    return banner;
  }

  // ── Publish flow (called from app.js via window.CardedCommunity.showPublishModal) ──
  function showPublishModal(options) {
    // options: { item_type, item_id, title, cardCount, setCount, userId, onSuccess }
    if (window.CardedComponents) {
      window.CardedComponents.showModal({
        title: `Publish to Community`,
        copy: `Publishing "${options.title}" will make it visible to all Carded users. You can unpublish at any time.`,
        input: {
          label: "Title",
          value: options.title || "",
          placeholder: "Set title visible in Community",
          maxLength: 80,
        },
        confirmLabel: "Publish",
        cancelLabel: "Cancel",
        onConfirm: async function (titleValue) {
          await doPublish({ ...options, title: titleValue || options.title });
          if (typeof options.onSuccess === "function") options.onSuccess();
        },
      });
    }
  }

  async function doPublish(options) {
    try {
      const publish = await window.CardedSupabaseDB.createPublish(options.userId, {
        item_type: options.item_type,
        item_id: options.item_id,
        title: options.title,
        card_count: options.cardCount || 0,
        set_count: options.setCount || 0,
      });
      // Sync user's display_name to profile so community page shows correct author
      const displayName = window.CardedUtils && window.CardedUtils.safeGet("carded_display_name");
      if (displayName) {
        window.CardedSupabaseDB.upsertProfile(options.userId, { display_name: displayName }).catch(function () {});
      }
      return publish;
    } catch (err) {
      console.error("Publish error:", err);
      throw err;
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────────
  function debounce(fn, ms) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(this, args); }, ms);
    };
  }

  // ── Public API ─────────────────────────────────────────────────────────────────
  window.CardedCommunity = {
    init,
    showPublishModal,
    doPublish,
    handleAddToLibrary,
    handleDuplicate,
    checkAndShowOrphans,
    duplicateSet,
    duplicateFolder,
  };
})();
