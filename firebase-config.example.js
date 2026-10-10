// Copy this file to firebase-config.js and fill in your Firebase web app values.
// firebase-config.js is what the live GitHub Pages site loads.

export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

// SHA-256 hex of the shared edit password (lowercase, no spaces).
// Generate one in the browser console:
//   crypto.subtle.digest('SHA-256', new TextEncoder().encode('your-password'))
//     .then(buf => console.log([...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')));
export const editPasswordSha256 = "REPLACE_WITH_SHA256_HEX";
