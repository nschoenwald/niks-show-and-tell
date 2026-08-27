import { ImageShareUtils, debugLog } from "../utils.js";
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

            debugLog("onPaste triggered", {
                eventType: event.type,
                hasClipboardData: !!event.clipboardData,
                hasDataTransfer: !!event.dataTransfer,
                itemCount: dt.items?.length ?? 0,
                fileCount: dt.files?.length ?? 0
            });

            // Standardized helper to check if event target is chat input or drop
            const isChatTarget = event.type === "drop" || (event.target && (event.target.id === "chat-message" || event.target.closest("#chat-message")));

            let file = null;
            let hasImageItem = false;

            if (dt.items) {
                for (const item of dt.items) {
                    debugLog("DataTransfer item:", { kind: item.kind, type: item.type });
                    if (item.kind === "file" && item.type.startsWith("image/")) {
                        hasImageItem = true;
                        file = item.getAsFile();
                        debugLog("getAsFile() result:", {
                            isNull: file === null,
                            name: file?.name,
                            type: file?.type,
                            size: file?.size
                        });
                        // Chrome/Windows can return a 0-byte ghost file when it
                        // fails to decode the source image into a clipboard bitmap.
                        // Discard it so we fall through to URL-based extraction.
                        if (file && file.size === 0) {
                            debugLog("getAsFile() returned 0-byte file, discarding");
                            file = null;
                        }
                        if (file) break;
                    }
                }
            }
            if (!file && dt.files?.length) {
                file = Array.from(dt.files).find(f => f.type.startsWith("image/"));
                if (file) hasImageItem = true;
                debugLog("Fallback to dt.files:", { found: !!file, name: file?.name, size: file?.size });
            }

            // --- Fallback 1: extract image URL from text/html ---
            let htmlImageUrl = null;
            if (!file) {
                const html = dt.getData("text/html") || "";
                if (html) {
                    try {
                        const doc = new DOMParser().parseFromString(html, "text/html");
                        const img = doc.querySelector("img[src]");
                        if (img?.src && /^https?:\/\//i.test(img.src)) {
                            debugLog("Extracted image URL from text/html:", img.src);
                            if (isChatTarget) {
                                htmlImageUrl = img.src;
                            }
                        }
                    } catch (htmlErr) {
                        debugLog("text/html parsing failed:", htmlErr.message);
                    }
                }
            }

            // --- Fallback 2: image URL from text/plain ---
            let plainImageUrl = null;
            if (!file && !htmlImageUrl) {
                const plain = dt.getData("text/plain") || "";
                if (plain) {
                    const imgExts = "jpg|jpeg|png|gif|svg|webp|avif|bmp|tiff|ico";
                    const urlRegex = new RegExp(`^https?:\\/\\/[^\\s"']+\\.(${imgExts})(\\?[^\\s"']*)?$`, "i");

                    if (isChatTarget && urlRegex.test(plain)) {
                        debugLog("URL image paste detected from text/plain:", plain);
                        plainImageUrl = plain;
                    }

                    // Check for local file paths (security warning)
                    if ((plain.startsWith("file:") || /^[A-Za-z]:\\/.test(plain)) && isChatTarget) {
                        ui.notifications.warn(game.i18n.localize("NIKS-SHOW-AND-TELL.Notifications.LocalFile"));
                    }
                }
            }

            // Prevent default SYNCHRONOUSLY before any async calls yield control back to the browser event loop!
            // If default action is not prevented synchronously, the browser pastes the image payload (or broken img placeholder) into chat input.
            const shouldIntercept = !!file || !!htmlImageUrl || !!plainImageUrl || (hasImageItem && isChatTarget);
            if (shouldIntercept) {
                event.preventDefault();
                event.stopImmediatePropagation();
            }

            if (!file && htmlImageUrl) {
                return ClipboardSystem.showPasteMenuForSource({ dataUrl: htmlImageUrl });
            }

            if (!file && plainImageUrl) {
                return ClipboardSystem.showPasteMenuForSource({ dataUrl: plainImageUrl });
            }

            // --- Fallback 3: Async Clipboard API (hoisted outside if (plain)) ---
            if (!file) {
                try {
                    const asyncDataUrl = await ImageShareUtils.imageFromClipboard();
                    if (asyncDataUrl) {
                        debugLog("Async Clipboard API provided image data");
                        if (isChatTarget) {
                            event.preventDefault();
                            event.stopImmediatePropagation();
                            return ClipboardSystem.showPasteMenuForSource({ dataUrl: asyncDataUrl });
                        }
                    }
                } catch (asyncErr) {
                    debugLog("Async Clipboard API fallback failed:", asyncErr.message);
                }
            }

            // --- If we have a file, process it ---
            if (file) {
                // Capture metadata synchronously before any await
                const originalName = file.name || "";
                const originalType = file.type || "image/png";

                debugLog("Processing clipboard file:", {
                    originalName,
                    originalType,
                    originalSize: file.size
                });

                let rawDataUrl;
                try {
                    rawDataUrl = await ImageShareUtils.fileToDataURL(file);
                    debugLog("File read into dataUrl:", {
                        dataUrlLength: rawDataUrl?.length ?? 0,
                        prefix: rawDataUrl?.substring(0, 50)
                    });
                } catch (readErr) {
                    console.warn("Nik's Show & Tell | Failed to read clipboard file:", readErr);
                    debugLog("fileToDataURL failed:", readErr.message);
                    if (hasImageItem) {
                        ui.notifications.warn(game.i18n.localize("NIKS-SHOW-AND-TELL.Notifications.PasteFailed"));
                    }
                    return;
                }

                // Validate we got actual image data
                if (!rawDataUrl || rawDataUrl === "data:" || rawDataUrl.length < 100) {
                    console.warn("Nik's Show & Tell | Clipboard file produced empty/invalid data, skipping.");
                    debugLog("Data URL validation failed:", {
                        isEmpty: !rawDataUrl,
                        isDataOnly: rawDataUrl === "data:",
                        length: rawDataUrl?.length
                    });
                    if (hasImageItem) {
                        ui.notifications.warn(game.i18n.localize("NIKS-SHOW-AND-TELL.Notifications.PasteFailed"));
                    }
                    return;
                }

                // Reconstruct a stable File from the data URL so we have a
                // fully self-contained copy immune to clipboard GC
                let stableFile;
                try {
                    const blob = await ImageShareUtils.blobFromDataURL(rawDataUrl);
                    stableFile = new File([blob], originalName, { type: originalType });
                    debugLog("Stable file reconstructed:", {
                        name: stableFile.name,
                        type: stableFile.type,
                        size: stableFile.size
                    });
                } catch (reconstructErr) {
                    console.warn("Nik's Show & Tell | Failed to reconstruct file from data URL:", reconstructErr);
                    debugLog("Reconstruction failed:", reconstructErr.message);
                    return;
                }

                // Compress!
                let dataUrl = rawDataUrl; // Reuse rawDataUrl by default
                try {
                    const compressedBlob = await ImageShareUtils.compressImage(stableFile);
                    if (compressedBlob && compressedBlob.size > 0) {
                        let newName = originalName;
                        if (newName.includes(".")) {
                            newName = newName.replace(/\.[^.]+$/, ".webp");
                        } else {
                            newName += ".webp";
                        }
                        stableFile = new File([compressedBlob], newName, { type: "image/webp" });
                        dataUrl = await ImageShareUtils.fileToDataURL(stableFile);
                        debugLog("Compression complete:", {
                            newName,
                            originalSize: stableFile.size,
                            compressedSize: compressedBlob.size
                        });
                    } else {
                        console.warn("Nik's Show & Tell | Compression returned empty blob, using original.");
                        debugLog("Compression returned empty blob");
                    }
                } catch (e) {
                    console.error("Compression failed, using original:", e);
                    debugLog("Compression error:", e.message);
                }

                debugLog("Final dataUrl for dialog:", {
                    length: dataUrl?.length,
                    fileSize: stableFile.size,
                    fileType: stableFile.type
                });
                return ClipboardSystem.showPasteMenuForSource({ file: stableFile, dataUrl });
            }

            // User attempted paste/drop with an image item, but all extraction methods failed
            if (hasImageItem) {
                ui.notifications.warn(game.i18n.localize("NIKS-SHOW-AND-TELL.Notifications.PasteFailed"));
            }
        } catch (err) {
            console.error("Nik's Show & Tell | Paste/Drop Error:", err);
            debugLog("Unhandled paste/drop error:", err.message, err.stack);
        }
    }

    static async showPasteMenuForSource({ file, dataUrl, name } = {}) {
        if (!dataUrl && file) dataUrl = await ImageShareUtils.fileToDataURL(file);

        // Allow other modules to intercept the paste/drop before the upload dialog appears.
        // Handlers receive (dataUrl, file) — file may be null for URL-only pastes.
        // Return false to suppress the dialog entirely (e.g. to route the image elsewhere).
        const continuePaste = Hooks.call("niksShowAndTellPasteImage", dataUrl, file ?? null);
        if (continuePaste === false) return;

        debugLog("showPasteMenuForSource:", {
            hasFile: !!file,
            fileSize: file?.size,
            fileType: file?.type,
            hasDataUrl: !!dataUrl,
            dataUrlLength: dataUrl?.length,
            name
        });

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
                        try {
                            debugLog("Upload button clicked, starting upload:", {
                                hasFile: !!file,
                                fileSize: file?.size,
                                hasDataUrl: !!dataUrl,
                                dataUrlLength: dataUrl?.length
                            });
                            const path = await ClipboardSystem.uploadAndGetPath({ file, dataUrl, name });
                            debugLog("Upload succeeded, path:", path);
                            ChatSystem.toChatWithDialog(path, caption);
                        } catch (uploadErr) {
                            console.error("Nik's Show & Tell | Upload failed:", uploadErr);
                            debugLog("Upload failed with error:", {
                                message: uploadErr.message,
                                stack: uploadErr.stack
                            });
                            // Show specific error for permission/CORS issues, generic for others
                            const msg = uploadErr.message?.includes(MODULE_SHORT)
                                ? uploadErr.message.replace(`${MODULE_SHORT} | `, "")
                                : game.i18n.localize("NIKS-SHOW-AND-TELL.Notifications.UploadFailed");
                            ui.notifications.error(msg);
                        }
                        return true;
                    }
                },
            ]
        });

        ClipboardSystem.#activeClipboardDialog = dialog;
        dialog.render(true);
    }

    static async uploadAndGetPath({ file, dataUrl, name } = {}) {
        debugLog("uploadAndGetPath called:", {
            hasFile: !!file,
            fileSize: file?.size,
            fileType: file?.type,
            hasDataUrl: !!dataUrl,
            dataUrlLength: dataUrl?.length,
            name
        });

        // Pre-flight: check that the user has file upload permission
        const canUpload = game.user.hasPermission("FILES_UPLOAD");
        if (!canUpload) {
            debugLog("Upload blocked: user lacks FILES_UPLOAD permission", {
                userId: game.user.id,
                userName: game.user.name,
                role: game.user.role
            });
            throw new Error(
                `${MODULE_SHORT} | You do not have permission to upload files. ` +
                `Ask your GM to enable "Upload New File" for your role in Game Settings → User Management.`
            );
        }

        // Always prefer reconstructing from dataUrl — it is a stable, self-contained
        // base64 copy that cannot be garbage-collected, unlike File references which
        // may become stale on Chrome/Windows between the paste and the upload click.
        let blob;
        if (dataUrl) {
            if (dataUrl.startsWith("data:")) {
                debugLog("Reconstructing blob from data: URI for upload");
                blob = await ImageShareUtils.blobFromDataURL(dataUrl);
            } else if (/^https?:\/\//i.test(dataUrl)) {
                // Remote URL — try to load via canvas (CORS-safe)
                debugLog("Loading remote URL via canvas for upload:", dataUrl);
                try {
                    blob = await ImageShareUtils.fetchImageViaCanvas(dataUrl);
                } catch (corsErr) {
                    debugLog("Remote image load failed (CORS):", corsErr.message);
                    throw new Error(
                        `${MODULE_SHORT} | Could not download remote image — the image server blocked the request (CORS). ` +
                        `Try right-clicking the image, saving it to your computer first, then uploading it.`
                    );
                }
            } else {
                debugLog("Reconstructing blob from unknown URI scheme");
                blob = await ImageShareUtils.blobFromDataURL(dataUrl);
            }
        } else if (file) {
            debugLog("Using file reference directly (no dataUrl available)");
            blob = file;
        } else {
            throw new Error(`${MODULE_SHORT} | No file or dataUrl provided for upload`);
        }

        debugLog("Blob for upload:", {
            size: blob.size,
            type: blob.type,
            isFile: blob instanceof File,
            name: blob instanceof File ? blob.name : "(blob)"
        });

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

        // Sanitize baseName to remove URLs, folder paths, and invalid characters
        try {
            if (baseName.startsWith("http")) baseName = new URL(baseName).pathname;
        } catch (e) {}
        baseName = baseName.split(/[\/\\]/).pop().replace(/[^a-zA-Z0-9.\-_]/g, "_");
        if (!baseName || baseName === `.${ext}`) baseName = `image-${foundry.utils.randomID()}.${ext}`;

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

        // Validate blob has actual data before attempting upload
        if (!blob || blob.size === 0) {
            debugLog("Upload blocked: blob is empty or null", { blobExists: !!blob, size: blob?.size });
            throw new Error(`${MODULE_SHORT} | Cannot upload empty file`);
        }

        // Always create a new File object to ensure the name is correct
        const fileToUpload = new File([blob], filename, { type: blob.type || "image/png" });
        const { source, bucket, folder: targetFolder } = ImageShareUtils.uploadTarget;
        const browseOpts = bucket ? { bucket } : {};

        debugLog("Upload target:", {
            source,
            bucket,
            targetFolder,
            filename,
            fileSize: fileToUpload.size,
            fileType: fileToUpload.type
        });

        // Ensure directory tree exists (create parent folders recursively)
        try {
            await foundry.applications.apps.FilePicker.browse(source, targetFolder, browseOpts);
            debugLog("Target folder exists:", targetFolder);
        } catch {
            debugLog("Target folder missing, creating recursively:", targetFolder);
            const parts = targetFolder.split("/").filter(Boolean);
            let current = "";
            for (const part of parts) {
                current = current ? `${current}/${part}` : part;
                try {
                    await foundry.applications.apps.FilePicker.browse(source, current, browseOpts);
                } catch {
                    debugLog("Creating directory:", current);
                    await foundry.applications.apps.FilePicker.createDirectory(source, current, browseOpts);
                }
            }
        }

        const uploadOpts = bucket ? { bucket } : {};

        let uploaded;
        try {
            debugLog("Calling FilePicker.upload:", { source, targetFolder, filename, fileSize: fileToUpload.size });
            uploaded = await foundry.applications.apps.FilePicker.upload(source, targetFolder, fileToUpload, uploadOpts);
            debugLog("FilePicker.upload response:", uploaded);
        } catch (uploadErr) {
            console.error(`${MODULE_SHORT} | FilePicker.upload threw:`, uploadErr);
            debugLog("FilePicker.upload exception:", {
                message: uploadErr.message,
                stack: uploadErr.stack,
                source,
                targetFolder,
                filename,
                fileSize: fileToUpload.size,
                fileType: fileToUpload.type
            });
            throw uploadErr;
        }

        if (!uploaded?.path) {
            debugLog("Upload returned no path:", uploaded);
            throw new Error(`${MODULE_SHORT} | Upload failed — server returned no path`);
        }

        debugLog("Upload complete, path:", uploaded.path);
        // Notify other modules that an image was successfully uploaded.
        Hooks.callAll("niksShowAndTellImageUploaded", uploaded.path, fileToUpload);
        return uploaded.path;
    }
}
