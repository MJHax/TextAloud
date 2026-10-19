# 🔊 TextAloud

Highlight some text, click a button, and hear it read aloud — using a
text-to-speech voice from [OpenRouter](https://openrouter.ai). It even shows the
price before you commit. A Chrome extension (Manifest V3).

---

## What it does

- 🔦 **Highlight text → it appears** a little card with a **Read aloud** button.
- 💸 **See the cost first** — like `≈ $0.0003 · 84 chars` — before you click.
- 🗣️ **You pick the voice** — 35+ models, each with its own voice list.
- ⏯️ **Full control** — pause, stop, or cancel while it's still generating.
- 🖱️ **Drag the card** wherever you like; it remembers where you put it.
- 💾 **Save the audio** (optional) to a folder you choose.

---

## Install (about a minute)

1. Open `chrome://extensions` in Chrome.
2. Flip on **Developer mode** (top-right).
3. Click **Load unpacked** and pick this folder.
4. Click the TextAloud icon in the toolbar, paste your OpenRouter API key
   ([get one here](https://openrouter.ai/keys)), and hit **Save & connect**.

That's it. Now highlight some text on any page.

> Using it just for yourself is totally fine — no store needed. You'll only see a
> minor "developer mode" nudge from Chrome now and then.

---

## Using it

1. Select some text on a page.
2. A small card pops up near your selection.
3. Click **🔊 Read aloud**. That's it.

**On the card:**

| Button | What it does |
| --- | --- |
| **🔊 Read aloud** | Start reading the highlighted text |
| **⏸ / ▶** | Pause and resume |
| **⏹** | Stop playback |
| **✕** | Cancel while it's still generating |
| **🔑 Re-grant folder access** | Only shows up if saving files needs a quick re-confirm |

**Handy bits:**
- **Drag the card** by grabbing anywhere that isn't a button. It stays put across
  selections, tabs, and restarts.
- **Double-click** the card to snap it back to following your selection.
- **Right-click** any selected text → **Read aloud with TextAloud**.

Selections are capped at **3,000 characters** per read, to keep every provider
happy.

---

## Choosing a voice

Open the toolbar popup (click the extension icon):

- The **Model** menu lists every text-to-speech model **with its price** next to
  it. The default is **Google Gemini 3.8 Flash Lite TTS**.
- The **Voice** menu fills up with that model's voices. Change the model and the
  voice list changes with it.

### "Can I pick a specific gender / accent?"

Sort of — it depends on the model, because each provider names its voices
differently. Some make it obvious:

| Model | Example voices | What you can tell |
| --- | --- | --- |
| Microsoft MAI-Voice | `en-US-Harper`, `de-DE-Klaus` | language + name |
| Deepgram Aura-2 | `aura-2-thalia-en`, `aura-2-agathe-fr` | name + language |
| Kokoro 82M | `af_heart`, `am_adam`, `bf_emma` | a/b = US/UK, f/m = female/male |
| MiniMax | `English_calm_woman`, `English_mature_boss` | style + gender |
| ElevenLabs v4 | `george`, `sarah`, `bella` | named voices |

So for a specific accent or gender, a multi-language model like **MAI-Voice** or
**Aura-2** gives you the most control. Use **🔊 Test voice** to hear a sample
before settling.

**Two more dials:**
- **Delivery instructions** — nudge the tone, e.g. *"warm and friendly"* or
  *"slow and calm"* (works on Gemini, OpenAI audio, and Fish Audio models).
- **Speed** — anywhere from **0.25× to 5×**. If a model doesn't support custom
  speed, TextAloud quietly retries without it and remembers for next time.

---

## Saving the audio (optional)

Turn on **Save generated audio files** in the popup. A settings tab opens so you
can pick a folder — it uses your operating system's normal folder dialog.

From then on, every clip you generate is saved there as:

```
textaloud-20261018-143022-a9f3.mp3     (or .wav for PCM-only models)
```

- The card shows **💾 Saved …** when it lands.
- Already-generated text doesn't get saved twice.
- Folder access is checked each browser session. If Chrome ever needs you to
  re-confirm it, a **Re-grant folder access** button appears (in the card, the
  popup, and the settings tab). It's a **one click** fix — you don't re-pick the
  folder.
- **Forget** clears the folder and turns saving off.

> Why the settings *tab* and not the popup? A native file dialog steals focus,
> and Chrome closes extension popups the moment they lose focus. A tab stays
> open, so the picker works.

---

## What gets stored (the short version)

- 🔑 Your OpenRouter **API key** lives in the extension's own storage
  (`chrome.storage.local`), which websites can't read. It's only ever sent to
  `openrouter.ai`.
- ⚙️ Your settings (model, voice, speed, toggles) are stored the same way.
- 🎧 **Audio is not saved anywhere** unless you turn on saving — otherwise it
  sits in a small in-memory cache (25 clips max) and disappears.
- 📁 When saving is on, files go **only** to the folder you picked.

No accounts, no servers, no tracking. See [PRIVACY.md](PRIVACY.md) for the full
story.

---

## How it works (the simple version)

```
You highlight text
      │
      ▼
content.js   → the little card (Read / pause / stop, price estimate)
      │
      ▼
background.js → talks to OpenRouter, holds your key, works out the price
      │
      ▼
offscreen.js  → actually plays the sound
      │
      ▼
popup.js      → your settings (model, voice, save, etc.)
```

**What it asks OpenRouter for:**
- the list of speech models (with voices and prices),
- the speech itself (`POST /audio/speech`, returns an audio clip),
- the real cost afterwards, so future estimates get more accurate.

**About the price estimate:** most models charge **per character**, so the
estimate is exact. A few (like Gemini) charge per *token*, and some per *second* —
those start as a rough guess, then TextAloud checks what you were *actually*
charged and tunes itself from then on.

---

## Troubleshooting

- **Nothing appears when I highlight** — is the extension enabled? Reload the
  page (content scripts load at page load). Check the "floating button" toggle.
- **"No API key"** — open the popup and add one.
- **A red error on the card** — that's the real message from OpenRouter (a voice
  the model doesn't support, a rate limit, etc.).
- **Stuck on "Generating audio…"** — reload the extension in `chrome://extensions`
  and try again. It also gives up with an error after 15 seconds rather than
  hanging forever.
- **The voice menu is missing** — some models have no preset voices (they use the
  provider's default, or support voice cloning). You'll get a text box instead.
- **No sound** — check your system volume. Audio plays in the extension itself,
  so page restrictions don't get in the way.

---

## For tinkerers

- **Build a clean upload ZIP:** `python build.py` → `dist/textaloud-v<version>.zip`
- **Publishing?** ready-to-paste store copy + a checklist live in
  [`store/listing.md`](store/listing.md), with a promo tile and marquee in
  `store/`.
- **Changes:** see [CHANGELOG.md](CHANGELOG.md).
- **Files:** `manifest.json`, `background.js`, `content.js`, `offscreen.*`,
  `popup.*`, `options.*`, `filestore.js`, `icons/`.
- **License:** [GPL-3.0-or-later](LICENSE).

Contributions and ideas welcome. Happy listening! 🎧
