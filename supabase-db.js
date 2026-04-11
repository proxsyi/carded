(function () {
  "use strict";

  function requireSupabase() {
    if (!window.supabaseClient) {
      throw new Error("Supabase client is not initialized.");
    }
    return window.supabaseClient;
  }

  function wait(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }

  function isRateLimitError(error) {
    return error && (error.status === 429 || String(error.message || "").toLowerCase().includes("rate"));
  }

  function isAuthError(error) {
    return error && (error.status === 401 || error.code === "PGRST301");
  }

  function isForbiddenError(error) {
    return error && error.status === 403;
  }

  function isRetryableError(error) {
    return isRateLimitError(error) || !error || !error.status;
  }

  async function unwrap(queryFactory) {
    let attempt = 0;

    while (attempt < 2) {
      const { data, error } = await queryFactory();
      if (!error) return data;

      if (isAuthError(error)) {
        if (window.CardedUtils && typeof window.CardedUtils.showToast === "function") {
          window.CardedUtils.showToast("Session expired. Please sign in again.");
        }
        window.location.replace(window.location.origin + window.BASE_PATH + "/signin");
        throw error;
      }

      if (isForbiddenError(error)) {
        console.error(error);
        if (window.CardedUtils && typeof window.CardedUtils.showToast === "function") {
          window.CardedUtils.showToast("Something went wrong. Please try again.");
        }
        throw error;
      }

      if (!isRetryableError(error) || attempt === 1) {
        throw error;
      }

      await wait(isRateLimitError(error) ? 5000 : 1000);
      attempt += 1;
    }
  }

  function foldersTable() {
    return requireSupabase().from("folders");
  }

  function setsTable() {
    return requireSupabase().from("sets");
  }

  function cardsTable() {
    return requireSupabase().from("cards");
  }

  function progressTable() {
    return requireSupabase().from("user_card_progress");
  }

  function statsTable() {
    return requireSupabase().from("user_stats");
  }

  function profilesTable() {
    return requireSupabase().from("user_profiles");
  }

  async function getFolders(userId) {
    return unwrap(
      () => foldersTable()
        .select("*")
        .eq("user_id", userId)
        .order("order", { ascending: true })
    );
  }

  async function createFolder(userId, payload) {
    return unwrap(
      () => foldersTable()
        .insert({
          id: payload.id,
          user_id: userId,
          name: payload.name,
          order: payload.order,
          created_at: payload.created_at,
          updated_at: payload.updated_at,
        })
        .select()
        .single()
    );
  }

  async function updateFolder(folderId, payload) {
    return unwrap(
      () => foldersTable()
        .update(payload)
        .eq("id", folderId)
        .select()
        .single()
    );
  }

  async function deleteFolder(folderId) {
    return unwrap(
      () => foldersTable()
        .delete()
        .eq("id", folderId)
        .select()
        .single()
    );
  }

  async function getSets(userId) {
    return unwrap(
      () => setsTable()
        .select("*")
        .eq("user_id", userId)
        .order("order", { ascending: true })
    );
  }

  async function getSetsByFolder(userId, folderId) {
    return unwrap(
      () => setsTable()
        .select("*")
        .eq("user_id", userId)
        .eq("folder_id", folderId)
        .order("order", { ascending: true })
    );
  }

  async function createSet(userId, payload) {
    return unwrap(
      () => setsTable()
        .insert({
          id: payload.id,
          user_id: userId,
          folder_id: payload.folder_id ?? null,
          name: payload.name,
          order: payload.order,
          created_at: payload.created_at,
          updated_at: payload.updated_at,
        })
        .select()
        .single()
    );
  }

  async function updateSet(setId, payload) {
    return unwrap(
      () => setsTable()
        .update(payload)
        .eq("id", setId)
        .select()
        .single()
    );
  }

  async function deleteSet(setId) {
    return unwrap(
      () => setsTable()
        .delete()
        .eq("id", setId)
        .select()
        .single()
    );
  }

  async function getCards(userId, setId) {
    return unwrap(
      () => cardsTable()
        .select("*")
        .eq("user_id", userId)
        .eq("set_id", setId)
        .order("order", { ascending: true })
    );
  }

  async function createCard(userId, payload) {
    return unwrap(
      () => cardsTable()
        .insert({
          id: payload.id,
          user_id: userId,
          set_id: payload.set_id,
          term: payload.term,
          definition: payload.definition,
          order: payload.order,
          created_at: payload.created_at,
          updated_at: payload.updated_at,
        })
        .select()
        .single()
    );
  }

  async function updateCard(cardId, payload) {
    return unwrap(
      () => cardsTable()
        .update(payload)
        .eq("id", cardId)
        .select()
        .single()
    );
  }

  async function deleteCard(cardId) {
    return unwrap(
      () => cardsTable()
        .delete()
        .eq("id", cardId)
        .select()
        .single()
    );
  }

  async function getProgress(userId) {
    return unwrap(
      () => progressTable()
        .select("*")
        .eq("user_id", userId)
    );
  }

  async function upsertProgress(userId, cardId, data) {
    return unwrap(
      () => progressTable()
        .upsert(
          {
            user_id: userId,
            card_id: cardId,
            ...data,
          },
          { onConflict: "user_id,card_id" }
        )
        .select()
        .single()
    );
  }

  async function getOrCreateStats(userId) {
    return unwrap(
      () => statsTable()
        .upsert({ user_id: userId }, { onConflict: "user_id" })
        .select()
        .single()
    );
  }

  async function updateStats(userId, updates) {
    return unwrap(
      () => statsTable()
        .update(updates)
        .eq("user_id", userId)
        .select()
        .single()
    );
  }

  async function getProfile(userId) {
    const { data, error } = await profilesTable()
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function upsertProfile(userId, updates) {
    return unwrap(
      () => profilesTable()
        .upsert({ id: userId, ...updates }, { onConflict: "id" })
        .select()
        .single()
    );
  }

  async function setPendingDeletion(userId, graceDays) {
    const days = graceDays || 30;
    const deletionDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await requireSupabase().from("user_profiles")
      .upsert({ id: userId, pending_deletion: true, deletion_date: deletionDate }, { onConflict: "id" });
    if (error) throw error;
  }

  async function cancelDeletion(userId) {
    return unwrap(
      () => requireSupabase().from("user_profiles")
        .update({ pending_deletion: false, deletion_date: null })
        .eq("id", userId)
    );
  }

  async function checkPendingDeletion(userId) {
    const { data, error } = await requireSupabase().from("user_profiles")
      .select("pending_deletion, deletion_date")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) return null;
    return data.pending_deletion ? data : null;
  }

  async function fetchStudySessions(userId) {
    return unwrap(
      () => requireSupabase().from("study_sessions")
        .select("*")
        .eq("user_id", userId)
    );
  }

  async function createStudySession(userId, data) {
    return unwrap(
      () => requireSupabase().from("study_sessions").insert({
        id: data.id,
        user_id: userId,
        set_id: data.set_id,
        mode: data.mode,
        total_cards: data.total_cards,
        correct_count: data.correct_count,
        wrong_count: data.wrong_count,
        started_at: data.started_at,
        completed_at: data.completed_at,
      })
    );
  }

  async function fetchAllUserData(userId) {
    const [folders, sets, progress, stats] = await Promise.all([
      getFolders(userId),
      getSets(userId),
      getProgress(userId),
      getOrCreateStats(userId),
    ]);

    const cardsBySet = await Promise.all(sets.map(function (set) {
      return getCards(userId, set.id);
    }));

    return {
      folders,
      sets,
      cards: cardsBySet.flat(),
      progress,
      stats,
    };
  }

  // ── Community ─────────────────────────────────────────────────────────────────

  function communityTable() {
    return requireSupabase().from("community_publishes");
  }

  function communityAddsTable() {
    return requireSupabase().from("community_adds");
  }

  function sharedLinksTable() {
    return requireSupabase().from("shared_links");
  }

  const COMMUNITY_PAGE_SIZE = 20;

  async function getCommunityPublishes({ search = "", filter = "all", sort = "newest", page = 0 } = {}) {
    let query = communityTable()
      .select("*, user_profiles(display_name, avatar_url)")
      .range(page * COMMUNITY_PAGE_SIZE, (page + 1) * COMMUNITY_PAGE_SIZE - 1);

    if (filter === "set") query = query.eq("item_type", "set");
    else if (filter === "folder") query = query.eq("item_type", "folder");

    if (search) query = query.ilike("title", `%${search}%`);

    if (sort === "most-added") query = query.order("add_count", { ascending: false });
    else if (sort === "alphabetical") query = query.order("title", { ascending: true });
    else query = query.order("created_at", { ascending: false });

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async function getCommunityPublish(publishId) {
    const { data, error } = await communityTable()
      .select("*, user_profiles(display_name, avatar_url)")
      .eq("id", publishId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function getUserPublishes(userId) {
    const { data, error } = await communityTable()
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function createPublish(userId, payload) {
    return unwrap(
      () => communityTable()
        .insert({
          user_id: userId,
          item_type: payload.item_type,
          item_id: payload.item_id,
          title: payload.title,
          description: payload.description || null,
          category: payload.category || null,
          card_count: payload.card_count || 0,
          set_count: payload.set_count || 0,
          add_count: 0,
        })
        .select()
        .single()
    );
  }

  async function updatePublish(publishId, payload) {
    return unwrap(
      () => communityTable()
        .update(payload)
        .eq("id", publishId)
        .select()
        .single()
    );
  }

  async function deletePublish(publishId) {
    return unwrap(
      () => communityTable()
        .delete()
        .eq("id", publishId)
    );
  }

  // Fetch content (sets + cards, or folder + sets) for a community publish
  async function getCommunityPublishContent(publish) {
    const sb = requireSupabase();
    if (publish.item_type === "set") {
      const { data: set } = await sb.from("sets").select("*").eq("id", publish.item_id).maybeSingle();
      if (!set) return null;
      const { data: cards } = await sb.from("cards").select("*").eq("set_id", publish.item_id).order("order");
      return { set, cards: cards || [] };
    }
    if (publish.item_type === "folder") {
      const { data: folder } = await sb.from("folders").select("*").eq("id", publish.item_id).maybeSingle();
      if (!folder) return null;
      const { data: sets } = await sb.from("sets").select("*").eq("folder_id", publish.item_id).order("order");
      const setIds = (sets || []).map(function (s) { return s.id; });
      let cards = [];
      if (setIds.length) {
        const { data: allCards } = await sb.from("cards").select("*").in("set_id", setIds).order("order");
        cards = allCards || [];
      }
      return { folder, sets: sets || [], cards };
    }
    return null;
  }

  async function createCommunityAdd(userId, publishId) {
    return unwrap(
      () => communityAddsTable()
        .insert({ user_id: userId, publish_id: publishId, is_orphaned: false, orphan_notified: false })
        .select()
        .single()
    );
  }

  async function deleteCommunityAdd(addsId) {
    return unwrap(
      () => communityAddsTable()
        .delete()
        .eq("id", addsId)
    );
  }

  async function getUserCommunityAdds(userId) {
    const { data, error } = await communityAddsTable()
      .select("*, community_publishes(id, title, item_type, item_id, user_id)")
      .eq("user_id", userId);
    if (error) throw error;
    return data || [];
  }

  async function getOrphanedAdds(userId) {
    const { data, error } = await communityAddsTable()
      .select("*")
      .eq("user_id", userId)
      .eq("is_orphaned", true)
      .eq("orphan_notified", false);
    if (error) throw error;
    return data || [];
  }

  async function markAddNotified(addsId) {
    return unwrap(
      () => communityAddsTable()
        .update({ orphan_notified: true })
        .eq("id", addsId)
    );
  }

  // Increment/decrement add_count on community_publishes
  async function adjustAddCount(publishId, delta) {
    try {
      const sb = requireSupabase();
      // Read current count then update (best-effort; small race window is acceptable)
      const { data } = await sb.from("community_publishes")
        .select("add_count")
        .eq("id", publishId)
        .maybeSingle();
      if (!data) return;
      const newCount = Math.max(0, (data.add_count || 0) + delta);
      await sb.from("community_publishes").update({ add_count: newCount }).eq("id", publishId);
    } catch (_) {}
  }

  // Shared links
  async function createSharedLink(userId, payload) {
    return unwrap(
      () => sharedLinksTable()
        .insert({ user_id: userId, item_type: payload.item_type, item_id: payload.item_id })
        .select()
        .single()
    );
  }

  async function deleteSharedLink(linkId) {
    return unwrap(
      () => sharedLinksTable()
        .delete()
        .eq("id", linkId)
    );
  }

  async function getUserSharedLinks(userId) {
    const { data, error } = await sharedLinksTable()
      .select("*")
      .eq("user_id", userId);
    if (error) throw error;
    return data || [];
  }

  async function getSharedLink(shareId) {
    const { data, error } = await sharedLinksTable()
      .select("*, user_profiles(display_name, avatar_url)")
      .eq("id", shareId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  // Public user profile (display_name, bio, avatar_url)
  async function getPublicProfile(userId) {
    const { data, error } = await profilesTable()
      .select("id, display_name, bio, avatar_url")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  window.CardedSupabaseDB = {
    adjustAddCount,
    cancelDeletion,
    checkPendingDeletion,
    createCard,
    createCommunityAdd,
    createFolder,
    createPublish,
    createSet,
    createSharedLink,
    createStudySession,
    deleteCommunityAdd,
    deletePendingDeletion: cancelDeletion,
    deleteCard,
    deleteFolder,
    deletePublish,
    deleteSet,
    deleteSharedLink,
    fetchAllUserData,
    fetchStudySessions,
    getCards,
    getCommunityPublish,
    getCommunityPublishContent,
    getCommunityPublishes,
    getFolders,
    getOrCreateStats,
    getOrphanedAdds,
    getProfile,
    getProgress,
    getPublicProfile,
    getSets,
    getSetsByFolder,
    getSharedLink,
    getUserCommunityAdds,
    getUserPublishes,
    getUserSharedLinks,
    markAddNotified,
    setPendingDeletion,
    updateCard,
    updateFolder,
    updatePublish,
    updateSet,
    updateStats,
    upsertProfile,
    upsertProgress,
  };
})();
