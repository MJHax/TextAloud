# Privacy Policy — TextAloud

_Last updated: 2026_

TextAloud is a browser extension that reads highlighted text aloud using
text-to-speech models from [OpenRouter](https://openrouter.ai). This policy
explains what data the extension handles.

## What is stored, and where

- **OpenRouter API key** — entered by you in the extension popup and stored in
  your browser's `chrome.storage.local` for the extension. It stays on your
  device. It is **not** synced to your Google account and is **never** sent to
  the developer or any server other than OpenRouter.
- **Settings** — your selected model, voice, speed, instructions, and toggles,
  stored the same way.
- **Learned metadata** — the audio format each model uses and a per-model cost
  calibration estimate, stored locally.

## What is transmitted, and to whom

When you ask TextAloud to read a selection, the extension sends the following
**directly from your browser to OpenRouter's API** (`https://openrouter.ai`):

- the selected text,
- your chosen model and voice (and optional instructions / speed),
- your API key, in the `Authorization` header.

No other data leaves your device. The developer operates **no server** and
receives **no data** from the extension. There is no analytics, telemetry, or
tracking. OpenRouter's handling of your request is governed by
[OpenRouter's privacy policy](https://openrouter.ai/privacy).

## Permissions

- `storage` — save your key and settings locally.
- `contextMenus` — add the right-click "Read aloud" item.
- `offscreen` — play generated audio without page restrictions.
- `host_permissions: https://openrouter.ai/*` — call the OpenRouter API.
- Content script on all sites — detect your text selection and show the read
  bubble on any page you use.

## Deleting your data

Open the extension popup and enter a different key, or remove the extension
from `chrome://extensions`. That deletes all locally stored data.

## Saved audio files (optional)

If you turn on **Save generated audio files**, the extension writes each
synthesized clip into a folder you explicitly choose with your operating
system's folder picker. The folder handle is remembered in the extension's
owner IndexedDB storage. These audio files are yours and remain on your disk
until you delete them; the developer has no access to them. Turning the option
off (or clicking **Forget**) stops writing new files and removes the stored
folder reference.

## Contact

Questions or concerns: open an issue on the project's repository.
