import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  addDoc,
  collection,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { editPasswordSha256, firebaseConfig } from "./firebase-config.js";

const PLACEHOLDER_MARKERS = ["YOUR_API_KEY", "REPLACE_WITH_SHA256_HEX"];
const MAX_NAME = 80;
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const ICON_MAX_PX = 128;
const PASSWORD_SESSION_KEY = "ms-item-board-password";

const els = {
  setup: document.getElementById("setup-banner"),
  error: document.getElementById("error-banner"),
  search: document.getElementById("search"),
  addBtn: document.getElementById("add-btn"),
  status: document.getElementById("status-line"),
  grid: document.getElementById("item-grid"),
  dialog: document.getElementById("item-dialog"),
  form: document.getElementById("item-form"),
  dialogTitle: document.getElementById("dialog-title"),
  itemId: document.getElementById("item-id"),
  itemName: document.getElementById("item-name"),
  itemIcon: document.getElementById("item-icon"),
  iconHint: document.getElementById("icon-hint"),
  iconPreviewWrap: document.getElementById("icon-preview-wrap"),
  iconPreview: document.getElementById("icon-preview"),
  itemPrice: document.getElementById("item-price"),
  itemPassword: document.getElementById("item-password"),
  formError: document.getElementById("form-error"),
  cancelBtn: document.getElementById("cancel-btn"),
  saveBtn: document.getElementById("save-btn"),
};

let db = null;
let items = [];
let pendingIconDataUrl = "";
let existingIconUrl = "";

function configIsReady() {
  const values = Object.values(firebaseConfig).join(" ");
  return (
    !PLACEHOLDER_MARKERS.some((marker) => values.includes(marker) || editPasswordSha256.includes(marker)) &&
    /^[a-f0-9]{64}$/.test(editPasswordSha256)
  );
}

function showBanner(el, message) {
  el.textContent = message;
  el.classList.remove("hidden");
}

function hideBanner(el) {
  el.classList.add("hidden");
  el.textContent = "";
}

