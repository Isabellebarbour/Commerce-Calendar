/**
 * Firebase web config for ComCal.
 *
 * Also ensure in Firebase Console:
 * - Authentication → Email/Password enabled
 * - Firestore rules published from firestore.rules
 * - Authorized domains include smithcommercecalendar.com and isabellebarbour.github.io
 */
window.ComCalFirebaseConfig = {
  apiKey: "AIzaSyA4XlItLho6N5iPl2Ng5ZlCdb6_azc5kkE",
  authDomain: "commerce-calendar.firebaseapp.com",
  projectId: "commerce-calendar",
  storageBucket: "commerce-calendar.firebasestorage.app",
  messagingSenderId: "348610196285",
  appId: "1:348610196285:web:aaf1121388cdb4bb7b4b54",
  measurementId: "G-1529HD00PX",
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
