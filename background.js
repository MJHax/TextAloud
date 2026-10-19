/**
 * TextAloud — background service worker (Manifest V3, ES module)
 *
 * Responsibilities:
 *  - Hold the OpenRouter API key (never exposed to page content scripts)
 *  - Fetch and cache the list of speech-capable models
 *  - Estimate cost before playback, and reconcile actual cost afterwards
 *  - Fetch synthesized audio and hand it to the offscreen document for playback
 *  - Relay playback state back to the originating tab
 */

const SPEECH_URL = "https://openrouter.ai/api/v1/audio/speech";
const MODELS_URL = "https://openrouter.ai/api/v1/models?output_modalities=speech";
const GENERATION_URL = "https://openrouter.ai/api/v1/generation";
const CREDITS_URL = "https://openrouter.ai/api/v1/credits";

const DEFAULTS = {
  apiKey: "",
  model: "google/gemini-3.8-flash-lite-tts",
  voice: "Kore",
  instructions: "",
  speed: 1,
  showEstimate: true,
  showButton: true,
  contextMenu: true,
  saveAudio: false,
  saveFolderName: "",
};

// Rough heuristics used only for the pre-flight estimate on models that are not
// priced per character. Real costs replace these once a model has been used.
const CHARS_PER_SECOND = 15; // ~150 wpm
const CHARS_PER_TOKEN = 4; // English approximation
const AUDIO_TOKENS_PER_SECOND = 25; // used for Gemini-style token pricing

// In-memory audio cache. Lives only for the lifetime of the service worker.
const audioCache = new Map();
const MAX_CACHE_ENTRIES = 25;

let current = null; // { key, tabId, startedAt }
let offscreenPromise = null;

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

let migrationPromise = null;

function ensureMigrated() {
  if (!migrationPromise) {
    migrationPromise = (async () => {
      const { schemaVersion } = await chrome.storage.local.get("schemaVersion");
      if (schemaVersion >= 2) return;
      const { model } = await chrome.storage.local.get("model");
      const patch = { schemaVersion: 2 };
      // Move installs that still hold the previous default onto the new default.
      if (model === "google/gemini-3.8-flash-tts") {
        patch.model = "google/gemini-3.8-flash-lite-tts";
      }
      await chrome.storage.local.set(patch);
    })().catch(() => {});
  }
  return migrationPromise;
}

async function getSettings() {
  await ensureMigrated();
  const s = await chrome.storage.local.get(DEFAULTS);
  return { ...DEFAULTS, ...s };
}

async function setSettings(partial) {
  const clean = {};
  for (const [k, v] of Object.entries(partial || {})) {
    if (k in DEFAULTS) clean[k] = v;
  }
  if (typeof clean.speed === "number") {
    clean.speed = Math.min(5, Math.max(0.25, clean.speed));
  }
  await chrome.storage.local.set(clean);
}

/* ------------------------------------------------------------------ */
/* Models                                                              */
/* ------------------------------------------------------------------ */

function normalizeModel(m) {
  return {
    id: m.id,
    name: m.name || m.id,
    voices: Array.isArray(m.supported_voices) && m.supported_voices.length
      ? m.supported_voices
      : null,
    modality: m.architecture?.modality || "",
    contextLength: m.context_length || 0,
    pricing: {
      prompt: Number(m.pricing?.prompt || 0),
      completion: Number(m.pricing?.completion || 0),
    },
  };
}

