# Changelog

## 1.0.0

First release.

- Highlight text on any page and read it aloud with OpenRouter TTS models.
- Live model + voice picker (voices load per model, from the OpenRouter API).
- Up-front price estimate that self-calibrates from real usage.
- Adaptive output format (mp3, or PCM wrapped as WAV), with a real audio player
  in an offscreen document.
- Pause, stop, and cancel-in-progress controls.
- Draggable floating card whose position persists across tabs and restarts.
- Optional saving of generated audio to a user-chosen folder (File System Access
  API), with one-click re-grant when Chrome asks to re-confirm access.
- Optional right-click “Read aloud with TextAloud” menu item.
- Delivery instructions and speed (0.25×–5×).
- API key stored locally only; no accounts, servers, or tracking.
