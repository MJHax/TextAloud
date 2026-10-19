/** TextAloud — popup UI. */

const $ = (id) => document.getElementById(id);

let settings = {};
let models = [];
let saveTimer = null;

function send(message) {
  return chrome.runtime.sendMessage(message).catch((e) => ({
    ok: false,
    error: e?.message || String(e),
  }));
}

function toast(text, kind) {
  const el = $("toast");
  el.textContent = text;
  el.className = "toast" + (kind ? ` ${kind}` : "");
  el.hidden = !text;
  if (text) {
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (el.hidden = true), 4200);
  }
}

function fmtMoney(v) {
  if (typeof v !== "number" || !isFinite(v)) return "—";
  if (v === 0) return "$0.00";
  if (v < 0.0001) return "$" + v.toExponential(2);
  if (v < 1) return "$" + v.toFixed(4);
  return "$" + v.toFixed(2);
}

/* ---------------------------------------------------------------- */
/* Rendering                                                         */
/* ---------------------------------------------------------------- */

function showSetup() {
  $("setup").hidden = false;
  $("main").hidden = true;
}

function showMain() {
  $("setup").hidden = true;
  $("main").hidden = false;
}

function shortPrice(m) {
  const p = m.pricing?.prompt || 0;
  const c = m.pricing?.completion || 0;
  if (c === 0 && p > 0) return `$${(p * 1e6).toFixed(2)}/M chars`;
  if (p === 0 && c > 0) return `$${c.toFixed(5)}/sec`;
  if (p > 0 && c > 0)
    return `$${(p * 1e6).toFixed(2)}/M in + $${(c * 1e6).toFixed(2)}/M out`;
  return "price n/a";
}

function populateModels() {
  const select = $("model");
  select.innerHTML = "";

  const list = [...models].sort((a, b) => a.name.localeCompare(b.name));
  if (!list.some((m) => m.id === settings.model) && settings.model) {
    const opt = document.createElement("option");
    opt.value = settings.model;
    opt.textContent = `${settings.model} (unavailable)`;
    select.appendChild(opt);
  }
  for (const m of list) {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = `${m.name} — ${shortPrice(m)}`;
    select.appendChild(opt);
  }
  select.value = settings.model;
}

function currentModel() {
  return models.find((m) => m.id === settings.model) || null;
}

function prettyVoice(v) {
  const value = String(v);
  const colon = value.indexOf(":");
  return colon > 0 ? value.slice(0, colon) : value;
}

function populateVoices() {
  const model = currentModel();
  const voices = Array.isArray(model?.voices) ? model.voices : [];
  const select = $("voiceSelect");
  const custom = $("voice");
  const list = $("voiceList");
  const note = $("voiceNote");

  list.innerHTML = "";
  select.innerHTML = "";

  if (voices.length) {
    const sorted = [...voices].sort((a, b) => String(a).localeCompare(String(b)));
    for (const v of sorted) {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = prettyVoice(v);
      select.appendChild(opt);
      const dl = document.createElement("option");
      dl.value = v;
      list.appendChild(dl);
    }
    select.hidden = false;
    custom.hidden = true;

    if (!voices.includes(settings.voice)) {
      settings.voice = sorted[0];
      persist({ voice: settings.voice });
    }
    select.value = settings.voice;
    note.textContent = `${voices.length} voice${
      voices.length === 1 ? "" : "s"
    } for this model. Many names indicate language, gender, or style.`;
  } else {
    select.hidden = true;
    custom.hidden = false;
    custom.value = settings.voice || "";
    note.textContent = model
      ? "No preset voice list for this model — leave blank for the provider default (some models support voice cloning)."
      : "";
  }
}

async function renderPrice() {
  const model = currentModel();
  const el = $("priceInfo");
  if (!model) {
    el.textContent = models.length ? "" : "No models loaded — try ↻ Models.";
    return;
  }
  const p = model.pricing?.prompt || 0;
  const c = model.pricing?.completion || 0;
  let text;
  if (c === 0 && p > 0) {
    text = `$${(p * 1e6).toFixed(2)} / 1M characters`;
  } else if (p === 0 && c > 0) {
    text = `$${c.toFixed(6)} / second of audio`;
  } else if (p > 0 && c > 0) {
    text = `$${(p * 1e6).toFixed(2)} / 1M text tokens + $${(c * 1e6).toFixed(2)} / 1M audio tokens`;
  } else {
    text = "Pricing unavailable";
  }

  const { calibration = {} } = await chrome.storage.local.get("calibration");
  const cal = calibration[model.id];
  if (cal && cal.costPerChar > 0) {
    text += `  ·  calibrated ≈ $${(cal.costPerChar * 1e6).toFixed(2)} / 1M chars`;
  }
  el.textContent = text;
}

async function renderCredits() {
  const el = $("credits");
  const res = await send({ type: "getCredits" });
  if (res?.ok) {
    el.classList.remove("error");
    el.innerHTML = `Remaining credits: <strong>$${res.remaining.toFixed(2)}</strong> of $${res.total.toFixed(2)}`;
  } else {
    el.classList.add("error");
    el.textContent =
      res?.error === "no-key"
        ? "No API key set."
        : `Couldn't load credits (${res?.error || "unknown error"}).`;
  }
}

/* ---------------------------------------------------------------- */
/* Saving                                                            */
/* ---------------------------------------------------------------- */

async function persist(partial) {
  Object.assign(settings, partial);
  const res = await send({ type: "saveSettings", settings: partial });
  if (res?.ok) settings = res.settings;
}

function debouncedPersist(partial) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persist(partial), 450);
}

/* ---------------------------------------------------------------- */
/* Events                                                            */
/* ---------------------------------------------------------------- */

