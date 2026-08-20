(function initFirebase() {
  if (!window.firebase) {
    console.error("Firebase SDK failed to load.");
    window.ComCalFirebase = { ready: Promise.resolve(null), app: null, auth: null, db: null };
    return;
  }

  if (!window.ComCalFirebaseConfigured?.()) {
    console.warn(
      "ComCal: Firebase is not configured yet. Paste your web config into js/firebase-config.js."
    );
    window.ComCalFirebase = { ready: Promise.resolve(null), app: null, auth: null, db: null };
    return;
  }

  const app = firebase.apps.length
    ? firebase.app()
    : firebase.initializeApp(window.ComCalFirebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();

  window.ComCalFirebase = {
    app,
    auth,
    db,
    ready: Promise.resolve({ app, auth, db }),
  };
})();
