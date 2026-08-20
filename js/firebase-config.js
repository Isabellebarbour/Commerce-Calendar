/**
 * Firebase web config for ComCal.
 *
 * Setup (once):
 * 1. https://console.firebase.google.com → create a project
 * 2. Authentication → Sign-in method → enable Email/Password
 * 3. Project settings → Your apps → Web → copy the config below
 * 4. Firestore Database → create database → paste rules from firestore.rules
 * 5. Authentication → Settings → Authorized domains → add smithcommercecalendar.com
 *    and isabellebarbour.github.io
 *
 * Replace the placeholder strings with your real Firebase values.
 */
window.ComCalFirebaseConfig = {
  apiKey: "PASTE_API_KEY",
  authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE_PROJECT_ID.appspot.com",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID",
};

window.ComCalFirebaseConfigured = function ComCalFirebaseConfigured() {
  const cfg = window.ComCalFirebaseConfig || {};
  return Boolean(
    cfg.apiKey &&
      !String(cfg.apiKey).startsWith("PASTE_") &&
      cfg.projectId &&
      !String(cfg.projectId).startsWith("PASTE_") &&
      cfg.appId &&
      !String(cfg.appId).startsWith("PASTE_")
  );
};
