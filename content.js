/**
 * TextAloud — content script.
 *
 * Watches for text selections and shows a floating bubble with a "Read aloud"
 * button and a live price estimate. All synthesis happens in the background;
 * this script only captures text and reflects playback state.
 */

(() => {
  if (window.__textaloudInjected) return;
  window.__textaloudInjected = true;

  const MAX_CHARS = 3000;

  let settings = { showEstimate: true, showButton: true };
  let host = null;
  let shadow = null;
  let bubble = null;
  let estimateEl = null;
  let toastEl = null;
  let readBtn = null;
  let pauseBtn = null;
  let stopBtn = null;

  let selectionText = "";
  let lastRect = null;
  let state = "idle";
  let estimateToken = 0;

  /* ---------------------------------------------------------------- */
  /* Boot                                                              */
  /* ---------------------------------------------------------------- */

  async function boot() {
    await loadState();
    buildUI();

    document.addEventListener("mouseup", onMouseUp, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll, true);

    chrome.runtime.onMessage.addListener(onRuntimeMessage);
    chrome.storage.onChanged.addListener(onStorageChanged);
  }

  function onStorageChanged(changes, area) {
    if (area !== "local") return;
    for (const key of ["showEstimate", "showButton"]) {
      if (changes[key]) settings[key] = changes[key].newValue;
    }
    if (settings.showButton === false) hideBubble();
  }

  async function loadState() {
    try {
      const res = await chrome.runtime.sendMessage({ type: "getState" });
      if (res?.ok && res.settings) settings = res.settings;
    } catch (_) {
      /* extension reloaded; keep defaults */
    }
  }

  function send(message) {
    try {
      return chrome.runtime.sendMessage(message);
    } catch (_) {
      return Promise.resolve({ ok: false, error: "Extension was reloaded." });
    }
  }

  /* ---------------------------------------------------------------- */
  /* UI                                                                */
  /* ---------------------------------------------------------------- */

  function buildUI() {
    host = document.createElement("div");
    host.id = "textaloud-root";
    host.style.cssText =
      "all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;";

    shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = `
      * { box-sizing: border-box; }
      .wrap {
        position: fixed;
        top: 0; left: 0;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        display: none;
      }
      .wrap.visible { display: block; }
      .bubble {
        min-width: 190px;
        max-width: 320px;
        background: #0f172a;
        color: #f8fafc;
        border-radius: 12px;
        padding: 10px 12px;
        box-shadow: 0 10px 30px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.06);
        display: flex;
        flex-direction: column;
        gap: 7px;
        font-size: 13px;
        line-height: 1.35;
      }
      .row { display: flex; align-items: center; gap: 7px; }
      .grow { flex: 1; }
      button {
        font: inherit;
        font-weight: 600;
        color: #fff;
        background: linear-gradient(135deg,#7c3aed,#2563eb);
        border: 0;
        border-radius: 8px;
        padding: 7px 11px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        white-space: nowrap;
      }
      button:hover { filter: brightness(1.08); }
      button:disabled { opacity: .6; cursor: default; }
      button.ghost {
        background: rgba(255,255,255,.10);
        box-shadow: inset 0 0 0 1px rgba(255,255,255,.12);
      }
      button.icon { padding: 7px 9px; }
      .meta { font-size: 11.5px; color: #c7d2fe; }
      .meta.warn { color: #fca5a5; }
      .meta .spinner {
        display: inline-block;
        width: 11px; height: 11px;
        border: 2px solid rgba(199,210,254,.35);
        border-top-color: #c7d2fe;
        border-radius: 50%;
        animation: spin .7s linear infinite;
        vertical-align: -1px;
        margin-right: 5px;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      .title {
        font-size: 10.5px;
        text-transform: uppercase;
        letter-spacing: .05em;
        color: #94a3b8;
      }
      .toast { font-size: 11.5px; color: #86efac; }
      .toast.error { color: #fca5a5; }
    `;
    shadow.appendChild(style);

    bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.innerHTML = `
      <div class="row">
        <span class="title grow">TextAloud</span>
      </div>
      <div class="row">
        <button class="read"></button>
        <button class="ghost icon pause" hidden title="Pause / Resume"></button>
        <button class="ghost icon stop" hidden title="Stop"></button>
      </div>
      <div class="meta"></div>
      <div class="toast" hidden></div>
    `;

    readBtn = bubble.querySelector(".read");
    pauseBtn = bubble.querySelector(".pause");
    stopBtn = bubble.querySelector(".stop");
    estimateEl = bubble.querySelector(".meta");
    toastEl = bubble.querySelector(".toast");

    readBtn.addEventListener("mousedown", (e) => e.preventDefault());
    readBtn.addEventListener("click", onReadClick);
    pauseBtn.addEventListener("click", onPauseClick);
    stopBtn.addEventListener("click", onStopClick);

    const wrap = document.createElement("div");
    wrap.className = "wrap";
    wrap.appendChild(bubble);
    shadow.appendChild(wrap);
    host.__wrap = wrap;

    (document.body || document.documentElement).appendChild(host);
  }

  let errorMessage = "";

  function setState(next, error) {
    state = next;
    if (next === "error") errorMessage = error || "";

    readBtn.hidden = next !== "idle" && next !== "error";
    pauseBtn.hidden = !(next === "playing" || next === "paused");
    stopBtn.hidden = !(next === "playing" || next === "paused");

    readBtn.disabled = next === "loading";
    readBtn.textContent = next === "error" ? "↻ Try again" : "🔊 Read aloud";
    pauseBtn.textContent = next === "paused" ? "▶" : "⏸";

    renderMeta();
  }

  function renderMeta() {
    estimateEl.classList.toggle("warn", state === "error");

    if (state === "loading") {
      estimateEl.textContent = "";
      const spinner = document.createElement("span");
      spinner.className = "spinner";
      estimateEl.append(spinner, document.createTextNode("Generating audio…"));
      return;
    }

    let text = "";
    if (state === "playing") text = "🔈 Playing…";
    else if (state === "paused") text = "⏸ Paused";
    else if (state === "error") {
      text = errorMessage ? `⚠ ${errorMessage}` : "⚠ Something went wrong.";
    } else {
      text = lastEstimateText || "";
    }
    estimateEl.textContent = text;
  }

  let lastEstimateText = "";
  let toastTimer = null;

  function showToast(text, isError) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.toggle("error", !!isError);
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.hidden = true;
    }, 5000);
    requestAnimationFrame(positionBubble);
  }

  function fmtCost(cost) {
    if (typeof cost !== "number" || !isFinite(cost)) return "$?";
    if (cost === 0) return "$0.00";
    if (cost < 0.0001) return "$" + cost.toExponential(2);
    if (cost < 1) return "$" + cost.toFixed(4);
    return "$" + cost.toFixed(2);
  }

  function positionBubble() {
    if (!lastRect || !host.__wrap) return;
    const wrap = host.__wrap;
    const pad = 8;
    const bw = bubble.offsetWidth || 200;
    const bh = bubble.offsetHeight || 90;

    let left = lastRect.left + lastRect.width / 2 - bw / 2;
    left = Math.max(pad, Math.min(left, window.innerWidth - bw - pad));

    let top;
    if (lastRect.top - bh - 10 >= pad) {
      top = lastRect.top - bh - 10;
    } else {
      top = Math.min(lastRect.bottom + 10, window.innerHeight - bh - pad);
    }
    top = Math.max(pad, top);

    wrap.style.left = `${Math.round(left)}px`;
    wrap.style.top = `${Math.round(top)}px`;
  }

  function showBubble(rect) {
    lastRect = rect;
    host.__wrap.classList.add("visible");
    requestAnimationFrame(positionBubble);
  }

  function hideBubble() {
    if (!host?.__wrap) return;
    host.__wrap.classList.remove("visible");
    if (state === "idle" || state === "error") {
      selectionText = "";
      lastEstimateText = "";
    }
  }

  /* ---------------------------------------------------------------- */
  /* Selection handling                                                */
  /* ---------------------------------------------------------------- */

  function onMouseUp(event) {
    if (settings.showButton === false) return;
    if (event.target === host || host?.contains(event.target)) return;

    // Let the browser finalize the selection first.
    setTimeout(async () => {
      const sel = window.getSelection();
      const text = sel ? sel.toString().replace(/\s+/g, " ").trim() : "";
      if (!text || !sel || sel.rangeCount === 0) {
        if (state === "idle" || state === "error") hideBubble();
        return;
      }

      let rect;
      try {
        rect = sel.getRangeAt(0).getBoundingClientRect();
      } catch (_) {
        return;
      }
      if (!rect || (!rect.width && !rect.height)) return;

      if (text.length > MAX_CHARS) {
        selectionText = "";
        lastEstimateText = `Selection too long (${text.length.toLocaleString()} chars, max ${MAX_CHARS.toLocaleString()})`;
        setState("idle");
        renderMeta();
        showBubble(rect);
        return;
      }

      selectionText = text;
      setState(state === "playing" || state === "paused" ? state : "idle");
      lastEstimateText = "";
      renderMeta();
      showBubble(rect);
      requestEstimate(text);
    }, 0);
  }

  async function requestEstimate(text) {
    if (!settings.showEstimate) return;
    const token = ++estimateToken;
    lastEstimateText = "…";
    renderMeta();

    const res = await send({ type: "estimate", text });
    if (token !== estimateToken || res?.ok !== true || !res.estimate) return;

    const e = res.estimate;
    if (e.cached) {
      lastEstimateText = `$0.00 · cached · ${e.chars} chars`;
    } else if (!e.cost) {
      lastEstimateText = `${e.chars} chars`;
    } else {
      const approx = e.mode === "char" ? "" : "≈ ";
      lastEstimateText = `${approx}${fmtCost(e.cost)} · ${e.chars} chars`;
    }
    if (state === "idle") renderMeta();
    requestAnimationFrame(positionBubble);
  }

  function onReadClick() {
    if (!selectionText) return;
    setState("loading");
    send({ type: "speak", text: selectionText });
  }

  function onPauseClick() {
    send({ type: "control", action: state === "paused" ? "resume" : "pause" });
  }

  function onStopClick() {
    send({ type: "control", action: "stop" });
  }

  function onKeyDown(event) {
    if (event.key === "Escape") hideBubble();
  }

  function onScroll() {
    if (state === "playing" || state === "paused" || state === "loading") return;
    hideBubble();
  }

  function onRuntimeMessage(msg) {
    if (!msg || !msg.type) return;

    if (msg.type === "playbackState") {
      if (settings.showButton === false) return;
      const playbackState =
        msg.state === "ended" || msg.state === "stopped" ? "idle" : msg.state;
      setState(playbackState, msg.error);
      if (playbackState === "playing" || playbackState === "paused") {
        showBubble(lastRect || { left: 40, top: 40, width: 0, height: 0, bottom: 40 });
      }
      return;
    }

    if (msg.type === "saveStatus") {
      if (settings.showButton === false) return;
      if (msg.ok) showToast(`💾 Saved ${msg.name}`);
      else showToast(`⚠ ${msg.error}`, true);
      return;
    }

    if (msg.type === "costActual" && typeof msg.cost === "number") {
      lastEstimateText = `Actual: ${fmtCost(msg.cost)} · ${msg.chars} chars`;
      if (state === "idle" || state === "playing" || state === "paused") renderMeta();
    }
  }

  boot();
})();
