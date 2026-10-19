# TextAloud

**Highlight text on any page and hear it read aloud, using text-to-speech
models from [OpenRouter](https://openrouter.ai).** You see the price before you
click, you pick the voice, and your API key never leaves your browser except to
go to OpenRouter.

A Chrome extension (Manifest V3). No accounts, no backend, no tracking.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4)

---

## Features

- **Highlight to read.** Select text and a small card appears with a
  **Read aloud** button.
- **Price up front.** The card shows an estimate like `≈ $0.0003 · 84 chars`
  before you spend anything.
- **Your choice of voice.** Pick from 35+ TTS models, each with its own voice
  list.
- **Full playback control.** Pause, resume, stop, or cancel while audio is
  still generating.
- **A card that stays put.** Drag it anywhere. It remembers the spot across
  tabs and restarts.
- **Optional saving.** Keep each clip as an MP3 or WAV in a folder you choose.

---

## Security and privacy

TextAloud handles a paid API key, so it is built to touch as little as
possible.

| | |
| --- | --- |
| **No backend** | The extension talks to `openrouter.ai` and nothing else. The developer runs no server and receives no data. |
| **Key isolation** | Your API key is kept in `chrome.storage.local`, which web pages can't read. Only the background service worker sends it anywhere. The on-page content script runs in Chrome's isolated world, never requests the key, and gets no access to it from the page's own scripts. The key isn't synced to your Google account. |
| **One network destination** | `host_permissions` is limited to `https://openrouter.ai/*`. Every request goes from your browser straight to OpenRouter over HTTPS. |
| **No telemetry** | There are no analytics, trackers, or remote code. Everything that runs is in this repository. |
| **Minimal permissions** | `storage`, `contextMenus`, and `offscreen`, plus a content script to detect selections. Each one is explained in [PRIVACY.md](PRIVACY.md#permissions). |
| **Nothing written to disk by default** | Audio stays in a small in-memory cache (25 clips at most) and is gone when the browser closes. Files are written only if you turn on saving, and only to the folder you picked. |
| **Sandboxed file access** | Saving uses Chrome's File System Access API. The extension can reach only the folder you granted, and Chrome asks you to re-confirm that access each browser session. |

**What goes to OpenRouter:** the text you asked to hear, your chosen model,
voice, speed, and instructions, and your API key in the `Authorization`
header. Requests also include
[app attribution headers](https://openrouter.ai/docs/app-attribution)
(`HTTP-Referer`, `X-OpenRouter-Title`, `X-OpenRouter-Categories`). These name
TextAloud as the calling app and contain nothing about you. What OpenRouter
does with a request is covered by
[its privacy policy](https://openrouter.ai/privacy).

**Protect your key.** OpenRouter lets you set a
[credit limit per key](https://openrouter.ai/keys). Creating a separate key
just for TextAloud, with a modest limit, is a sensible habit for any
browser extension.

Found a security problem? Please report it privately (see
[Reporting a vulnerability](#reporting-a-vulnerability)) and not in a public
issue.

Full details: [PRIVACY.md](PRIVACY.md).

---

## Install

### From source (about a minute)

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the project folder.
5. Click the TextAloud icon in the toolbar, paste your OpenRouter API key
   ([get one here](https://openrouter.ai/keys)), and click **Save & connect**.

Now highlight some text on any page.

> Running it unpacked for yourself is fine. Chrome will occasionally remind you
> that a developer-mode extension is installed.

---

## Usage

1. Select some text on a page.
2. A small card appears near your selection.
3. Click **Read aloud**.

| Control | What it does |
| --- | --- |
| **Read aloud** | Reads the highlighted text |
| **⏸ / ▶** | Pause and resume |
| **⏹** | Stop playback |
| **✕** | Cancel while audio is still generating |
| **Re-grant folder access** | Appears only when Chrome needs you to re-confirm the save folder |

**Tips:**

- **Drag the card** by any part that isn't a button. It stays where you put it
  across selections, tabs, and restarts.
- **Double-click** the card to make it follow your selection again.
- **Right-click** any selection and choose **Read aloud with TextAloud**.

Each read is capped at **3,000 characters** so every provider accepts it.

---

## Choosing a voice

Open the toolbar popup:

- The **Model** menu lists every text-to-speech model with its price. The
  default is **Google Gemini 3.8 Flash Lite TTS**.
- The **Voice** menu shows that model's voices and updates when you change
  the model.

### Picking a gender or accent

How easy this is depends on the model, because every provider names its voices
differently:

| Model | Example voices | What the name tells you |
| --- | --- | --- |
| Microsoft MAI-Voice | `en-US-Harper`, `de-DE-Klaus` | language + name |
| Deepgram Aura-2 | `aura-2-thalia-en`, `aura-2-agathe-fr` | name + language |
| Kokoro 82M | `af_heart`, `am_adam`, `bf_emma` | a/b = US/UK, f/m = female/male |
| MiniMax | `English_calm_woman`, `English_mature_boss` | style + gender |
| ElevenLabs v4 | `george`, `sarah`, `bella` | named voices |

Multi-language models such as **MAI-Voice** and **Aura-2** give you the most
control. Use **Test voice** to hear a sample first.

**Two more settings:**

- **Delivery instructions** steer the tone, for example *"warm and friendly"*
  or *"slow and calm"*. Supported on Gemini, OpenAI audio, and Fish Audio
  models.
- **Speed** goes from **0.25× to 5×**. If a model doesn't accept a custom
  speed, TextAloud retries without it and remembers that for next time.

---

## Saving audio (optional)

Turn on **Save generated audio files** in the popup. A settings tab opens where
you choose a folder with your operating system's folder dialog. Each new clip
is then saved as:

```
textaloud-20261018-143022-a9f3.mp3     (or .wav for PCM-only models)
```

- The card shows **Saved …** once the file is written.
- Replaying the same text doesn't save a second copy.
- Chrome checks folder access each browser session. If it needs you to
  re-confirm, a **Re-grant folder access** button appears in the card, the
  popup, and the settings tab. One click fixes it, and you don't have to pick
  the folder again.
- **Forget** clears the folder and turns saving off.

> **Why a settings tab instead of the popup?** The native folder dialog takes
> focus, and Chrome closes an extension popup as soon as it loses focus. A tab
> stays open, so the dialog can finish.

---

## How it works

```
You highlight text
      │
      ▼
content.js    → the on-page card (read / pause / stop, price estimate)
      │
      ▼
background.js → holds the API key, calls OpenRouter, estimates cost
      │
      ▼
offscreen.js  → plays the audio
      │
popup.js      → settings (model, voice, saving, etc.)
```

**OpenRouter endpoints used:**

- `GET /models?output_modalities=speech` lists speech models, voices, and prices.
- `POST /audio/speech` generates the audio clip.
- `GET /generation` returns the actual cost of a clip, which improves later
  estimates.
- `GET /credits` shows your remaining balance in the popup.

**About the estimate:** most models charge per character, so the estimate is
exact. Some (like Gemini) charge per token and a few charge per second of
audio. For those, TextAloud starts with an approximation, then compares it
with what you were actually charged and adjusts future estimates.

---

## Troubleshooting

- **Nothing appears when I highlight text.** Check that the extension is
  enabled and the floating-button toggle is on, then reload the page (content
  scripts load with the page).
- **"No API key".** Open the popup and add your key.
- **A red error on the card.** That's OpenRouter's own error message, for
  example an unsupported voice or a rate limit.
- **Stuck on "Generating audio…".** TextAloud gives up after 15 seconds. If it
  keeps happening, reload the extension in `chrome://extensions`.
- **No voice menu.** Some models have no preset voices and use the provider's
  default. You'll get a text box instead.
- **No sound.** Check your system volume. Audio plays inside the extension, so
  page restrictions don't affect it.

---

## Development

- **Build a store-ready ZIP:** `python build.py` writes
  `dist/textaloud-v<version>.zip`, which contains only the files Chrome needs
  plus `LICENSE` and `NOTICE`.
- **Store listing:** copy, permission justifications, and a checklist are in
  [`store/listing.md`](store/listing.md). Promo tiles and screenshots are in [`assets/`](assets).
- **Changes:** see [CHANGELOG.md](CHANGELOG.md).
- **Layout:** `manifest.json`, `background.js`, `content.js`, `offscreen.*`,
  `popup.*`, `options.*`, `filestore.js`, `icons/`.

Contributions are welcome. Please open an issue first for anything large. By
submitting a pull request you agree to license your contribution under the
same GPL-3.0-or-later terms as the project.

### Reporting a vulnerability

Please use GitHub's
[private vulnerability reporting](https://github.com/MJHax/TextAloud/security/advisories/new)
instead of opening a public issue. I'll reply as soon as I can.

---

## License

TextAloud is free software, licensed under the
[GNU General Public License v3.0 or later](LICENSE). You can use, study,
modify, and share it. If you distribute a modified version, you must release
its source code under the same license and keep the original copyright
notices.

The **TextAloud name, logo, and icons are not covered by the GPL.** Forks are
welcome but need their own name and icon. See [NOTICE](NOTICE).

TextAloud is an independent project and is not affiliated with or endorsed by
OpenRouter.

Happy listening.
