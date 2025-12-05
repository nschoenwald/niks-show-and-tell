# Nik's Show & Tell

![Foundry v13](https://img.shields.io/badge/foundry-v13-orange)
![Latest Release](https://img.shields.io/badge/release-v13.01-blue)

**Nik's Show & Tell** is a module for Foundry VTT that makes sharing images with your players seamless and effortless. Whether it's a handout in a journal, a random image from the web, or a file on your computer, sharing it is just a click or a paste away.

## Features

### 🖱️ Context Menu Magic
Right-click on any image in a Journal Entry or Image Popout to access the Show & Tell menu:
*   **Show**: Pop out the image for yourself.
*   **Send to Chat**: Share the image to the chat log with a custom caption.
*   **Copy URL**: Quickly copy the image link to your clipboard.


### 📋 Seamless Clipboard Support
*   **Paste to Share**: Just press `Ctrl+V` anywhere to paste an image from your clipboard.
*   **Drag & Drop**: Drag an image file directly onto the Chat Log to simple upload and share it.
*   **Safe URL Pasting**: Pasting a direct image URL (e.g., discord attachments) opens the sharing dialog instead of instantly posting, preventing spoilers.

### 🚀 Optimization & Quality of Life
*   **Automatic Compression**: Large images are automatically compressed to **WebP** client-side before uploading, saving server space and bandwidth.
*   **Smart Previews**: The sharing dialog shows a thumbnail of the image you are about to send.
*   **Captions**: Add flavor text or descriptions to your images directly in the share dialog.
*   **Scene Tools**: A "Show Copied URL" tool in the Tile Controls for mouse-only users.

## Usage

1.  **From Journals**: Right-click an image -> "Send to Chat". Select "Show to All" or whisper specific players.
2.  **From Desktop**: Drag a file onto the chat box. Add a caption and hit Share.
3.  **From Web**: Copy an image or its URL. Focus Foundry. Press `Ctrl+V`.

## Settings

*   **WebP Quality**: Adjust the compression level (0.1 - 1.0). Default is 0.8.
*   **Enable Drag & Drop**: Toggle drag-and-drop support on the chat log.
*   **Advanced To Chat**: If disabled, "Send to Chat" skips the dialog (no caption/preview) and sends immediately.
*   **Upload Location**: Choose where uploaded clipboard images are stored.

## Installation

1.  Copy the `niks-show-and-tell` folder to your Foundry VTT `Data/modules/` directory.
2.  Restart Foundry VTT.
3.  Enable the module in "Manage Modules".

## License

MIT License.
