(function () {
  "use strict";

  if (!window.Dexie) {
    throw new Error("Dexie failed to load.");
  }

  const db = new window.Dexie("CardedDB");

  db.version(1).stores({
    folders: "id, user_id, order, updated_at",
    sets: "id, user_id, folder_id, order, updated_at",
    cards: "id, user_id, set_id, order, updated_at",
    user_card_progress: "id, user_id, card_id, updated_at, [user_id+card_id]",
    user_stats: "id, user_id",
  });

  async function clearAllTables() {
    await db.transaction("rw", db.tables, async function () {
      await Promise.all(db.tables.map(function (table) {
        return table.clear();
      }));
    });
  }

  async function replaceAllData(bundle) {
    const existingSets = await db.sets.toArray();

    const setExtras = new Map(existingSets.map(function (row) {
      return [row.id, {
        best_score: row.best_score ?? null,
        times_studied: row.times_studied ?? 0,
        last_studied: row.last_studied ?? null,
      }];
    }));

    await db.transaction("rw", db.tables, async function () {
      await Promise.all(db.tables.map(function (table) {
        return table.clear();
      }));

      await db.folders.bulkPut(bundle.folders || []);
      await db.sets.bulkPut((bundle.sets || []).map(function (row) {
        return {
          ...row,
          ...(setExtras.get(row.id) || {}),
        };
      }));
      await db.cards.bulkPut(bundle.cards || []);
      await db.user_card_progress.bulkPut(bundle.progress || []);
      if (bundle.stats) {
        await db.user_stats.put(bundle.stats);
      }
    });
  }

  async function getAllUserData(userId) {
    const [folders, sets, cards, progress, stats] = await Promise.all([
      db.folders.where("user_id").equals(userId).sortBy("order"),
      db.sets.where("user_id").equals(userId).sortBy("order"),
      db.cards.where("user_id").equals(userId).sortBy("order"),
      db.user_card_progress.where("user_id").equals(userId).toArray(),
      db.user_stats.where("user_id").equals(userId).first(),
    ]);

    return {
      folders,
      sets,
      cards,
      progress,
      stats: stats || null,
    };
  }

  async function put(tableName, record) {
    await db.table(tableName).put(record);
    return record;
  }

  async function bulkPut(tableName, records) {
    if (!records.length) return [];
    await db.table(tableName).bulkPut(records);
    return records;
  }

  async function deleteById(tableName, id) {
    await db.table(tableName).delete(id);
  }

  async function deleteWhere(tableName, predicate) {
    const table = db.table(tableName);
    const rows = await table.toArray();
    const ids = rows.filter(predicate).map(function (row) {
      return row.id;
    });
    await Promise.all(ids.map(function (id) {
      return table.delete(id);
    }));
  }

  async function getById(tableName, id) {
    return db.table(tableName).get(id);
  }

  window.CardedDB = {
    bulkPut,
    clearAllTables,
    db,
    deleteById,
    deleteWhere,
    getAllUserData,
    getById,
    put,
    replaceAllData,
  };
})();
