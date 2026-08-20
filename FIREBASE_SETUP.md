# Firebase setup for ComCal

Cross-device logins use **Firebase Authentication** + **Cloud Firestore**.

## 1. Create a project
1. Open [Firebase Console](https://console.firebase.google.com)
2. Add a project (Spark / free plan is fine)

## 2. Enable Email/Password auth
1. **Build → Authentication → Get started**
2. **Sign-in method → Email/Password → Enable → Save**

## 3. Register a web app
1. Project overview → **Web** (`</>`)
2. Nickname: `ComCal`
3. Copy the `firebaseConfig` values into [`js/firebase-config.js`](js/firebase-config.js)

## 4. Create Firestore
1. **Build → Firestore Database → Create database**
2. Start in **production mode**
3. Open **Rules** and paste the contents of [`firestore.rules`](firestore.rules) → **Publish**

## 5. Authorized domains
**Authentication → Settings → Authorized domains** — add:
- `smithcommercecalendar.com`
- `www.smithcommercecalendar.com`
- `isabellebarbour.github.io`
- `localhost` (already there for local testing)

## 6. Deploy config
Commit and push `js/firebase-config.js` after pasting your real keys (these web keys are safe to expose in a frontend app when Firestore rules are locked to `request.auth.uid`).
