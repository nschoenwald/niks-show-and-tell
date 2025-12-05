import { ImageShareUtils } from "../utils.js";
import { ChatSystem } from "./chat.js";
import { MODULE_ID, SETTINGS } from "../settings.js";

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

        // Simple drag feedback could go here, but for now just drop logic
        const handleDrop = (e) => ClipboardSystem.onPaste(e);

        if (chatLog) chatLog.addEventListener("drop", handleDrop);
        if (chatMsg) chatMsg.addEventListener("drop", handleDrop);
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
                    file = new File([compressedBlob], file.name.replace(/\.[^.]+$/, ".webp"), { type: "image/webp" });
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

        // Updated Content with Caption field
        const content = `
        <div style="text-align: center;">
            <img src="${dataUrl}" class="preview-image" style="max-height: 250px;">
        </div>
        <div class="form-group">
            <input type="text" class="caption-input" name="caption" placeholder="${game.i18n.localize("NIKS-SHOW-AND-TELL.Dialog.Caption.Placeholder")}">
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
                {
                    action: "journalShare",
                    label: game.i18n.localize("NIKS-SHOW-AND-TELL.Buttons.JournalShare"),
                    icon: "fas fa-book-open",
                    callback: async (event, button) => {
                        const caption = button.form.querySelector(`[name="caption"]`).value || "";
                        const path = await ClipboardSystem.uploadAndGetPath({ file, dataUrl, name });

                        let journal = game.journal.getName("Image Context");
                        if (!journal) journal = await JournalEntry.create({ name: "Image Context" });

                        await journal.createEmbeddedDocuments("JournalEntryPage", [
                            { name: caption || `image-${foundry.utils.randomID()}`, type: "image", src: path, image: { caption } }
                        ]);
                        await journal.sheet.render(true);

                        ChatSystem.toChatWithDialog(path, caption);
                        return true;
                    }
                }
            ]
        });

        ClipboardSystem.#activeClipboardDialog = dialog;
        dialog.render(true);
    }

    static async uploadAndGetPath({ file, dataUrl, name } = {}) {
        if (!file && dataUrl) {
            const blob = await ImageShareUtils.blobFromDataURL(dataUrl);
            const ext = ImageShareUtils.extFromMime(blob.type || "image/png");
            const filename = name || `image-${foundry.utils.randomID()}.${ext}`;
            file = new File([blob], filename, { type: blob.type || "image/png" });
        }

        const targetFolder = ImageShareUtils.uploadLocation;
        const source = "data";

        // Ensure directory exists
        try {
            await foundry.applications.apps.FilePicker.browse(source, targetFolder);
        } catch {
            await foundry.applications.apps.FilePicker.createDirectory(source, targetFolder);
        }

        const uploaded = await foundry.applications.apps.FilePicker.upload(source, targetFolder, file);
        return uploaded.path;
    }
}
