import { HOOKS, MODULE_ID } from "../constants.js";
import { fileToDataUrl, localize, log } from "../helpers.js";
import { isLocalOnlyUrl, normalizeSrc, serverPath } from "../image/urls.js";
import { getSetting, setSetting, SETTINGS } from "../settings.js";
import { buildMessageContent } from "./chat-images.js";
import { ShareDialog } from "./share-dialog.js";
import { Uploads } from "./uploads.js";

/**
 * The entry points for sharing an image to chat, used by the image menu, paste and drop.
 */
export const Sharing = {
    /**
     * Share an image every user can load already: a path on this server or a web URL.
     * Opens the share dialog, or posts right away when "Choose Recipients" is off.
     * Images that only exist in this browser (data:/blob:) are uploaded first.
     * @param {string} src
     * @param {object} [options]
     * @param {string} [options.caption]
     */
    async shareImage(src, { caption = "" } = {}) {
        if (isLocalOnlyUrl(src)) return this.shareNewImage({ url: src });
        const path = normalizeSrc(src);
        if (!getSetting(SETTINGS.CHOOSE_RECIPIENTS)) return this.post(path, caption);
        ShareDialog.open({ previewUrl: path, caption, resolvePath: () => path });
    },

    /**
     * Share a pasted or dropped image. Images already on this server are shared by their path;
     * anything else is uploaded when the user clicks a share button in the dialog.
     * @param {object} source
     * @param {File} [source.file]  An in-memory image file
     * @param {string} [source.url] A server path, web URL, data: or blob: URL
     */
    async shareNewImage({ file, url } = {}) {
        // Other modules may take over the image. Encoding a file is costly, so it only happens
        // when a handler is registered.
        if (Hooks.events[HOOKS.PASTE_IMAGE]?.length) {
            const dataUrl = url ?? await fileToDataUrl(file);
            if (Hooks.call(HOOKS.PASTE_IMAGE, dataUrl, file ?? null) === false) return;
        }

        const existingPath = file ? null : serverPath(url);
        if (!existingPath && !Uploads.canUpload) {
            ui.notifications.warn(localize("Notifications.NoUploadPermission"));
            return;
        }
        log.debug("Sharing new image:", { file: file && { name: file.name, size: file.size, type: file.type }, url, existingPath });

        // Files are previewed through an object URL instead of a (potentially multi-MB) data: URL
        const previewUrl = file ? URL.createObjectURL(file) : url;
        // A successful upload is kept, so a retry after a failed post doesn't upload again
        let path = existingPath;
        ShareDialog.open({
            previewUrl,
            needsUpload: !existingPath,
            resolvePath: async () => path ??= await Uploads.upload({ file, url }),
            onClose: () => file && URL.revokeObjectURL(previewUrl)
        });
    },

    /**
     * Post an image to chat.
     * @param {string} path         Server path or web URL
     * @param {string} [caption]
     * @param {string[]} [whisper]  User IDs; public when omitted
     * @returns {Promise<boolean>}  false when another module cancelled the share
     */
    async post(path, caption = "", whisper) {
        const src = normalizeSrc(path);
        // Other modules may cancel the share
        if (Hooks.call(HOOKS.SHARE_IMAGE, src, caption) === false) return false;
        const data = {
            content: buildMessageContent(src, caption),
            flags: { [MODULE_ID]: { image: src } }
        };
        if (whisper) data.whisper = whisper;
        await ChatMessage.implementation.create(data);
        // Preselect the same recipients next time
        if (whisper) setSetting(SETTINGS.LAST_WHISPER_TARGETS, whisper);
        Hooks.callAll(HOOKS.SHARED, src, caption);
        return true;
    }
};