async function fetchModels() {
  const res = await fetch(MODELS_URL, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Could not load models (HTTP ${res.status})`);
  const json = await res.json();
  const models = (json.data || []).map(normalizeModel);
  await chrome.storage.local.set({
    modelsCache: { fetchedAt: Date.now(), models },
  });
  return models;
}

async function getModels(force = false) {
  if (!force) {
    const { modelsCache } = await chrome.storage.local.get("modelsCache");
    if (
      modelsCache &&
      Array.isArray(modelsCache.models) &&
      modelsCache.models.length &&
      Date.now() - modelsCache.fetchedAt < 24 * 60 * 60 * 1000
    ) {
      return modelsCache.models;
    }
  }
  return fetchModels();
}

/* ------------------------------------------------------------------ */
/* Pricing & estimates                                                 */
/* ------------------------------------------------------------------ */

function cacheKey(s, text) {
  return [s.model, s.voice || "", s.speed || 1, s.instructions || "", text].join("\u0000");
}

function pricingMode(model) {
  const p = model?.pricing?.prompt || 0;
  const c = model?.pricing?.completion || 0;
  if (c === 0 && p > 0) return "char";
  if (p === 0 && c > 0) return "second";
  if (p > 0 && c > 0) return "token";
  return "unknown";
}

async function estimateFor(text) {
  const settings = await getSettings();
  const chars = (text || "").length;
  const models = await getModels(false);
  const model =
    models.find((m) => m.id === settings.model) ||
    {
      id: settings.model,
      name: settings.model,
      pricing: { prompt: 0, completion: 0 },
      voices: null,
    };

  const key = cacheKey(settings, text);
  if (audioCache.has(key)) {
    return {
      chars,
      cost: 0,
      cached: true,
      exact: true,
      mode: "cached",
      modelLabel: model.name,
      modelId: model.id,
    };
  }

  const { calibration = {} } = await chrome.storage.local.get("calibration");
  const cal = calibration[model.id];
  if (cal && cal.costPerChar > 0) {
    return {
      chars,
      cost: chars * cal.costPerChar,
      cached: false,
      exact: false,
      calibrated: true,
      mode: "calibrated",
      modelLabel: model.name,
      modelId: model.id,
    };
  }

  const mode = pricingMode(model);
  const p = model.pricing.prompt;
  const c = model.pricing.completion;
  let cost = 0;
  let exact = false;

  if (mode === "char") {
    cost = chars * p;
    exact = true;
  } else if (mode === "second") {
    cost = (chars / CHARS_PER_SECOND) * c;
  } else if (mode === "token") {
    const textTokens = chars / CHARS_PER_TOKEN;
    const audioTokens = (chars / CHARS_PER_SECOND) * AUDIO_TOKENS_PER_SECOND;
    cost = textTokens * p + audioTokens * c;
  }

  return {
    chars,
    cost,
    cached: false,
    exact,
    mode,
    modelLabel: model.name,
    modelId: model.id,
  };
}

/**
 * Look up what a generation actually cost and fold it into a per-model,
 * per-character calibration so future estimates match reality.
 */
async function reconcileActualCost(genId, key, chars, modelId, tabId) {
  const { apiKey } = await getSettings();
  if (!apiKey || !genId) return;

  for (let attempt = 0; attempt < 4; attempt++) {
    await sleep(1200 + attempt * 1300);
    try {
      const res = await fetch(
        `${GENERATION_URL}?id=${encodeURIComponent(genId)}`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );
      if (!res.ok) continue;
      const json = await res.json();
      const cost = json?.data?.total_cost;
      if (typeof cost !== "number") continue;

      const entry = audioCache.get(key);
      if (entry) entry.cost = cost;

      if (chars > 0 && cost > 0) {
        const { calibration = {} } = await chrome.storage.local.get("calibration");
        const prev = calibration[modelId] || { costPerChar: 0, samples: 0 };
        const rate = cost / chars;
        const samples = prev.samples + 1;
        const costPerChar =
          prev.samples > 0
            ? (prev.costPerChar * prev.samples + rate) / samples
            : rate;
        calibration[modelId] = {
          costPerChar,
          samples,
          lastCost: cost,
          updatedAt: Date.now(),
        };
        await chrome.storage.local.set({ calibration });
      }

      notify(tabId, { type: "costActual", cost, chars, modelId });
      return;
    } catch (_) {
      /* retry */
    }
  }
}

/* ------------------------------------------------------------------ */
/* Offscreen playback                                                  */
/* ------------------------------------------------------------------ */

async function hasOffscreen() {
  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
    });
    return contexts.length > 0;
  }
  return false;
}

function ensureOffscreen() {
  if (!offscreenPromise) {
    offscreenPromise = (async () => {
      if (await hasOffscreen()) return true;
      await chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: ["AUDIO_PLAYBACK"],
        justification: "Play synthesized text-to-speech audio.",
      });
      return true;
    })().catch((err) => {
      offscreenPromise = null;
      throw err;
    });
  }
  return offscreenPromise;
}

async function waitForOffscreen(timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await chrome.runtime.sendMessage({ target: "offscreen", type: "ping" });
      return true;
    } catch (_) {
      await sleep(120);
    }
  }
  return false;
}

async function offscreen(message) {
  await ensureOffscreen();
  if (!(await waitForOffscreen())) {
    throw new Error("The audio player could not be started. Please try again.");
  }
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await chrome.runtime.sendMessage({ target: "offscreen", ...message });
    } catch (e) {
      lastError = e;
      await sleep(150);
    }
  }
  throw lastError || new Error("Could not reach the audio player.");
}

/* ------------------------------------------------------------------ */
/* Speech request (with adaptive output format)                        */
/* ------------------------------------------------------------------ */

async function getFormatPref(modelId) {
  const { formatPrefs = {} } = await chrome.storage.local.get("formatPrefs");
  return formatPrefs[modelId] || null;
}

async function setFormatPref(modelId, format) {
  const { formatPrefs = {} } = await chrome.storage.local.get("formatPrefs");
  formatPrefs[modelId] = format;
  await chrome.storage.local.set({ formatPrefs });
}

function looksLikeFormatError(result) {
  return (
    (result.status === 400 || result.status === 422) &&
    /mp3|pcm|response_format|format/i.test(result.message || "")
  );
}

function looksLikeSpeedError(result) {
  return (
    (result.status === 400 || result.status === 422) &&
    /speed/i.test(result.message || "")
  );
}

async function isSpeedUnsupported(modelId) {
  const { speedUnsupported = {} } = await chrome.storage.local.get("speedUnsupported");
  return Boolean(speedUnsupported[modelId]);
}

async function setSpeedUnsupported(modelId) {
  const { speedUnsupported = {} } = await chrome.storage.local.get("speedUnsupported");
  speedUnsupported[modelId] = true;
  await chrome.storage.local.set({ speedUnsupported });
}

async function requestSpeech(settings, text, format, useSpeed = true) {
  const body = { model: settings.model, input: text, response_format: format };
  if (settings.voice) body.voice = settings.voice;
  if (settings.instructions) body.instructions = settings.instructions;
  if (useSpeed && settings.speed && settings.speed !== 1) body.speed = settings.speed;

  const res = await fetch(SPEECH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "TextAloud",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let message = `Request failed (HTTP ${res.status})`;
    const raw = await res.text().catch(() => "");
    try {
      const j = JSON.parse(raw);
      message =
        j?.error?.message || (typeof j?.error === "string" ? j.error : message);
    } catch (_) {
      if (raw) message = raw.slice(0, 300);
    }
    return { ok: false, status: res.status, message };
  }

  const buffer = await res.arrayBuffer();
  if (!buffer.byteLength) {
    return { ok: false, status: 0, message: "OpenRouter returned empty audio." };
  }
  return {
    ok: true,
    buffer,
    mime: res.headers.get("Content-Type") || "",
    genId: res.headers.get("X-Generation-Id") || "",
  };
}

/* ------------------------------------------------------------------ */
/* Speak                                                               */
/* ------------------------------------------------------------------ */

async function speak(text, tabId, opts = {}) {
  text = (text || "").trim();
  if (!text) {
    notify(tabId, { type: "playbackState", state: "error", error: "Nothing selected." });
    return { ok: false, error: "empty" };
  }

  const settings = await getSettings();
  if (!settings.apiKey) {
    const error = "No OpenRouter API key yet. Click the TextAloud icon to add one.";
    notify(tabId, { type: "playbackState", state: "error", error });
    return { ok: false, error: "no-key" };
  }
  if (!settings.model) {
    const error = "No TTS model selected. Open the popup to choose one.";
    notify(tabId, { type: "playbackState", state: "error", error });
    return { ok: false, error: "no-model" };
  }

  const modelId = settings.model;
  const key = cacheKey(settings, text);
  const fromCache = audioCache.has(key);
  current = { key, tabId, startedAt: Date.now() };
  notify(tabId, { type: "playbackState", state: "loading" });

  try {
    let entry = audioCache.get(key);

    if (!entry) {
      const pref = await getFormatPref(modelId);
      const wantsSpeed = settings.speed && settings.speed !== 1;
      let useSpeed = wantsSpeed && !(await isSpeedUnsupported(modelId));
      let format = pref || "mp3";

      let result = await requestSpeech(settings, text, format, useSpeed);

      // Some TTS models (e.g. Gemini) reject mp3 and only return raw PCM.
      // Try once with pcm, then remember the working format for this model.
      if (!result.ok && !pref && looksLikeFormatError(result)) {
        format = "pcm";
        result = await requestSpeech(settings, text, format, useSpeed);
      }

      // Some models reject a non-default speed. Retry without it and remember.
      if (!result.ok && useSpeed && looksLikeSpeedError(result)) {
        useSpeed = false;
        await setSpeedUnsupported(modelId);
        result = await requestSpeech(settings, text, format, false);
      }

      if (!result.ok) throw new Error(result.message);
      if (!pref) setFormatPref(modelId, format);

      entry = {
        b64: arrayBufferToBase64(result.buffer),
        kind: format === "pcm" ? "pcm" : "mp3",
        mime: result.mime || (format === "pcm" ? "audio/pcm" : "audio/mpeg"),
        genId: result.genId,
        cost: null,
      };
      audioCache.set(key, entry);
      trimCache();

      if (result.genId) {
        reconcileActualCost(result.genId, key, text.length, modelId, tabId);
      }
    }

    await offscreen({
      type: "play",
      b64: entry.b64,
      mime: entry.mime,
      kind: entry.kind,
    });
    startPlaybackWatchdog(tabId);

    if (settings.saveAudio && !entry.saved) {
      await saveAudioFile(entry, tabId);
    }

    return { ok: true, cached: fromCache };
  } catch (err) {
    const message = err?.message || String(err);
    current = null;
    notify(tabId, { type: "playbackState", state: "error", error: message });
    return { ok: false, error: message };
  }
}

async function control(action) {
  try {
    await offscreen({ type: "control", action });
  } catch (_) {
    /* nothing playing */
  }
}

let playbackWatchdog = null;

function startPlaybackWatchdog(tabId) {
  clearTimeout(playbackWatchdog);
  playbackWatchdog = setTimeout(() => {
    if (current) {
      notify(tabId, {
        type: "playbackState",
        state: "error",
        error: "Playback did not start. Please try again.",
      });
      current = null;
    }
  }, 15000);
}

function onOffscreenState(msg) {
  if (["playing", "paused", "ended", "stopped", "error"].includes(msg.state)) {
    clearTimeout(playbackWatchdog);
    playbackWatchdog = null;
  }
  if (current?.tabId != null) {
    notify(current.tabId, {
      type: "playbackState",
      state: msg.state,
      error: msg.error,
    });
  }
  if (["ended", "stopped", "error"].includes(msg.state)) {
    current = null;
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function notify(tabId, message) {
  if (tabId == null) return;
  chrome.tabs.sendMessage(tabId, message).catch(() => {});
}

function trimCache() {
  while (audioCache.size > MAX_CACHE_ENTRIES) {
    const oldest = audioCache.keys().next().value;
    audioCache.delete(oldest);
  }
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeFilename(kind) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp =
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const rand = Math.random().toString(36).slice(2, 6);
  const ext = kind === "pcm" ? "wav" : "mp3";
  return `textaloud-${stamp}-${rand}.${ext}`;
}

async function saveAudioFile(entry, tabId) {
  const filename = makeFilename(entry.kind);
  try {
    const res = await offscreen({
      type: "save",
      b64: entry.b64,
      kind: entry.kind,
      filename,
    });
    if (res?.ok) {
      entry.saved = true;
      notify(tabId, { type: "saveStatus", ok: true, name: res.name || filename });
    } else {
      notify(tabId, {
        type: "saveStatus",
        ok: false,
        error: res?.error || "Save failed.",
      });
    }
  } catch (e) {
    notify(tabId, {
      type: "saveStatus",
      ok: false,
      error: e?.message || "Save failed.",
    });
  }
}

/* ------------------------------------------------------------------ */
/* Message routing                                                     */
/* ------------------------------------------------------------------ */

async function handleMessage(msg, sender) {
  switch (msg?.type) {
    case "getState": {
      const settings = await getSettings();
      let models = [];
      let modelsError = null;
      try {
        models = await getModels(false);
      } catch (e) {
        modelsError = e.message;
      }
      return { ok: true, settings, models, modelsError };
    }

    case "saveSettings": {
      await setSettings(msg.settings);
      const settings = await getSettings();
      await syncContextMenu(settings.contextMenu);
      return { ok: true, settings };
    }

    case "fetchModels": {
      try {
        return { ok: true, models: await fetchModels() };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }

    case "getCredits": {
      return getCredits();
    }

    case "estimate": {
      try {
        return { ok: true, estimate: await estimateFor(msg.text || "") };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }

    case "speak": {
      const tabId = msg.tabId != null ? msg.tabId : sender?.tab?.id;
      return speak(msg.text || "", tabId);
    }

    case "preview": {
      return speak(msg.text || "Hello! This is TextAloud.", null);
    }

    case "control": {
      await control(msg.action);
      return { ok: true };
    }

    default:
      return { ok: false, error: "Unknown message type" };
  }
}

async function getCredits() {
  const { apiKey } = await getSettings();
  if (!apiKey) return { ok: false, error: "no-key" };
  try {
    const res = await fetch(CREDITS_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const json = await res.json();
    const data = json?.data || json;
    const total = Number(data?.total_credits ?? 0);
    const used = Number(data?.total_usage ?? 0);
    return { ok: true, total, used, remaining: Math.max(0, total - used) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.target === "bg" && msg?.type === "offscreenState") {
    onOffscreenState(msg);
    return;
  }
  if (msg?.target) return; // messages addressed to other contexts

  handleMessage(msg, sender)
    .then(sendResponse)
    .catch((e) => sendResponse({ ok: false, error: e?.message || String(e) }));
  return true; // keep the channel open for the async response
});

/* ------------------------------------------------------------------ */
/* Context menu                                                        */
/* ------------------------------------------------------------------ */

const MENU_ID = "textaloud-read-selection";

async function syncContextMenu(enabled) {
  return new Promise((resolve) => {
    chrome.contextMenus.removeAll(() => {
      if (!enabled) return resolve();
      chrome.contextMenus.create(
        {
          id: MENU_ID,
          title: "Read aloud with TextAloud",
          contexts: ["selection"],
        },
        () => resolve()
      );
    });
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  const { contextMenu } = await getSettings();
  await syncContextMenu(contextMenu);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID && info.selectionText && tab?.id != null) {
    speak(info.selectionText, tab.id);
  }
});
