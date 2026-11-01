# Nik's Show & Tell

![Foundry v13+](https://img.shields.io/badge/foundry-v13%2B-orange)
![Latest Release](https://img.shields.io/badge/release-v14.8.7-blue)

**Nik's Show & Tell** is a module for Foundry VTT that makes sharing images with your players seamless and effortless. Whether it's a handout in a journal, a random image from the web, or a file on your computer, sharing it is just a click or a paste away.

---

## Compatibility

- **Foundry VTT**: V13 – V14
- **System**: System-agnostic (works with any game system)
---

## Features

### 🖱️ Context Menu

Right-click on any image in Foundry (Journal Entries, Image Popouts, chat messages, etc.) to access the Show & Tell menu. It can also be used with the keyboard: arrow keys move between entries, Enter chooses one, Escape closes the menu.

*   **View**: Open the image in a full-size viewer.
*   **Show to Players** (GM only): Pop the image up on every connected player's screen — great for handouts — without posting it to chat.
*   **Post to Chat**: Share the image to the chat log — post it for everyone or whisper it to specific users, with an optional caption.
*   **Copy Link**: Copy the image's link to your clipboard.
*   **Copy Image**: Copy the image itself to your clipboard (as PNG, the format browsers can copy). Animated images copy their link instead, so the animation isn't lost.
*   **Download**: Save the original image file to your computer.

### 📋 Clipboard & Drag/Drop

*   **Paste to Share**: Press `Ctrl+V` (or `Cmd+V`) anywhere to paste an image from your clipboard. A single dialog shows a preview and lets you add a caption and pick who sees it (everyone or a whisper) — the image is uploaded when you post it. If the upload fails, the dialog stays open so you can retry. Pasting into other text fields or editors (e.g. journal pages) works as normal and is not intercepted.
*   **Drag & Drop**: Drag an image file (or an image from a web page) onto the Chat Log — including a popped-out chat — or the chat input to upload and share it.
*   **No Duplicate Uploads**: Images that are already on your Foundry server (e.g. dragged or copied from a journal) are shared directly instead of being uploaded again.
*   **Players Without Upload Permission**: Optionally, a connected GM's client can upload pasted images for players who aren't allowed to upload files themselves. Players who can't upload at all are told right away when they paste.
*   **Safe URL Pasting**: Pasting a direct image URL (e.g., `.png`, `.jpg`, `.webp` links) into the chat input opens the sharing dialog instead of posting the raw URL, preventing accidental spoilers.

### 💬 Chat Integration

*   **Clickable Images**: Images shared in chat can be clicked to open them in a full-size popout viewer. Images load only when they scroll into view.
*   **Tidy Chat Log**: Shared images are limited in height (300px by default, adjustable per user) so tall images don't take over the chat.
*   **Auto URL-to-Image**: Image links typed into chat messages are shown as images. Links inside code blocks, and links that are already part of an image, are left alone.
*   **Whisper Support**: When sharing images, post them publicly or whisper them to specific users. Connected users are listed first, quick-pick buttons select all players or all GMs, and your last whisper recipients are preselected. Whispering with nobody selected is blocked, so an image is never posted publicly by accident.
*   **Captions**: Add flavor text or descriptions to your images directly in the share dialog.

### 🔗 Integration Hooks (for Module Developers)

Nik's Show & Tell exposes Foundry hooks so other modules can integrate cleanly:

| Hook | Args | Type | Description |
|---|---|---|---|
| `niksShowAndTellContextMenuOpen` | `(src)` | `callAll` | Fired when the right-click context menu opens for an image. |
| `niksShowAndTellGetMenuButtons` | `(entries, src)` | `callAll` | Fired when building the context menu. Add, change or remove entries in `entries`. An entry is `{ id, label, icon, callback }`: `icon` holds Font Awesome classes (e.g. `"fa-solid fa-star"`), `callback` is called with `(src, event)`. The older `name` (for `label`) and an `<i>` element's HTML as `icon` still work. |
| `niksShowAndTellPasteImage` | `(dataUrl, file)` | `call` | Fired before the share dialog opens for a pasted or dropped image (and for images that only exist in your browser, shared from the menu). Return `false` to suppress the dialog. `dataUrl` is the image's URL, or the file as a `data:` URL; `file` is `null` for URL-only pastes. |
| `niksShowAndTellImageUploaded` | `(path, file)` | `callAll` | Fired after a successful upload with the final server path and uploaded `File`. |
| `niksShowAndTellShareImage` | `(src, caption)` | `call` | Fired right before any image is posted to chat (all entry points), with the final caption. Return `false` to cancel the share. |
| `niksShowAndTellShared` | `(src, caption)` | `callAll` | Fired after an image is successfully posted to chat. |

### 🚀 Optimization & Quality of Life

*   **Automatic Compression**: Images are automatically compressed to **WebP** format client-side before uploading (only when that makes them smaller), saving server space and bandwidth. Compression can be turned off, and oversized images can optionally be shrunk to a maximum size.
*   **Animated Image Support**: Animated GIF, APNG, WebP and AVIF images are detected and uploaded as-is, so they keep animating in chat. When you copy an animated image from a web page, the original animated file is used instead of the browser's static snapshot (where the source site allows it).
*   **Configurable Quality**: Adjust WebP compression quality to balance file size and image clarity.
*   **Smart Previews**: The sharing dialog shows a thumbnail preview of the image you are about to send.
*   **Unique Filenames**: Uploaded files are automatically prefixed with a timestamp to prevent filename collisions.
*   **Organized Uploads**: Optionally store uploads in one subfolder per user or per month.

## Usage

1.  **From Journals/Popouts**: Right-click any image → choose an action from the context menu.
2.  **From Clipboard**: Copy an image (e.g., from a browser or screenshot tool), then press `Ctrl+V` in Foundry. Review the preview, optionally add a caption, then click "Post Publicly" or pick recipients and click "Whisper" (Enter posts publicly). With "Choose Recipients When Sharing" disabled, the dialog has a single "Upload and Post" button instead.
3.  **From Files**: Drag and drop an image file onto the chat log area.
4.  **From URLs**: Paste a direct image URL into the chat input to share it via the dialog.

## Settings

*   **Choose Recipients When Sharing**: If disabled, "Post to Chat" skips the dialog and posts immediately for everyone, without a caption, and pasted images are shared with everyone (the dialog only asks for a caption).
*   **Upload Location**: Choose the folder where pasted and dropped images are stored. A single folder name is created inside the world folder; `s3://bucket/folder` uploads to an S3 bucket.
*   **Organize Uploads**: Store uploads directly in the upload location, or in one subfolder per user or per month.
*   **Upload via GM for Players Without Upload Permission**: Off by default. When enabled, users who may share images but lack Foundry's "Upload New Files" permission can still share pasted images — the active GM's client uploads them (images only, up to 50 MB, no SVG). The image is sent to that GM only, not to every connected player. Requires a GM to be online.
*   **Minimum Required Role**: Set the minimum user role required to use image sharing features (Player, Trusted Player, Assistant GM, or Game Master).
*   **Compress Images**: Convert pasted and dropped images to WebP before uploading. Disable to upload originals (e.g. detailed maps). Animated images are never converted.
*   **WebP Compression Quality**: Adjust the compression level (0.1 – 1.0). Lower values produce smaller files. Default is 0.8.
*   **Maximum Image Size**: When compressing, shrink images whose longest side exceeds this many pixels (e.g. 2048 for 4K screenshots). 0 keeps the original size (default).
*   **Enable Drag & Drop**: Toggle drag-and-drop image support on the chat log.
*   **Image Right-Click Menu** (per user): Open the Show & Tell menu always, everywhere except character/item sheets, only while holding Shift, or never.
*   **Chat Image Maximum Height** (per user): Maximum height of images shared in chat, in pixels. Set to 0 for no limit.

Changes to the role and drag & drop settings take effect immediately, without reloading.

---

## Other Modules by Nik

### 🎲 D&D 5e Specific
* **[Nik's DnD5e Tweaks](https://github.com/nschoenwald/niks-dnd5e-tweaks)** – Consolidated collection of quality-of-life enhancements and combat automation tweaks for DnD5e.

### ⚔️ Combat & Token Tools
* **[Nik's Action HUD](https://github.com/nschoenwald/niks-action-hud)** – Sleek, modern canvas-docked Action HUD for quick access to attacks, spells, inventory, and utility rolls.
* **[Nik's Token Tags](https://github.com/nschoenwald/niks-token-tags)** – Automatically numbers duplicate combatant NPCs (A, B, C…) with color-coded letter overlays.
* **[Nik's Shared NPC Initiative](https://github.com/nschoenwald/niks-shared-npc-initiative)** – Groups NPCs of the same type in combat so they share a single initiative roll.
* **[Nik's Movement Control](https://github.com/nschoenwald/niks-movement-control)** – GM controls to toggle player movement and automatically restrict/allow movement on combat start and end.
* **[Nik's Tiny Change Logs](https://github.com/nschoenwald/niks-tiny-changelogs)** – Compact, single-line chat messages logging token HP and Temp HP changes.

### 🎲 Visuals & Display
* **[Nik's Dynamic Roll Area](https://github.com/nschoenwald/niks-dynamic-roll-area)** – Dynamically restricts Dice So Nice 3D dice rolling area to exclude the sidebar / chat log across all screen resolutions and window sizes.

### ⚙️ Utilities & System Management
* **[Nik's Settings Locks](https://github.com/nschoenwald/niks-settings-locks)** – Soft-lock and hard-lock client settings and keybindings across all connected players.
* **[Nik's Compendium Search Tweaks](https://github.com/nschoenwald/niks-compendium-search-tweaks)** – Configure which compendium packs are included or excluded from native sidebar search.
* **[Nik's Zoom / Pan Options](https://github.com/nschoenwald/niks-zoom-pan-options)** – Touchpad and scroll wheel pan/zoom controls and canvas navigation enhancements.
* **[Nik's Scene Transformations](https://github.com/nschoenwald/niks-scene-transformations)** – Rotate scenes or add playable space around them, with tokens, walls, lights, tiles and regions moved along so everything stays in place.
