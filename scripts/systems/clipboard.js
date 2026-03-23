import { ImageShareUtils } from "../utils.js";
import { ChatSystem } from "./chat.js";
import { MODULE_ID, SETTINGS } from "../settings.js";

const MODULE_SHORT = "niks-show-and-tell";

export class ClipboardSystem {
    static #pasteInstalled = false;
    static #activeClipboardDialog = null;

    static init() {
        if (ImageShareUtils.canUserShare) {
            ClipboardSystem.installPasteHandler();
            if (game.settings.get(MODULE_ID, SETTINGS.ENABLE_DRAG_DROP)) {
                ClipboardSystem.installDropHandler();
            }
        }
    }

    static installDropHandler() {
        const chatLog = document.getElementById("chat-log");
        const chatMsg = document.getElementById("chat-message");

        const handleDrop = (e) => ClipboardSystem.onPaste(e);

        // Install drop + drag visual overlay on both targets
        [chatLog, chatMsg].filter(Boolean).forEach((el) => {
            el.addEventListener("drop", (e) => {
                ClipboardSystem.#removeDropOverlay(el);
                handleDrop(e);
            });
            el.addEventListener("dragover", (e) => {
                e.preventDefault();
                ClipboardSystem.#showDropOverlay(el);
            });
            el.addEventListener("dragleave", (e) => {
                // Only remove if we've actually left the element
                if (!el.contains(e.relatedTarget)) {
                    ClipboardSystem.#removeDropOverlay(el);
                }
            });
        });
    }

