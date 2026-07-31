# Changelog

## 14.8

### Improved: Context Menu "Copy Image" Resilience

- **Secure Context Check**: Automatically detects HTTP connections where `navigator.clipboard` is unavailable, warning the user and copying the image URL to the clipboard instead.
- **CORS & Data URI Fallback**: Integrated `ImageShareUtils.fetchImageViaCanvas` and `blobFromDataURL` to handle images hosted across origins or formatted as `data:` URIs.
- **Dual-Strategy Clipboard Writes**: Attempts `Promise<Blob>` resolution inside `ClipboardItem` to preserve user activation gesture in modern browsers, with a fallback to pre-resolving the `Blob` for browser/Electron environments that do not support promise values in `ClipboardItem`.
- **Automatic Fallback to Copy URL**: If raw image bitmap copying fails due to browser security restrictions (e.g. cross-origin canvas tainting), gracefully falls back to copying the absolute image URL.

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
