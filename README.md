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

Right-click on any image in Foundry (Journal Entries, Image Popouts, chat messages, etc.) to access the Show & Tell menu:

*   **Show**: Pop out the image in a full-size viewer.
*   **Send to Chat**: Share the image to the chat log — choose to show it to all players or whisper it to specific ones, with an optional caption.
*   **Copy URL**: Copy the image's URL to your clipboard.
*   **Copy Image**: Copy the image data directly to your clipboard (converts to PNG for clipboard compatibility).
*   **Save Image**: Download the image file to your computer.

### 📋 Clipboard & Drag/Drop

*   **Paste to Share**: Press `Ctrl+V` (or `Cmd+V`) anywhere to paste an image from your clipboard. A preview dialog lets you add a caption before uploading and sharing.
*   **Drag & Drop**: Drag an image file directly onto the Chat Log or chat input to upload and share it.
*   **Safe URL Pasting**: Pasting a direct image URL (e.g., `.png`, `.jpg`, `.webp` links) into the chat input opens the sharing dialog instead of posting the raw URL, preventing accidental spoilers.

### 💬 Chat Integration

*   **Clickable Images**: Images shared in chat can be clicked to open them in a full-size popout viewer.
*   **Auto URL-to-Image**: Image URLs typed or pasted directly into chat messages are automatically converted into embedded images.
*   **Whisper Support**: When sharing images, choose to show them to all players or whisper to specific ones.
*   **Captions**: Add flavor text or descriptions to your images directly in the share dialog.

### 🔗 Integration Hooks (for Module Developers)

Nik's Show & Tell exposes Foundry hooks so other modules can integrate cleanly:

| Hook | Args | Type | Description |
|---|---|---|---|
| `niksShowAndTellContextMenuOpen` | `(src)` | `callAll` | Fired when the right-click context menu opens for an image. |
| `niksShowAndTellGetMenuButtons` | `(buttons, src)` | `callAll` | Fired when building the context menu. Push custom `{ name, icon, callback }` objects into `buttons`. |
| `niksShowAndTellPasteImage` | `(dataUrl, file)` | `call` | Fired after clipboard/drop image data is resolved, before the upload dialog. Return `false` to suppress the dialog. `file` is `null` for URL-only pastes. |
| `niksShowAndTellImageUploaded` | `(path, file)` | `callAll` | Fired after a successful upload with the final server path and uploaded `File`. |
| `niksShowAndTellShareImage` | `(src, caption)` | `call` | Fired before any image is sent to chat (all entry points). Return `false` to cancel the share. |
| `niksShowAndTellShared` | `(src, caption)` | `callAll` | Fired after an image is successfully posted to chat. |

### 🚀 Optimization & Quality of Life

*   **Automatic Compression**: Images are automatically compressed to **WebP** format client-side before uploading, saving server space and bandwidth.
*   **Configurable Quality**: Adjust WebP compression quality to balance file size and image clarity.
*   **Smart Previews**: The sharing dialog shows a thumbnail preview of the image you are about to send.
*   **Unique Filenames**: Uploaded files are automatically prefixed with a timestamp to prevent filename collisions.

## Usage

1.  **From Journals/Popouts**: Right-click any image → choose an action from the context menu.
2.  **From Clipboard**: Copy an image (e.g., from a browser or screenshot tool), then press `Ctrl+V` in Foundry. Review the preview, optionally add a caption, then click "Upload & Share".
3.  **From Files**: Drag and drop an image file onto the chat log area.
4.  **From URLs**: Paste a direct image URL into the chat input to share it via the dialog.

## Settings

*   **Show To Chat Configuration**: If disabled, "Send to Chat" skips the confirmation dialog and sends immediately without a caption or player selection.
*   **Upload Location**: Choose the folder where uploaded clipboard/pasted images are stored.
*   **Minimum Required Role**: Set the minimum user role required to use image sharing features (Player, Trusted Player, Assistant GM, or Game Master).
*   **WebP Compression Quality**: Adjust the compression level (0.1 – 1.0). Lower values produce smaller files. Default is 0.8.
*   **Enable Drag & Drop**: Toggle drag-and-drop image support on the chat log.

---

## Other Modules by Nik

### 🎲 D&D 5e Specific
* **[Nik's DnD5e Tweaks](https://github.com/nschoenwald/niks-dnd5e-tweaks)** – Consolidated collection of quality-of-life enhancements and combat automation tweaks for DnD5e.

### ⚔️ Combat & Token Tools
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
