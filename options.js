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

let currentDir = null;

async function render() {
  const dir = self.TextAloudFiles ? await self.TextAloudFiles.getDir() : null;
  currentDir = dir;
  $("forget").hidden = !dir;

  if (!dir) {
    $("folder").textContent = "No folder selected";
    $("choose").textContent = "Choose folder…";
    $("regrant").hidden = true;
    return;
  }

  let perm = "granted";
  if (dir.queryPermission) perm = await dir.queryPermission({ mode: "readwrite" });

  if (perm === "granted") {
    await chrome.storage.local.set({ folderPermissionNeeded: false });
    $("folder").textContent = `📁 ${dir.name}`;
    $("choose").textContent = "Change folder…";
    $("regrant").hidden = true;
  } else {
    await chrome.storage.local.set({ folderPermissionNeeded: true });
    $("folder").textContent = `⚠ ${dir.name} — access needs re-confirming`;
    $("choose").textContent = "Choose another folder…";
    $("regrant").hidden = false;
  }
}

function regrant() {
  const dir = currentDir;
  if (!dir || !dir.requestPermission) return;
  // requestPermission() requires a user gesture — this click supplies it.
  dir
    .requestPermission({ mode: "readwrite" })
    .then(async (perm) => {
      if (perm === "granted") {
        await chrome.storage.local.set({ saveAudio: true, folderPermissionNeeded: false });
        await render();
        toast(`Access re-granted to “${dir.name}”.`);
      } else {
        toast("Access denied. Choose a different folder if needed.", true);
      }
    })
    .catch((e) => toast(e?.message || "Couldn’t re-grant access.", true));
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
      await chrome.storage.local.set({
        saveAudio: true,
        saveFolderName: handle.name,
        folderPermissionNeeded: false,
      });
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
$("regrant").addEventListener("click", regrant);
$("forget").addEventListener("click", forgetFolder);
render();
