# Chrome Web Store — listing kit

Copy-paste material for the store submission. Everything here is optional if
you're only using the extension yourself.

## Basics

- **Name:** TextAloud: Read Aloud with AI Voices
- **Category:** Accessibility (alternatively: Productivity)
- **Language:** English
- **Homepage / support URL:** your GitHub repo
- **Privacy policy URL:** link to `PRIVACY.md` (host it on GitHub Pages or the
  repo's blob URL)

## Short description (132 char max)

```
Highlight text on any page and hear it read aloud with OpenRouter voices. See the price before you click.
```

## Detailed description

```
TextAloud reads the web out loud, using text-to-speech voices from OpenRouter.

HOW IT WORKS
1. Highlight any text on any page.
2. A small card appears with a Read aloud button and an up-front price estimate.
3. Click it — TextAloud generates the audio and plays it right there.

CHOOSE YOUR VOICE
Pick from 30+ text-to-speech models (Google, OpenAI, ElevenLabs, MiniMax,
Microsoft, Deepgram and more). Each model brings its own voices, and the list
fills in automatically. You can also nudge tone with delivery instructions and
set the speed from 0.25x to 5x.

NICE TOUCHES
• See the cost before you commit (and it gets more accurate as you use it).
• Pause, stop, or cancel a generation in progress.
• Drag the card wherever you like — it remembers.
• Right-click any selection for "Read aloud with TextAloud".
• Optionally save every clip as an MP3 or WAV to a folder you choose.

PRIVATE BY DESIGN
Your OpenRouter API key is stored only in your own browser and is sent only to
openrouter.ai. There are no accounts, no servers, and no tracking. Audio is not
saved anywhere unless you turn saving on.

WHAT YOU'LL NEED
An OpenRouter API key (openrouter.ai/keys) and a little credit on it. Usage is
billed by OpenRouter per your chosen model — often well under a cent per read.
```

## Permission justifications (review form)

| Permission | Why it's needed |
| --- | --- |
| `storage` | Save your API key, model/voice choice, speed, and preferences locally. |
| `contextMenus` | Adds the “Read aloud with TextAloud” right-click item. |
| `offscreen` | Plays the generated audio in an extension page so page restrictions don’t block it. |
| Host: `https://openrouter.ai/*` | Calls OpenRouter’s speech and models API. |
| Content scripts on all sites | Detects text selections and shows the read button on any page. |

## Data usage disclosures

- **Does not collect or sell user data.** The developer operates no server.
- **Stores locally:** the API key and settings (`chrome.storage.local`).
- **Transmits to a third party:** the selected text, chosen model/voice, and the
  API key are sent to `https://openrouter.ai` to synthesize speech.
- **Optional file saving:** writes audio only to a folder the user explicitly
  picks, via the browser's File System Access API.

## Screenshots to capture (need at least 1, 1280×800 or 640×400)

1. The toolbar popup open with a model selected (shows prices).
2. The little card over a real article with a selection highlighted.
3. The options tab with a save folder chosen.
4. Optional: a few saved `textaloud-*.mp3` files in a folder.

## Submission checklist

- [ ] `python build.py` → upload `dist/textaloud-v1.0.0.zip`
- [ ] Store icon (128×128) — `icons/icon128.png`
- [ ] Small promo tile (440×280) — `assets/promo-440x280.png`
- [ ] Marquee (1400×560, optional) — `assets/marquee-1400x560.png`
- [ ] Screenshots (1280×800) — `assets/screenshots/`
- [ ] Privacy policy URL set
- [ ] Permission justifications filled in
- [ ] Data usage questionnaire answered
- [ ] One-time $5 developer registration paid
