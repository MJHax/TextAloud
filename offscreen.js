/**
 * TextAloud — offscreen document.
 *
 * Runs in an extension page (not a service worker) so it can own an <audio>
 * element and object URLs, then play / pause / stop synthesized speech. All
 * state changes are reported back to the background worker.
 */

let audio = null;
let currentUrl = null;

function report(state, error) {
  chrome.runtime
    .sendMessage({ target: "bg", type: "offscreenState", state, error })
    .catch(() => {});
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * OpenRouter returns raw PCM (audio/pcm) for some models. Wrap signed 16-bit
 * mono samples in a WAV container so a plain <audio> element can play them.
 */
function pcmToWav(pcmBytes, sampleRate = 24000, channels = 1, bits = 16) {
  const dataLen = pcmBytes.length;
  const buffer = new ArrayBuffer(44 + dataLen);
  const view = new DataView(buffer);
  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataLen, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, (sampleRate * channels * bits) / 8, true);
  view.setUint16(32, (channels * bits) / 8, true);
  view.setUint16(34, bits, true);
  writeStr(36, "data");
  view.setUint32(40, dataLen, true);
  new Uint8Array(buffer, 44).set(pcmBytes);

  return new Blob([buffer], { type: "audio/wav" });
}

function release() {
  if (audio) {
    audio.onplaying = audio.onended = audio.onerror = audio.onpause = null;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    audio = null;
  }
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
}

function play(b64, mime, kind) {
  release();
  try {
    const bytes = base64ToBytes(b64);
    const blob =
      kind === "pcm" ? pcmToWav(bytes) : new Blob([bytes], { type: mime || "audio/mpeg" });

    currentUrl = URL.createObjectURL(blob);
    audio = new Audio(currentUrl);
    audio.preload = "auto";

    audio.onplaying = () => report("playing");
    audio.onpause = () => {
      if (audio && !audio.ended) report("paused");
    };
    audio.onended = () => {
      report("ended");
      release();
    };
    audio.onerror = () => {
      report("error", "Playback failed (unsupported audio).");
      release();
    };

    audio.play().catch((err) => {
      report("error", err?.message || "Playback was blocked.");
      release();
    });
  } catch (err) {
    report("error", err?.message || "Could not decode audio.");
    release();
  }
}

function control(action) {
  if (!audio) return;
  if (action === "pause") audio.pause();
  else if (action === "resume") audio.play().catch(() => report("paused"));
  else if (action === "stop") {
    report("stopped");
    release();
  }
}

async function save(b64, kind, filename) {
  try {
    const dir = await self.TextAloudFiles.getDir();
    if (!dir) {
      return {
        ok: false,
        code: "no-folder",
        error: "No save folder selected — choose one in the options page.",
      };
    }

    if (dir.queryPermission) {
      const perm = await dir.queryPermission({ mode: "readwrite" });
      if (perm !== "granted") {
        return {
          ok: false,
          code: "permission",
          error: "Folder access needs re-confirming.",
        };
      }
    }

    const bytes = base64ToBytes(b64);
    const blob =
      kind === "pcm" ? pcmToWav(bytes) : new Blob([bytes], { type: "audio/mpeg" });

    const fileHandle = await dir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return { ok: true, name: filename };
  } catch (e) {
    const code = e?.name === "NotAllowedError" ? "permission" : "error";
    return { ok: false, code, error: e?.message || "Save failed." };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target !== "offscreen") return;
  if (msg.type === "play") {
    play(msg.b64, msg.mime, msg.kind);
    sendResponse({ ok: true });
  } else if (msg.type === "control") {
    control(msg.action);
    sendResponse({ ok: true });
  } else if (msg.type === "save") {
    save(msg.b64, msg.kind, msg.filename).then(sendResponse);
    return true;
  } else if (msg.type === "ping") {
    sendResponse({ ok: true });
  }
});
