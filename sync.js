(function () {
  "use strict";

  const SYNC_QUEUE_KEY = "carded_sync_queue";
  const SESSION_EMAIL_KEY = "carded_user_email";
  const SESSION_UID_KEY = "carded_user_id";
  const MAX_QUEUE_ENTRIES = 500;
  const QUEUE_WARN_THRESHOLD = 450;
  const RETRY_LIMIT = 5;
  const channels = [];
  let online = navigator.onLine;
  let activeUserId = null;
  let consecutiveFailures = 0;
  let backoffTimer = null;

  function dispatchConnectivity() {
    window.dispatchEvent(new CustomEvent("carded:connectivity", {
      detail: { online },
    }));
  }

  function readQueue() {
    try {
      const raw = window.CardedUtils.safeGet(SYNC_QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (error) {
      console.error(error);
      return [];
    }
  }

  function writeQueue(queue) {
    window.CardedUtils.safeSet(SYNC_QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE_ENTRIES)));
  }

  function addToQueue(entry) {
    const queue = readQueue();
    if (queue.length >= QUEUE_WARN_THRESHOLD) {
      window.dispatchEvent(new CustomEvent("carded:sync-overflow"));
    }
    queue.push(entry);
    writeQueue(queue);
  }

  function clearSessionCache() {
    window.CardedUtils.safeRemove(SESSION_EMAIL_KEY);
    window.CardedUtils.safeRemove(SESSION_UID_KEY);
    window.CardedUtils.safeRemove(SYNC_QUEUE_KEY);
  }

  function cacheSession(userId, email) {
    window.CardedUtils.safeSet(SESSION_UID_KEY, userId || "");
    window.CardedUtils.safeSet(SESSION_EMAIL_KEY, email || "");
  }

  async function pingSupabase() {
    try {
      await window.supabaseClient.auth.getSession();
      return true;
    } catch (error) {
      return false;
    }
  }

  async function refreshOnlineState() {
    online = navigator.onLine && await pingSupabase();
    dispatchConnectivity();
    return online;
  }

  function queueMutation(table, operation, payload) {
    addToQueue({
      id: crypto.randomUUID(),
      table,
      operation,
      payload,
      timestamp: new Date().toISOString(),
      retries: 0,
    });
  }

  function sanitizeRemotePayload(table, payload) {
    if (table === "folders") {
      return {
        id: payload.id,
        user_id: payload.user_id,
        name: payload.name,
        order: payload.order,
        created_at: payload.created_at,
        updated_at: payload.updated_at,
      };
    }

    if (table === "sets") {
      return {
        id: payload.id,
        user_id: payload.user_id,
        folder_id: payload.folder_id,
        name: payload.name,
        order: payload.order,
        created_at: payload.created_at,
        updated_at: payload.updated_at,
      };
    }

    if (table === "cards") {
      return {
        id: payload.id,
        user_id: payload.user_id,
        set_id: payload.set_id,
        term: payload.term,
        definition: payload.definition,
        order: payload.order,
        created_at: payload.created_at,
        updated_at: payload.updated_at,
      };
    }

    if (table === "user_card_progress") {
      return {
        id: payload.id,
        user_id: payload.user_id,
        card_id: payload.card_id,
        ease_factor: payload.ease_factor,
        interval: payload.interval,
        repetitions: payload.repetitions,
        next_review: payload.next_review,
        correct_count: payload.correct_count,
        incorrect_count: payload.incorrect_count,
        last_seen: payload.last_seen,
        updated_at: payload.updated_at,
      };
    }

    if (table === "user_stats") {
      return {
        id: payload.id,
        user_id: payload.user_id,
        total_study_time: payload.total_study_time,
        total_cards_reviewed: payload.total_cards_reviewed,
        total_sessions: payload.total_sessions,
        current_streak: payload.current_streak,
        longest_streak: payload.longest_streak,
        last_studied_date: payload.last_studied_date,
        updated_at: payload.updated_at,
      };
    }

    return payload;
  }

  async function mutateRemote(table, operation, payload) {
    const api = window.CardedSupabaseDB;
    const cleanPayload = sanitizeRemotePayload(table, payload);

    if (table === "folders" && operation === "insert") return api.createFolder(activeUserId, cleanPayload);
    if (table === "folders" && operation === "update") return api.updateFolder(cleanPayload.id, cleanPayload);
    if (table === "folders" && operation === "delete") return api.deleteFolder(cleanPayload.id);

    if (table === "sets" && operation === "insert") return api.createSet(activeUserId, cleanPayload);
    if (table === "sets" && operation === "update") return api.updateSet(cleanPayload.id, cleanPayload);
    if (table === "sets" && operation === "delete") return api.deleteSet(cleanPayload.id);

    if (table === "cards" && operation === "insert") return api.createCard(activeUserId, cleanPayload);
    if (table === "cards" && operation === "update") return api.updateCard(cleanPayload.id, cleanPayload);
    if (table === "cards" && operation === "delete") return api.deleteCard(cleanPayload.id);

    if (table === "user_card_progress") {
      return api.upsertProgress(activeUserId, cleanPayload.card_id, cleanPayload);
    }

    if (table === "user_stats") {
      return api.updateStats(activeUserId, cleanPayload);
    }

    if (table === "study_sessions" && operation === "insert") {
      return api.createStudySession(activeUserId, cleanPayload);
    }

    return null;
  }

  async function syncMutation(table, operation, payload) {
    if (!await refreshOnlineState()) {
      queueMutation(table, operation, payload);
      return { queued: true };
    }

    try {
      await mutateRemote(table, operation, payload);
      return { queued: false };
    } catch (error) {
      console.error(error);
      queueMutation(table, operation, payload);
      return { queued: true, error };
    }
  }

  function backoffDelay(attempt) {
    // 1s, 2s, 4s, 8s, 16s, max 60s
    return Math.min(1000 * Math.pow(2, attempt), 60000);
  }

  async function flushQueue() {
    if (!activeUserId || !await refreshOnlineState()) return;
    if (backoffTimer) return; // already scheduled

    const queue = readQueue();
    const remaining = [];

    for (const entry of queue) {
      try {
        await mutateRemote(entry.table, entry.operation, entry.payload);
        consecutiveFailures = 0;
      } catch (error) {
        // 401: try to refresh token first
        if (error && (error.status === 401 || error.code === "PGRST301")) {
          try {
            await window.supabaseClient.auth.refreshSession();
            await mutateRemote(entry.table, entry.operation, entry.payload);
            consecutiveFailures = 0;
            continue;
          } catch (refreshError) {
            console.error("Session refresh failed:", refreshError);
            window.dispatchEvent(new CustomEvent("carded:session-expired"));
            writeQueue([entry, ...remaining].concat(queue.slice(queue.indexOf(entry) + 1)));
            return;
          }
        }

        // 4xx (bad data) — skip, don't retry
        if (error && error.status >= 400 && error.status < 500 && error.status !== 401 && error.status !== 429) {
          console.error("Sync: skipping unrecoverable item", entry.table, error.status);
          continue;
        }

        // Network errors, 5xx, 429 — retry with backoff
        consecutiveFailures += 1;
        const retries = (entry.retries || 0) + 1;
        if (retries < RETRY_LIMIT) {
          remaining.push({ ...entry, retries });
        } else {
          console.error("Sync: dropping item after max retries", entry.table);
        }

        if (consecutiveFailures >= 5) {
          window.dispatchEvent(new CustomEvent("carded:sync-paused"));
          writeQueue(remaining.concat(queue.slice(queue.indexOf(entry) + 1)));
          const delay = backoffDelay(consecutiveFailures);
          backoffTimer = setTimeout(function () {
            backoffTimer = null;
            consecutiveFailures = 0;
            flushQueue();
          }, delay);
          return;
        }
      }
    }

    writeQueue(remaining);
    if (remaining.length === 0) {
      consecutiveFailures = 0;
      await refetchLatest();
    }
  }

  async function refetchLatest() {
    if (!activeUserId) return null;
    const bundle = await window.CardedSupabaseDB.fetchAllUserData(activeUserId);
    await window.CardedDB.replaceAllData(bundle);
    window.dispatchEvent(new CustomEvent("carded:data-changed"));
    return bundle;
  }

  function mergeRemoteTimestamp(localRecord, remoteRecord) {
    const localTime = localRecord && localRecord.updated_at ? Date.parse(localRecord.updated_at) : 0;
    const remoteTime = remoteRecord && remoteRecord.updated_at ? Date.parse(remoteRecord.updated_at) : 0;
    return remoteTime >= localTime;
  }

  async function applyRealtimeChange(table, payload) {
    const record = payload.eventType === "DELETE" ? payload.old : payload.new;
    if (!record) return;

    if (payload.eventType === "DELETE") {
      await window.CardedDB.deleteById(table, record.id);
    } else {
      const existing = await window.CardedDB.getById(table, record.id);
      if (!mergeRemoteTimestamp(existing, record)) return;
      await window.CardedDB.put(table, {
        ...existing,
        ...record,
      });
    }

    window.dispatchEvent(new CustomEvent("carded:data-changed"));
  }

  function subscribeTable(table, filter) {
    const channel = window.supabaseClient
      .channel(`carded-${table}-${activeUserId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table,
        ...(filter ? { filter } : {}),
      }, function (payload) {
        applyRealtimeChange(table, payload);
      })
      .subscribe(function (status) {
        if (status === "SUBSCRIBED") {
          console.debug(`Realtime subscribed: ${table}`);
        }
      });

    channels.push(channel);
  }

  async function unsubscribeAllRealtime() {
    while (channels.length) {
      const channel = channels.pop();
      await channel.unsubscribe();
    }
  }

  async function initSync(userId, email) {
    activeUserId = userId;
    cacheSession(userId, email);
    await refreshOnlineState();

    if (online) {
      await refetchLatest();
      await unsubscribeAllRealtime();
      subscribeTable("folders", `user_id=eq.${activeUserId}`);
      subscribeTable("sets", `user_id=eq.${activeUserId}`);
      subscribeTable("cards", `user_id=eq.${activeUserId}`);
    }

    return window.CardedDB.getAllUserData(userId);
  }

  window.addEventListener("online", function () {
    online = true;
    // Reset backoff when connection returns
    if (backoffTimer) {
      clearTimeout(backoffTimer);
      backoffTimer = null;
    }
    consecutiveFailures = 0;
    dispatchConnectivity();
    flushQueue();
  });

  window.addEventListener("offline", function () {
    online = false;
    dispatchConnectivity();
  });

  window.addEventListener("beforeunload", function () {
    unsubscribeAllRealtime();
  });

  window.CardedSync = {
    cacheSession,
    clearSessionCache,
    flushQueue,
    initSync,
    isOnline: function () {
      return online;
    },
    queueMutation,
    refetchLatest,
    refreshOnlineState,
    syncMutation,
    unsubscribeAllRealtime,
  };
})();
