const PROFILE_META_STORAGE = "comcal-session-meta";

let cachedSession = null;
let authReadyResolve;
const authReady = new Promise((resolve) => {
  authReadyResolve = resolve;
});

function requireFirebase() {
  if (!window.ComCalFirebaseConfigured?.()) {
    throw new Error(
      "Cloud accounts are not set up yet. Add your Firebase web config in js/firebase-config.js (see that file for steps)."
    );
  }
  const auth = window.ComCalFirebase?.auth;
  if (!auth) {
    throw new Error("Firebase Auth is not ready. Check your connection and firebase-config.js.");
  }
  return auth;
}

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function loadMeta() {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_META_STORAGE) || "null") || {};
  } catch {
    return {};
  }
}

function saveMeta(meta) {
  if (!meta) {
    localStorage.removeItem(PROFILE_META_STORAGE);
    return;
  }
  localStorage.setItem(PROFILE_META_STORAGE, JSON.stringify(meta));
}

function sessionFromUser(user, meta = {}) {
  if (!user) return null;
  const stored = { ...loadMeta(), ...meta };
  const name =
    stored.name ||
    user.displayName ||
    [stored.firstName, stored.lastName].filter(Boolean).join(" ") ||
    "";
  return {
    userId: user.uid,
    email: user.email || stored.email || "",
    name,
    graduationDate: stored.graduationDate || "",
    firstName: stored.firstName || "",
    lastName: stored.lastName || "",
  };
}

function setCachedSession(session) {
  cachedSession = session;
  if (session) {
    saveMeta({
      name: session.name || "",
      email: session.email || "",
      graduationDate: session.graduationDate || "",
      firstName: session.firstName || "",
      lastName: session.lastName || "",
    });
  }
}

async function writeUserProfile(uid, profile) {
  const db = window.ComCalFirebase?.db;
  if (!db || !uid) return;
  await db
    .collection("users")
    .doc(uid)
    .set(
      {
        email: profile.email || "",
        name: profile.name || "",
        firstName: profile.firstName || "",
        lastName: profile.lastName || "",
        graduationDate: profile.graduationDate || "",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
}

async function readUserProfile(uid) {
  const db = window.ComCalFirebase?.db;
  if (!db || !uid) return {};
  const snap = await db.collection("users").doc(uid).get();
  return snap.exists ? snap.data() || {} : {};
}

async function signUp({ firstName, lastName, graduationDate, email, password }) {
  const auth = requireFirebase();
  const cleanedEmail = normalizeEmail(email);
  const cleanedFirst = String(firstName || "").trim();
  const cleanedLast = String(lastName || "").trim();
  const cleanedGrad = String(graduationDate || "").trim();
  const cleanedName = [cleanedFirst, cleanedLast].filter(Boolean).join(" ");

  if (!cleanedFirst) throw new Error("Enter your first name.");
  if (!cleanedLast) throw new Error("Enter your last name.");
  if (!cleanedGrad) throw new Error("Enter your graduation date.");
  if (!cleanedEmail || !cleanedEmail.includes("@")) {
    throw new Error("Enter a valid email address.");
  }
  if (String(password || "").length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  let credential;
  try {
    credential = await auth.createUserWithEmailAndPassword(cleanedEmail, password);
  } catch (error) {
    if (error.code === "auth/email-already-in-use") {
      throw new Error("An account with that email already exists. Try signing in.");
    }
    if (error.code === "auth/weak-password") {
      throw new Error("Password must be at least 8 characters.");
    }
    if (error.code === "auth/invalid-email") {
      throw new Error("Enter a valid email address.");
    }
    throw new Error(error.message || "Could not create account.");
  }

  const user = credential.user;
  try {
    await user.updateProfile({ displayName: cleanedName });
  } catch {
    /* non-fatal */
  }

  const profile = {
    email: cleanedEmail,
    name: cleanedName,
    firstName: cleanedFirst,
    lastName: cleanedLast,
    graduationDate: cleanedGrad,
  };
  await writeUserProfile(user.uid, profile);
  const session = sessionFromUser(user, profile);
  setCachedSession(session);
  await window.ComCalCloud?.onSignedIn?.(user.uid);
  return session;
}

async function logIn({ email, password }) {
  const auth = requireFirebase();
  const cleanedEmail = normalizeEmail(email);
  if (!cleanedEmail || !password) {
    throw new Error("Enter your email and password.");
  }

  let credential;
  try {
    credential = await auth.signInWithEmailAndPassword(cleanedEmail, password);
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      throw new Error("No account found for that email.");
    }
    if (error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") {
      throw new Error("Incorrect password.");
    }
    if (error.code === "auth/too-many-requests") {
      throw new Error("Too many attempts. Try again later.");
    }
    throw new Error(error.message || "Could not sign in.");
  }

  const user = credential.user;
  const remote = await readUserProfile(user.uid);
  const session = sessionFromUser(user, {
    name: remote.name || user.displayName || "",
    firstName: remote.firstName || "",
    lastName: remote.lastName || "",
    graduationDate: remote.graduationDate || "",
    email: user.email || cleanedEmail,
  });
  setCachedSession(session);
  await window.ComCalCloud?.onSignedIn?.(user.uid);
  return session;
}

async function logOut() {
  const auth = window.ComCalFirebase?.auth;
  try {
    if (auth) await auth.signOut();
  } catch {
    /* ignore */
  }
  setCachedSession(null);
  saveMeta(null);
  window.ComCalCloud?.clearLocalUserData?.();
}

function getSession() {
  if (cachedSession) return cachedSession;
  const user = window.ComCalFirebase?.auth?.currentUser;
  if (!user) return null;
  cachedSession = sessionFromUser(user);
  return cachedSession;
}

function isLoggedIn() {
  return Boolean(window.ComCalFirebase?.auth?.currentUser || cachedSession?.userId);
}

function whenReady() {
  return authReady;
}

function bindAuthState() {
  const auth = window.ComCalFirebase?.auth;
  if (!auth) {
    authReadyResolve();
    return;
  }

  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      setCachedSession(null);
      authReadyResolve();
      return;
    }
    try {
      const remote = await readUserProfile(user.uid);
      setCachedSession(
        sessionFromUser(user, {
          name: remote.name || user.displayName || "",
          firstName: remote.firstName || "",
          lastName: remote.lastName || "",
          graduationDate: remote.graduationDate || "",
          email: user.email || "",
        })
      );
    } catch {
      setCachedSession(sessionFromUser(user));
    }
    authReadyResolve();
  });
}

bindAuthState();

window.ComCalAuth = {
  signUp,
  logIn,
  logOut,
  getSession,
  isLoggedIn,
  whenReady,
};
