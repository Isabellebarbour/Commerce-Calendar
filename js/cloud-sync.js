const COMCAL_SYNC_KEYS = [
  "comcal-assignments",
  "comcal-grades",
  "comcal-events",
  "comcal-topics",
  "comcal-event-edits",
  "comcal-curriculum",
  "comcal-profile",
  "comcal-profile-banner",
  "comcal-profile-photo",
];

const MAX_CLOUD_VALUE_CHARS = 700000;
let syncPushTimer = null;
let syncingFromCloud = false;
let lastPushError = "";

function cloudDb() {
  return window.ComCalFirebase?.db || null;
}

function cloudUid() {
  return window.ComCalFirebase?.auth?.currentUser?.uid || window.ComCalAuth?.getSession?.()?.userId || null;
}

function storeDoc(uid, key) {
  return cloudDb().collection("users").doc(uid).collection("store").doc(key);
}

function userDoc(uid) {
  return cloudDb().collection("users").doc(uid);
}

function readLocalBundle() {
  const data = {};
  COMCAL_SYNC_KEYS.forEach((key) => {
    const value = localStorage.getItem(key);
    if (value == null) return;
    if (value.length > MAX_CLOUD_VALUE_CHARS) {
      console.warn(`ComCal cloud sync skipped oversized key: ${key}`);
      return;
    }
    data[key] = value;
  });
  return data;
}

function writeLocalBundle(data) {
  syncingFromCloud = true;
  try {
    COMCAL_SYNC_KEYS.forEach((key) => {
      if (data[key] == null || data[key] === "") {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, data[key]);
      }
    });
  } finally {
    syncingFromCloud = false;
  }
}

function clearLocalUserData() {
  syncingFromCloud = true;
  try {
    COMCAL_SYNC_KEYS.forEach((key) => localStorage.removeItem(key));
  } finally {
    syncingFromCloud = false;
  }
}

function localHasUserData() {
  return COMCAL_SYNC_KEYS.some((key) => {
    const value = localStorage.getItem(key);
    if (!value) return false;
    if (key === "comcal-profile") {
      try {
        const profile = JSON.parse(value);
        return Boolean(profile?.name || profile?.email);
      } catch {
        return value.length > 2;
      }
    }
    if (key === "comcal-assignments") {
      try {
        const parsed = JSON.parse(value);
        return (parsed?.courses || []).some((course) => (course.items || []).length);
      } catch {
        return false;
      }
    }
    if (key === "comcal-grades") {
      try {
        const parsed = JSON.parse(value);
        return (parsed?.courses || []).length > 0;
      } catch {
        return false;
      }
    }
    if (key === "comcal-events" || key === "comcal-topics") {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.length > 0 : Object.keys(parsed || {}).length > 0;
      } catch {
        return value.length > 2;
      }
    }
    return value.length > 2;
  });
}

async function cloudHasUserData(uid) {
  const snap = await userDoc(uid).get();
  if (snap.exists && snap.data()?.hasData) return true;
  const store = await userDoc(uid).collection("store").limit(1).get();
  return !store.empty;
}

async function pushAll(uid = cloudUid()) {
  const db = cloudDb();
  if (!db || !uid || syncingFromCloud) return;
  if (!window.ComCalFirebaseConfigured?.()) return;

  const bundle = readLocalBundle();
  const batch = db.batch();
  const metaRef = userDoc(uid);
  batch.set(
    metaRef,
    {
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      hasData: Object.keys(bundle).length > 0,
      email: window.ComCalAuth?.getSession?.()?.email || "",
      name: window.ComCalAuth?.getSession?.()?.name || "",
      graduationDate: window.ComCalAuth?.getSession?.()?.graduationDate || "",
    },
    { merge: true }
  );

  Object.entries(bundle).forEach(([key, value]) => {
    batch.set(
      storeDoc(uid, key),
      {
        value,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  try {
    await batch.commit();
    lastPushError = "";
  } catch (error) {
    lastPushError = error.message || "Cloud sync failed.";
    console.error("ComCal cloud push failed:", error);
    throw error;
  }
}

async function pullAll(uid = cloudUid()) {
  const db = cloudDb();
  if (!db || !uid) return { pulled: false };
  if (!window.ComCalFirebaseConfigured?.()) return { pulled: false };

  const snap = await userDoc(uid).collection("store").get();
  if (snap.empty) return { pulled: false, empty: true };

  const data = {};
  snap.forEach((doc) => {
    const value = doc.data()?.value;
    if (typeof value === "string") data[doc.id] = value;
  });
  writeLocalBundle(data);
  return { pulled: true, keys: Object.keys(data) };
}

async function migrateLocalIfNeeded(uid = cloudUid()) {
  if (!uid) return { migrated: false };
  const flagKey = `comcal-cloud-migrated-${uid}`;
  if (localStorage.getItem(flagKey) === "1") return { migrated: false };

  const hasCloud = await cloudHasUserData(uid);
  if (hasCloud) {
    localStorage.setItem(flagKey, "1");
    return { migrated: false };
  }

  if (!localHasUserData()) {
    localStorage.setItem(flagKey, "1");
    return { migrated: false };
  }

  await pushAll(uid);
  localStorage.setItem(flagKey, "1");
  return { migrated: true };
}

function notifyChanged() {
  if (syncingFromCloud) return;
  if (!cloudUid()) return;
  clearTimeout(syncPushTimer);
  syncPushTimer = setTimeout(() => {
    pushAll().catch(() => {});
  }, 900);
}

function refreshAppAfterCloudPull() {
  window.ComCalAssignments?.reloadFromStorage?.();
  window.ComCalGrades?.reloadFromStorage?.();
  window.ComCalCurriculum?.reload?.();
  window.ComCalProfile?.render?.();
  window.ComCalCalendar?.reload?.();
}

async function onSignedIn(uid) {
  if (!uid) return;
  if (onSignedIn._inflight) return onSignedIn._inflight;
  onSignedIn._inflight = (async () => {
    try {
      const migration = await migrateLocalIfNeeded(uid);
      if (!migration.migrated) {
        await pullAll(uid);
      }
      refreshAppAfterCloudPull();
    } catch (error) {
      console.error("ComCal cloud sync on sign-in failed:", error);
    } finally {
      onSignedIn._inflight = null;
    }
  })();
  return onSignedIn._inflight;
}

window.ComCalCloud = {
  keys: COMCAL_SYNC_KEYS,
  notifyChanged,
  pushAll,
  pullAll,
  migrateLocalIfNeeded,
  onSignedIn,
  clearLocalUserData,
  refreshAppAfterCloudPull,
  get lastError() {
    return lastPushError;
  },
};
