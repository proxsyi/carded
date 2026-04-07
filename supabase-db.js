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

  window.CardedSupabaseDB = {
    cancelDeletion,
    checkPendingDeletion,
    createCard,
    createFolder,
    createSet,
    createStudySession,
    fetchStudySessions,
    setPendingDeletion,
    deleteCard,
    deleteFolder,
    deleteSet,
    fetchAllUserData,
    getCards,
    getFolders,
    getOrCreateStats,
    getProfile,
    getProgress,
    getSets,
    getSetsByFolder,
    updateCard,
    updateFolder,
    updateSet,
    updateStats,
    upsertProfile,
    upsertProgress,
  };
})();
