# Changelog

## 14.8.8

### Fixed: Custom Port & Loopback Path Normalization

- **Custom Port & Loopback Support**: Fixed an issue where local path normalization failed when Foundry was configured to run on a custom port other than 30000 (e.g. 8080, 9000, 80, 443). `normalizeSrc()` now matches loopback hostnames (`localhost`, `127.0.0.1`, `0.0.0.0`, `::1`), custom server ports, and standard Foundry asset roots (`/ui/`, `/systems/`, `/modules/`, `/worlds/`, `/tokens/`, `/tiles/`, etc.), stripping local server origins cleanly regardless of port configuration.

## 14.8.7

### New: Integration Hooks for Third-Party Modules

Added six Foundry hooks that allow other modules to cleanly integrate with Nik's Show & Tell without resorting to MutationObservers or monkey-patching.

- **`niksShowAndTellContextMenuOpen` hook**: Fired in `showContextMenu` as soon as the right-click menu is triggered for an image. Handlers receive `(src)` — the normalized image path.
- **`niksShowAndTellGetMenuButtons` hook**: Fired at the end of `getButtons(src)` in the context menu system. Handlers receive `(buttons, src)` — push additional `{ name, icon, callback }` objects directly into the array to add custom entries alongside the built-in ones.
- **`niksShowAndTellPasteImage` hook**: Fired in `showPasteMenuForSource` after the image data is fully resolved but before the upload dialog is shown. Handlers receive `(dataUrl, file)` — `file` is `null` for URL-only pastes. Return `false` to suppress the dialog entirely, allowing another module to handle the image instead (e.g. route directly to a journal API).
- **`niksShowAndTellImageUploaded` hook**: Fired in `uploadAndGetPath` after a successful upload. Handlers receive `(path, file)` where `path` is the final server path of the uploaded file. Useful for post-upload workflows such as adding the image to a timeline or gallery.
- **`niksShowAndTellShareImage` hook**: Fired at the top of both `toChat` and `toChatWithDialog` before any chat message is created. Handlers receive `(src, caption)` where `src` is the already-normalized image path. Return `false` from any handler to cancel the share entirely, covering all entry points: the context menu quick-send, the advanced dialog, and clipboard paste / drag-drop flows.
- **`niksShowAndTellShared` hook**: Fired after an image is successfully posted to the Foundry chat log, from every entry point (quick-send, "Show to All" dialog button, and "Whisper" dialog button). Handlers receive `(src, caption)`.

## 14.8.6

### Fixed: Image Popout ("Show" Button) Path Resolution

- **Leading Slash Retention for Image Popouts**: Fixed an issue where the "Show" button (`ImagePopout`) rendered a broken image placeholder because local normalized paths lacked a leading slash `/`, causing the browser to resolve images relative to the active `/game` page route (e.g. `/game/ui/backgrounds/setup.webp`). Local paths now explicitly retain a leading `/` (`/ui/backgrounds/setup.webp`), resolving correctly across all browser routes.

## 14.8.5

### Fixed: Local Foundry Path Resolution

- **Local Path Normalization for Remote Players**: Fixed an issue where right-clicking and sharing local Foundry images (such as core UI backgrounds, system icons, or local uploads) produced full `http://localhost:30000/...` or `127.0.0.1` URLs in chat messages, resulting in broken image icons for remote players. Local server origins are now stripped into relative asset paths.
- **CSS Relative URL 404 Prevention**: Fixed console `404 (Not Found)` errors for `modules/niks-show-and-tell/ui/backgrounds/setup.webp` by removing core CSS variables containing relative URLs from module styles.

## 14.8.4

### Fixed: Chat Input Broken Image Placeholder on Paste

- **Synchronous Event Cancellation**: Fixed an issue where pasting an image into the chat input field produced a broken image placeholder in the chat message input alongside the "Send Image to Chat" dialog. Synchronously intercepts paste and drop events before async file reading/compression, immediately preventing browser default paste insertion into the chat textarea.

## 14.8.2

### Fixed: Image Pasting & Copying Reliability Improvements