function formatMesos(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `${Number(value).toLocaleString("en-US")} mesos`;
}

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatWhen(value) {
  const date = toDate(value);
  if (!date) return "unknown time";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function parsePrice(raw) {
  const cleaned = String(raw).replace(/[,_\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0 || n > 999999999999) return null;
  return n;
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function passwordMatches(password) {
  const hex = await sha256Hex(password);
  return hex === editPasswordSha256;
}

function priceDelta(lastSold, previousSold) {
  if (previousSold == null || lastSold == null) return null;
  const amount = lastSold - previousSold;
  const percent = previousSold === 0 ? null : (amount / previousSold) * 100;
  return { amount, percent };
}

function deltaLabel(delta) {
  if (!delta) return { text: "First recorded sale", cls: "flat" };
  const sign = delta.amount > 0 ? "+" : "";
  const amountText = `${sign}${delta.amount.toLocaleString("en-US")} mesos`;
  const percentText =
    delta.percent == null
      ? ""
      : ` (${sign}${delta.percent.toLocaleString("en-US", { maximumFractionDigits: 1 })}%)`;
  const cls = delta.amount > 0 ? "up" : delta.amount < 0 ? "down" : "flat";
  const prefix = delta.amount > 0 ? "Up" : delta.amount < 0 ? "Down" : "Unchanged";
  return { text: `${prefix} ${amountText}${percentText} since last sell`, cls };
}

function matchesSearch(item, q) {
  if (!q) return true;
  return item.name.toLowerCase().includes(q);
}

function render() {
  const q = els.search.value.trim().toLowerCase();
  const visible = items.filter((item) => matchesSearch(item, q));
  els.status.textContent = q
    ? `${visible.length} of ${items.length} items`
    : `${items.length} item${items.length === 1 ? "" : "s"}`;

  els.grid.replaceChildren();
  if (!visible.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = items.length
      ? "No items match that name."
      : "No items yet. Add one to start the board.";
    els.grid.append(empty);
    return;
  }

  for (const item of visible) {
    const delta = priceDelta(item.lastSold, item.previousSold);
    const deltaUi = deltaLabel(delta);

    const img = document.createElement("img");
    img.alt = item.name;
    img.src = item.iconUrl;

    const title = document.createElement("h3");
    title.textContent = item.name;

    const lastLine = document.createElement("p");
    lastLine.className = "meta";
    lastLine.append("Last sold ");
    const mesos = document.createElement("span");
    mesos.className = "mesos";
    mesos.textContent = formatMesos(item.lastSold);
    lastLine.append(mesos);

    const updatedLine = document.createElement("p");
    updatedLine.className = "meta";
    updatedLine.textContent = `Updated ${formatWhen(item.lastSoldAt)}`;

    const previous = document.createElement("p");
    previous.className = "meta";
    previous.textContent =
      item.previousSold == null
        ? "No previous last sold yet."
        : `Previous last sold ${formatMesos(item.previousSold)} (${formatWhen(item.previousSoldAt)})`;

    const deltaEl = document.createElement("p");
    deltaEl.className = `delta ${deltaUi.cls}`;
    deltaEl.textContent = deltaUi.text;

    const updateBtn = document.createElement("button");
    updateBtn.type = "button";
    updateBtn.className = "btn";
    updateBtn.textContent = "Update price";
    updateBtn.addEventListener("click", () => openDialog(item));

    const body = document.createElement("div");
    body.append(title, lastLine, updatedLine, previous, deltaEl, updateBtn);

    const li = document.createElement("li");
    li.className = "item-card";
    li.append(img, body);
    els.grid.append(li);
  }
}

function setFormError(message) {
  if (!message) {
    els.formError.classList.add("hidden");
    els.formError.textContent = "";
    return;
  }
  els.formError.textContent = message;
  els.formError.classList.remove("hidden");
}

function resetIconPreview(url = "") {
  pendingIconDataUrl = "";
  existingIconUrl = url;
  els.itemIcon.value = "";
  if (url) {
    els.iconPreview.src = url;
    els.iconPreviewWrap.classList.remove("hidden");
  } else {
    els.iconPreview.removeAttribute("src");
    els.iconPreviewWrap.classList.add("hidden");
  }
}

function openDialog(item = null) {
  els.form.reset();
  setFormError("");
  els.itemPassword.value = sessionStorage.getItem(PASSWORD_SESSION_KEY) || "";
  if (item) {
    els.dialogTitle.textContent = "Update item";
    els.itemId.value = item.id;
    els.itemName.value = item.name;
    els.itemPrice.value = String(item.lastSold);
    els.itemIcon.required = false;
    els.iconHint.textContent = "Optional: replace the icon with a new screenshot.";
    resetIconPreview(item.iconUrl);
  } else {
    els.dialogTitle.textContent = "Add item";
    els.itemId.value = "";
    els.itemIcon.required = true;
    els.iconHint.textContent = "PNG, JPEG, or WebP. Resized in the browser to a small thumbnail.";
    resetIconPreview();
  }
  els.dialog.showModal();
  els.itemName.focus();
}

function closeDialog() {
  els.dialog.close();
}

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      reject(new Error("Use a PNG, JPEG, or WebP screenshot."));
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      reject(new Error("Screenshot is too large (max 5 MB before resize)."));
      return;
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(ICON_MAX_PX / img.width, ICON_MAX_PX / img.height, 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(objectUrl);
          if (!blob) {
            reject(new Error("Could not process that screenshot."));
            return;
          }
          if (blob.size > 200 * 1024) {
            reject(new Error("Resized icon is still over 200 KB. Try a tighter crop."));
            return;
          }
          resolve(blob);
        },
        "image/webp",
        0.85
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read that image."));
    };
    img.src = objectUrl;
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read the resized icon."));
    reader.readAsDataURL(blob);
  });
}