function bind() {
  $("saveKey").addEventListener("click", onSaveKey);
  $("model").addEventListener("change", onModelChange);
  $("voiceSelect").addEventListener("change", () =>
    persist({ voice: $("voiceSelect").value })
  );
  $("voice").addEventListener("change", () => persist({ voice: $("voice").value.trim() }));
  $("voice").addEventListener("blur", () => persist({ voice: $("voice").value.trim() }));
  $("instructions").addEventListener("input", () =>
    debouncedPersist({ instructions: $("instructions").value })
  );
  $("speed").addEventListener("input", () => {
    $("speedVal").textContent = `${Number($("speed").value).toFixed(2)}×`;
  });
  $("speed").addEventListener("change", () => persist({ speed: Number($("speed").value) }));
  $("showEstimate").addEventListener("change", () =>
    persist({ showEstimate: $("showEstimate").checked })
  );
  $("showButton").addEventListener("change", () =>
    persist({ showButton: $("showButton").checked })
  );
  $("contextMenu").addEventListener("change", () =>
    persist({ contextMenu: $("contextMenu").checked })
  );
  $("saveAudio").addEventListener("change", onSaveAudioChange);
  $("chooseFolder").addEventListener("click", chooseFolder);
  $("forgetFolder").addEventListener("click", onForgetFolder);
  $("preview").addEventListener("click", onPreview);
  $("refresh").addEventListener("click", onRefresh);
  $("changeKey").addEventListener("click", (e) => {
    e.preventDefault();
    $("apiKey").value = "";
    showSetup();
  });
}

async function onSaveKey() {
  const key = $("apiKey").value.trim();
  if (!key) return toast("Please paste an API key.", "error");
  const btn = $("saveKey");
  btn.disabled = true;
  btn.textContent = "Connecting…";
  try {
    await persist({ apiKey: key });
    showMain();
    await loadModelsAndRender();
    await renderCredits();
    toast("Connected to OpenRouter.", "ok");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save & connect";
  }
}

async function onModelChange() {
  await persist({ model: $("model").value });
  populateVoices();
  renderPrice();
}

async function onRefresh() {
  const btn = $("refresh");
  btn.disabled = true;
  const res = await send({ type: "fetchModels" });
  btn.disabled = false;
  if (res?.ok) {
    models = res.models;
    populateModels();
    populateVoices();
    renderPrice();
    toast(`Loaded ${models.length} TTS models.`, "ok");
  } else {
    toast(res?.error || "Could not load models.", "error");
  }
}

async function onPreview() {
  const btn = $("preview");
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = "Generating…";
  const res = await send({
    type: "preview",
    text: "Hello! This is TextAloud, reading your selection aloud.",
  });
  btn.disabled = false;
  btn.textContent = original;
  toast(res?.ok ? "Playing sample…" : res?.error || "Preview failed.", res?.ok ? "ok" : "error");
}

/* ---------------------------------------------------------------- */
/* Init                                                              */
/* ---------------------------------------------------------------- */

async function renderSaveFolder() {
  const files = self.TextAloudFiles;
  const dir = files ? await files.getDir() : null;
  let needed = Boolean(
    (await chrome.storage.local.get("folderPermissionNeeded")).folderPermissionNeeded
  );
  if (dir && dir.queryPermission) {
    const perm = await dir.queryPermission({ mode: "readwrite" });
    needed = perm !== "granted";
    await chrome.storage.local.set({ folderPermissionNeeded: needed });
  }
  $("saveFolderRow").hidden = !settings.saveAudio && !needed;
  $("saveFolderName").textContent = needed
    ? "⚠ Folder access needs re-confirming"
    : dir
    ? `📁 ${dir.name}`
    : "No folder selected yet";
  $("chooseFolder").textContent = needed ? "Re-grant" : "Choose…";
  $("forgetFolder").hidden = !dir;
}

function chooseFolder() {
  // A native folder dialog steals focus, which closes an extension popup and
  // cancels the picker — so folder selection lives in the options tab.
  chrome.runtime.openOptionsPage();
}

function onSaveAudioChange() {
  const on = $("saveAudio").checked;
  persist({ saveAudio: on });
  if (on && !settings.saveFolderName) {
    chooseFolder();
  } else {
    renderSaveFolder();
  }
}

async function onForgetFolder() {
  if (self.TextAloudFiles) await self.TextAloudFiles.clearDir();
  await persist({ saveFolderName: "" });
  await renderSaveFolder();
  toast("Save folder forgotten.", "ok");
}

function renderForm() {
  $("instructions").value = settings.instructions || "";
  $("speed").value = settings.speed ?? 1;
  $("speedVal").textContent = `${Number(settings.speed ?? 1).toFixed(2)}×`;
  $("showEstimate").checked = settings.showEstimate !== false;
  $("showButton").checked = settings.showButton !== false;
  $("contextMenu").checked = settings.contextMenu !== false;
  $("saveAudio").checked = !!settings.saveAudio;
  populateModels();
  populateVoices();
  renderPrice();
  renderSaveFolder();
}

async function loadModelsAndRender() {
  const res = await send({ type: "getState" });
  if (res?.ok) {
    settings = res.settings;
    models = res.models || [];
    if (res.modelsError) toast(`Model list failed: ${res.modelsError}`, "error");
  }
  renderForm();
}

async function init() {
  bind();
  const res = await send({ type: "getState" });
  if (res?.ok) {
    settings = res.settings;
    models = res.models || [];
  }

  if (!settings.apiKey) {
    showSetup();
    return;
  }

  showMain();
  renderForm();
  renderCredits();
}

init();