    static #showDropOverlay(el) {
        if (el.querySelector(`.${MODULE_SHORT}-drop-overlay`)) return;
        el.style.position = el.style.position || "relative";
        const overlay = document.createElement("div");
        overlay.className = `${MODULE_SHORT}-drop-overlay`;
        overlay.textContent = game.i18n.localize("NIKS-SHOW-AND-TELL.Notifications.DragDropHint");
        el.appendChild(overlay);
    }

    static #removeDropOverlay(el) {
        el.querySelectorAll(`.${MODULE_SHORT}-drop-overlay`).forEach((o) => o.remove());
    }

    static installPasteHandler() {
        if (this.#pasteInstalled) return;
        this.#pasteInstalled = true;
        window.addEventListener("paste", ClipboardSystem.onPaste, { capture: true });
    }

    static async onPaste(event) {
        if (!ImageShareUtils.canUserShare) return;

        try {
            // Handle both Paste (clipboardData) and Drop (dataTransfer)
            const dt = event.clipboardData || event.dataTransfer;
            if (!dt) return;

            let file = null;
            if (dt.items) {
                for (const item of dt.items) {
                    if (item.kind === "file" && item.type.startsWith("image/")) {
                        file = item.getAsFile();
                        break;
                    }
                }
            }
            if (!file && dt.files?.length) {
                file = Array.from(dt.files).find(f => f.type.startsWith("image/"));
            }

            // Safe URL Interception (only for strings)
            if (!file) {
                const plain = dt.getData("text/plain") || "";
                if (plain) {
                    const imgExts = "jpg|jpeg|png|gif|svg|webp";
                    const urlRegex = new RegExp(`^https?:\\/\\/[^\\s"']+\\.(${imgExts})[^\\s"']*$`, "i");

                    // If it's a direct image link and we are in chat context
                    // (Drop is always considered context, Paste only if focused on chat)
                    const isChat = event.type === "drop" || (event.target.id === "chat-message" || event.target.closest("#chat-message"));

                    if (isChat && urlRegex.test(plain)) {
                        event.preventDefault();
                        event.stopPropagation();
                        return ClipboardSystem.showPasteMenuForSource({ dataUrl: plain });
                    }
                }

                // Check for local file paths (security warning)
                if ((plain.startsWith("file:") || /^[A-Za-z]:\\/.test(plain)) &&
                    (event.target.id === "chat-message" || event.target.closest("#chat-message"))) {
                    ui.notifications.warn(game.i18n.localize("NIKS-SHOW-AND-TELL.Notifications.LocalFile"));
                }
                return;
            }

            // If we have a file, process it
            if (file) {
                event.preventDefault();
                event.stopPropagation();

                // Compress!
                try {
                    const compressedBlob = await ImageShareUtils.compressImage(file);
                    let newName = file.name;
                    if (newName.includes(".")) {
                        newName = newName.replace(/\.[^.]+$/, ".webp");
                    } else {
                        newName += ".webp";
                    }
                    file = new File([compressedBlob], newName, { type: "image/webp" });
                } catch (e) {
                    console.error("Compression failed, using original:", e);
                }

                const dataUrl = await ImageShareUtils.fileToDataURL(file);
                return ClipboardSystem.showPasteMenuForSource({ file, dataUrl });
            }
        } catch (err) {
            console.error("Nik's Show & Tell | Paste/Drop Error:", err);
        }
    }

    static async showPasteMenuForSource({ file, dataUrl, name } = {}) {
        if (!dataUrl && file) dataUrl = await ImageShareUtils.fileToDataURL(file);

        try {
            if (ClipboardSystem.#activeClipboardDialog?.rendered) ClipboardSystem.#activeClipboardDialog.close({ force: true });
        } catch { }
        ClipboardSystem.#activeClipboardDialog = null;

        const safeName = ImageShareUtils.escapeAttr(name || "");
        const safeDataUrl = ImageShareUtils.escapeAttr(dataUrl);
        const content = `
        <div style="text-align: center;">
            <img src="${safeDataUrl}" class="preview-image" data-image-url="${safeDataUrl}" data-image-name="${safeName}" style="max-height: 250px;">
        </div>
        <div class="form-group">
            <input type="text" class="caption-input" name="caption" placeholder="${ImageShareUtils.escapeAttr(game.i18n.localize("NIKS-SHOW-AND-TELL.Dialog.Caption.Placeholder"))}">
        </div>
    `;

        const dialog = new foundry.applications.api.DialogV2({
            window: { title: game.i18n.localize("NIKS-SHOW-AND-TELL.Dialog.FromClipboard.Title") },
            content: content,
            rejectClose: false,
            buttons: [
                {
                    action: "uploadShare",
                    label: game.i18n.localize("NIKS-SHOW-AND-TELL.Buttons.UploadShare"),
                    icon: "fas fa-share",
                    callback: async (event, button) => {
                        const caption = button.form.querySelector(`[name="caption"]`).value || "";
                        const path = await ClipboardSystem.uploadAndGetPath({ file, dataUrl, name });
                        ChatSystem.toChatWithDialog(path, caption);
                        return true;
                    }
                },
            ]
        });

        ClipboardSystem.#activeClipboardDialog = dialog;
        dialog.render(true);
    }

    static async uploadAndGetPath({ file, dataUrl, name } = {}) {
        // Reconstruct or use existing file
        let blob;
        if (file) {
            blob = file;
        } else {
            blob = await ImageShareUtils.blobFromDataURL(dataUrl);
        }

        // Determine extension and base filename
        const ext = ImageShareUtils.extFromMime(blob.type || "image/png");
        let baseName = name;
        if (!baseName) {
            if (blob instanceof File && blob.name) {
                baseName = blob.name;
            } else {
                baseName = `image-${foundry.utils.randomID()}.${ext}`;
            }
        }

        // Ensure baseName has an extension
        if (!baseName.includes('.')) {
            baseName += `.${ext}`;
        }

        // Generate Timestamp YYYYMMDDHHMMSS
        const now = new Date();
        const timestamp =
            now.getFullYear().toString() +
            (now.getMonth() + 1).toString().padStart(2, '0') +
            now.getDate().toString().padStart(2, '0') +
            now.getHours().toString().padStart(2, '0') +
            now.getMinutes().toString().padStart(2, '0') +
            now.getSeconds().toString().padStart(2, '0');

        const filename = `${timestamp}-${baseName}`;

        // Always create a new File object to ensure the name is correct
        const fileToUpload = new File([blob], filename, { type: blob.type || "image/png" });
        const targetFolder = ImageShareUtils.uploadLocation;
        const source = "data";

        // Ensure directory tree exists (create parent folders recursively)
        try {
            await foundry.applications.apps.FilePicker.browse(source, targetFolder);
        } catch {
            const parts = targetFolder.split("/").filter(Boolean);
            let current = "";
            for (const part of parts) {
                current = current ? `${current}/${part}` : part;
                try {
                    await foundry.applications.apps.FilePicker.browse(source, current);
                } catch {
                    await foundry.applications.apps.FilePicker.createDirectory(source, current);
                }
            }
        }

        const uploaded = await foundry.applications.apps.FilePicker.upload(source, targetFolder, fileToUpload);
        if (!uploaded?.path) {
            throw new Error(`${MODULE_SHORT} | Upload failed — server returned no path`);
        }
        return uploaded.path;
    }
}