async function onIconChosen(event) {
  const file = event.target.files?.[0];
  if (!file) {
    pendingIconDataUrl = "";
    return;
  }
  try {
    const blob = await resizeImage(file);
    pendingIconDataUrl = await blobToDataUrl(blob);
    if (pendingIconDataUrl.length > 350000) {
      throw new Error("Resized icon is still too large. Try a tighter crop.");
    }
    els.iconPreview.src = pendingIconDataUrl;
    els.iconPreviewWrap.classList.remove("hidden");
    setFormError("");
  } catch (err) {
    pendingIconDataUrl = "";
    els.itemIcon.value = "";
    setFormError(err.message);
  }
}

async function saveItem(event) {
  event.preventDefault();
  setFormError("");

  const name = els.itemName.value.trim();
  if (!name || name.length > MAX_NAME) {
    setFormError("Enter an item name (80 characters or fewer).");
    return;
  }

  const lastSold = parsePrice(els.itemPrice.value);
  if (lastSold == null) {
    setFormError("Enter a valid last sold meso amount.");
    return;
  }

  const password = els.itemPassword.value;
  if (!(await passwordMatches(password))) {
    setFormError("Edit password is incorrect.");
    return;
  }
  sessionStorage.setItem(PASSWORD_SESSION_KEY, password);

  const id = els.itemId.value;
  if (!id && !pendingIconDataUrl) {
    setFormError("Upload a small screenshot of the item.");
    return;
  }

  els.saveBtn.disabled = true;
  try {
    const iconUrl = pendingIconDataUrl || existingIconUrl;

    if (!id) {
      await addDoc(collection(db, "items"), {
        name,
        iconUrl,
        lastSold,
        lastSoldAt: serverTimestamp(),
        previousSold: null,
        previousSoldAt: null,
        updatedAt: serverTimestamp(),
      });
    } else {
      const current = items.find((item) => item.id === id);
      if (!current) throw new Error("That item is no longer in the list.");
      const priceChanged = current.lastSold !== lastSold;
      const payload = {
        name,
        iconUrl,
        lastSold,
        updatedAt: serverTimestamp(),
      };
      if (priceChanged) {
        payload.previousSold = current.lastSold;
        payload.previousSoldAt = current.lastSoldAt ?? serverTimestamp();
        payload.lastSoldAt = serverTimestamp();
      } else {
        payload.previousSold = current.previousSold ?? null;
        payload.previousSoldAt = current.previousSoldAt ?? null;
        payload.lastSoldAt = current.lastSoldAt ?? serverTimestamp();
      }
      await updateDoc(doc(db, "items", id), payload);
    }
    closeDialog();
  } catch (err) {
    setFormError(err.message || "Could not save the item.");
  } finally {
    els.saveBtn.disabled = false;
  }
}

function listenForItems() {
  const itemsQuery = query(collection(db, "items"), orderBy("name"));
  onSnapshot(
    itemsQuery,
    (snap) => {
      hideBanner(els.error);
      items = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      render();
    },
    (err) => {
      showBanner(els.error, `Could not load items: ${err.message}`);
      els.status.textContent = "Unable to load the list.";
    }
  );
}

function init() {
  if (!configIsReady()) {
    showBanner(
      els.setup,
      "This site is not connected yet. Create a Firebase project, paste the web config into firebase-config.js, set the edit password hash, publish Firestore rules, then enable GitHub Pages. See README.md."
    );
    els.status.textContent = "Waiting for Firebase setup.";
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "The board will appear here after Firebase is connected.";
    els.grid.replaceChildren(empty);
    return;
  }

  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);

  els.search.disabled = false;
  els.addBtn.disabled = false;
  els.search.addEventListener("input", render);
  els.addBtn.addEventListener("click", () => openDialog());
  els.cancelBtn.addEventListener("click", closeDialog);
  els.form.addEventListener("submit", saveItem);
  els.itemIcon.addEventListener("change", onIconChosen);
  listenForItems();
}

init();
