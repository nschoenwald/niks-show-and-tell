# Changelog

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
