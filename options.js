/** TextAloud — options page: choose the folder to save generated audio into. */

const $ = (id) => document.getElementById(id);

function toast(text, isError) {
  const el = $("toast");
  el.textContent = text;
  el.className = "toast" + (isError ? " error" : "");
  el.hidden = !text;
  if (text) {
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (el.hidden = true), 4000);
  }
}

async function render() {
  const dir = self.TextAloudFiles ? await self.TextAloudFiles.getDir() : null;
  $("folder").textContent = dir ? `📁 ${dir.name}` : "No folder selected";
  $("forget").hidden = !dir;
}

function chooseFolder() {
  if (typeof window.showDirectoryPicker !== "function") {
    toast("Folder picking isn’t supported in this browser.", true);
    return;
  }
  // Call the picker first so the user gesture is still active.
  window
    .showDirectoryPicker({ id: "textaloud-audio", mode: "readwrite" })
    .then(async (handle) => {
      await self.TextAloudFiles.setDir(handle);
      await chrome.storage.local.set({ saveAudio: true, saveFolderName: handle.name });
      await render();
      const perm = handle.queryPermission
        ? await handle.queryPermission({ mode: "readwrite" })
        : "granted";
      toast(
        perm === "granted"
          ? `Audio will be saved to “${handle.name}”.`
          : "Folder set. Chrome may ask to re-confirm access next session."
      );
    })
    .catch((e) => {
      if (e?.name !== "AbortError") toast(e?.message || "Couldn’t set the folder.", true);
    });
}

async function forgetFolder() {
  if (self.TextAloudFiles) await self.TextAloudFiles.clearDir();
  await chrome.storage.local.set({ saveFolderName: "" });
  await render();
  toast("Save folder forgotten.");
}

$("choose").addEventListener("click", chooseFolder);
$("forget").addEventListener("click", forgetFolder);
render();
