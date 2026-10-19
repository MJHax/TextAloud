# TextAloud — OpenRouter TTS

Highlight text on any page and have it read aloud by a text-to-speech model from
[OpenRouter](https://openrouter.ai), with a **price estimate shown before you
click**. Chrome extension, Manifest V3.

## Install (unpacked)

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this folder (`C:\Users\caleb\TextAloud`).
4. Click the TextAloud toolbar icon, paste your OpenRouter API key
   ([create one](https://openrouter.ai/keys)), and press **Save & connect**.
5. Pick a model and voice in the popup.

## Use

- **Highlight text** on any page. A small bubble appears with:
  `🔊 Read aloud` and `≈ $0.0021 · 412 chars`.
- Click **Read aloud**. Playback controls (pause / stop) replace the button while
  it plays.
- You can also **right-click** a selection → **Read aloud with TextAloud**.
- After each request the real cost is fetched from OpenRouter and used to
  calibrate future estimates for that model.

## How it works

```
content.js   selection detection + floating bubble (Shadow DOM)
             └─ sends {type:"estimate"} and {type:"speak"} to background
background.js  holds the API key; fetches models, estimates cost,
             calls /api/v1/audio/speech, reconciles actual cost,
             relays playback state back to the tab
offscreen.js   plays the returned mp3 in an extension page (no page CSP issues)
popup.js       API key setup, model/voice picker, settings
```

### API calls used

- `GET  /api/v1/models?output_modalities=speech` — lists TTS models with their
  `supported_voices` and pricing.
- `POST /api/v1/audio/speech` — `{ model, input, voice, response_format:"mp3" }`,
  returns a raw audio byte stream plus an `X-Generation-Id` header.
- `GET  /api/v1/generation?id=…` — the actual `total_cost`, used to self-tune
  the estimator.
- `GET  /api/v1/credits` — remaining credit shown in the popup.

### Pricing model

- Most TTS models price `pricing.prompt` **per character** →
  `estimate = chars × prompt` (exact).
- Gemini-style models price per **token** (text in + audio out); Seed-style
  price per **second**. Those are estimated from heuristics on first use, then
  replaced by the calibrated real rate.

### Output format

Some models (notably Gemini TTS) reject `mp3` and only return raw `pcm`. The
worker tries `mp3` first, automatically retries with `pcm` on a format error,
and remembers the working format per model in `chrome.storage` (the offscreen
player wraps PCM in a WAV container so it plays through a normal `<audio>`).

## Notes & limitations

- Selections are limited to **3000 characters** per read (safe across providers).
- Speed is adjustable from **0.25× to 5×**. Models that don’t support custom
  speed are detected automatically: the request is retried without it and the
  model is remembered as speed-less.
- Content scripts run in the top frame only (not inside iframes).
- Generated audio is **never written to disk** — it lives in an in-memory cache
  (max 25 clips) and a transient Blob during playback.
- The audio cache is in-memory and lasts while the service worker is alive.
- Your API key is stored in `chrome.storage.local` and only ever sent to
  `openrouter.ai`.

## Troubleshooting

- **Nothing happens on highlight** — confirm the extension is enabled, reload the
  page (content scripts load at page load), and check the “floating button”
  toggle in the popup.
- **“No API key”** — open the popup and add one.
- **Request failed (HTTP 4xx)** — the error text from OpenRouter is shown in the
  bubble (e.g. a voice that the chosen model doesn’t support). Models that only
  support `pcm` are handled automatically.
- **Stuck on “Generating audio…”** — the worker now waits for the offscreen
  player to be ready and reports an error after 15s instead of hanging. If it
  persists, reload the extension in `chrome://extensions` (the service worker
  also restarts) and try again.
- **No sound** — check the system volume; offscreen playback is used so page
  restrictions don’t apply.