- **Async Clipboard API Fallback**: Fixed an issue where the async Clipboard API fallback was incorrectly nested inside the plain text check block, preventing raw binary image pastes from attempting async clipboard retrieval when `text/plain` was empty.
- **Same-Origin Asset Copying**: Fixed an issue where copying local Foundry images to the clipboard failed due to fetching same-origin assets in CORS mode when the server returned no CORS headers.
- **Selective Event Propagation**: Preserved event bubbling for non-image paste events so other modules and browser defaults are not unnecessarily blocked.
- **Browser Compatibility**: Added feature detection for `ClipboardItem` and PNG support (giving clearer fallback feedback in Firefox) and refined canvas image loading without unneeded cache-buster parameters on local assets.
- **Paste & Save Diagnostics**: Added user notifications for failed clipboard image extractions and updated image saving to support fallback canvas retrieval and localized error notifications.

## 14.8.1

### Fixed: GitHub Release Packaging (`lang/en.json` missing)

- **Release Archive Fix**: Fixed an issue in the `.github/workflows/release.yml` GitHub Action workflow where the archive loop targeted missing directories. Ensured `lang/en.json` is cleanly included in release `.zip` packages, preventing `PACKAGE.InstallFailed` validation errors during Foundry module installation.

## 14.8

### Improved: Context Menu "Copy Image" Resilience & Reliability

- **DOM `currentSrc` Resolution**: Extracted image URLs using `event.target.currentSrc` instead of raw `getAttribute("src")`. This guarantees the module uses the exact, fully qualified URL resolved by the browser, preventing false 404 errors on relative image paths.
- **S3 CORS Disk Cache Bypass**: Fixed an issue where copying external images (e.g., hosted on AWS S3) failed because the browser served non-CORS cached responses from initial `<img>` tag renders. Appends a cache-busting parameter (`&_cors=timestamp`) on fallback fetch to ensure a fresh CORS-enabled network response.
- **Streamlined Execution & URL Fallback**: Refactored `CopyImage` to a single-pass pipeline. If raw bitmap extraction is blocked by security policies or canvas tainting, the module cleanly logs a warning and copies the absolute image URL to the clipboard with a notification.
- **Secure Context Check**: Automatically detects HTTP connections where `navigator.clipboard` is unavailable, warning the user and copying the image URL to the clipboard instead.

## 14.7

### Fixed: "Copy Image" intermittently failing

Fixed an issue where the context menu "Copy Image" button would occasionally show a red "Failed to copy image to clipboard" error. This was caused by the browser's transient user activation expiring during the async fetch and image conversion pipeline before `navigator.clipboard.write()` was called. The `ClipboardItem` is now constructed synchronously within the click handler, passing a `Promise<Blob>` as the value, which preserves the user gesture context. Also added a null-guard for the `canvas.toBlob()` result.

## 14.6

### Improved: Clipboard Image Paste (Chrome/Windows)

Significantly improved the "Right Click → Copy Image → Ctrl+V in Foundry Chat" workflow, especially on Chrome/Windows where clipboard image data can be unreliable.

#### New Fallback Chain
When pasting an image, the module now tries multiple strategies in order:

1. **File blob from clipboard** — The standard path. Now also rejects 0-byte "ghost files" that Chrome/Windows can produce when it fails to decode the source image.
2. **Image URL from `text/html`** *(new)* — When Chrome copies an image, it always includes `<img src="ORIGINAL_URL">` in the `text/html` clipboard data. The module now parses this to recover the original image URL even when the raw bitmap blob is empty or unavailable.
3. **Image URL from `text/plain`** — Detects pasted URLs with image file extensions. Now supports additional formats: `avif`, `bmp`, `tiff`, `ico`.
4. **Async Clipboard API** *(new)* — As a last resort, uses `navigator.clipboard.read()` to attempt to read image data directly from the clipboard.

#### Other Improvements
- **Removed hardcoded CDN allowlist** — The previous version had a hardcoded list of CDN hosts (Notion, Unsplash, Imgur) for URL detection. This is no longer needed since `text/html` extraction handles all "Copy Image" pastes regardless of the source host or URL format.
- **Added direct `fetch()` fallback** for remote image loading — When canvas-based CORS loading fails, the module now also attempts a direct `fetch()` request before giving up. Some CDNs allow fetch-based CORS but block `<img crossOrigin>` loading.
- **Better 0-byte file handling** — Chrome/Windows can sometimes return a 0-byte file from the clipboard. Previously this could cause silent failures; now the module detects this and falls through to URL-based extraction instead.
