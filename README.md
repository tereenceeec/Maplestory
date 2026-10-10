# MapleStory item list

A static tracker for MapleStory items: name, icon screenshot, last sold price, previous sold price, and how much the price moved. The site is meant to be hosted on **GitHub Pages**. Item data and small thumbnails are stored in **Cloud Firestore** (GitHub Pages cannot save uploads or prices by itself). Firebase Storage is not required, so you can stay on the Spark (no billing) plan.

Anyone who knows the shared edit password can add items and update last sold prices. Everyone can view the list.

## 1. Create a Firebase project

1. Open [Firebase Console](https://console.firebase.google.com/) and create a project (Spark / free plan is enough).
2. Add a **Web** app. Copy the Firebase config object. Do not enable Firebase Hosting.
3. Enable **Firestore Database** (production mode is fine). Skip Storage if it asks for a billing account.

## 2. Publish Firestore rules

In Firebase: **Firestore Database → Rules**. Replace the editor contents with [`firestore.rules`](firestore.rules), then **Publish**.

Or from this repo with the Firebase CLI:

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules
```

Firestore allows public **reads**. **Creates and updates** must match the item field shape in `firestore.rules`. Deletes are denied. Small item icons are stored on the item document (resized in the browser).

The form password is checked in the browser only. It stops casual vandalism; it is not a real login system. Anyone who can read `firebase-config.js` can also recover the hash. Do not store anything sensitive here.

## 3. Wire the site to Firebase

1. Copy values from the Firebase web app into [`firebase-config.js`](firebase-config.js) (see [`firebase-config.example.js`](firebase-config.example.js)).
2. Set `editPasswordSha256` to the SHA-256 hex of the password you will share with editors. Generate it in a browser console:

```js
crypto.subtle.digest("SHA-256", new TextEncoder().encode("your-password"))
  .then((buf) => console.log([...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("")));
```

Paste the lowercase hex string into `editPasswordSha256`. Commit `firebase-config.js` so GitHub Pages can load it. Firebase web API keys are designed to be public; keep **rules** published.

## 4. Publish on GitHub Pages

1. Push this repository to GitHub.
2. Repo **Settings → Pages**.
3. Source: **Deploy from a branch**.
4. Branch: `main`, folder: `/ (root)`.
5. Save. The site will be at `https://<your-username>.github.io/Maplestory/` (or your custom Pages URL).

[`.nojekyll`](.nojekyll) is included so GitHub does not process the site with Jekyll.

## Local preview

Open `index.html` through a local static server (modules will not load from `file://`):

```bash
npx --yes serve .
```

Until Firebase config is filled in, the page shows a setup banner instead of the live list.

## How prices work

- Adding an item stores **last sold** and the time it was set. Previous sold is empty.
- Updating the last sold price moves the old last sold into **previous last sold**, stamps the new time, and shows the meso and percent change.
- Updating only the name or icon does not shift price history.
