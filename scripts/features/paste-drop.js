import { MODULE_ID } from "../constants.js";
import { canUserShare, localize, log } from "../helpers.js";
import { extFromMime, formatForPath, isAnimated, isImageUrl } from "../image/formats.js";
import { fetchImageBlob, prepareForUpload } from "../image/processing.js";
import { fileNameFromUrl, serverPath, withExtension } from "../image/urls.js";
import { getSetting, SETTINGS } from "../settings.js";
import { Sharing } from "./sharing.js";
import { Uploads } from "./uploads.js";

/** Elements that accept dropped images: the chat log (sidebar, popout or notifications) and the chat input. */
const DROP_ZONES = ".chat-scroll, #chat-notifications, #chat-message";

/** Editable elements whose pastes are left to the browser and Foundry, unless it is the chat input. */
const EDITABLE = "input, textarea, select, [contenteditable]:not([contenteditable='false']), prose-mirror, code-mirror";

/** How long downloading an animated original may take before the clipboard's still image is used. */
const ORIGINAL_FETCH_TIMEOUT_MS = 8000;

/** The drop hint element and the zone it covers, while a drag is over a drop zone. */
const overlay = { element: null, zone: null };

/**
 * Sharing images by pasting them anywhere outside text fields, or into the chat input, and by
 * dropping them on the chat. Listeners are always installed; the role, paste and drag & drop
 * settings are checked per event, so changing them takes effect without a reload.
 */
export const PasteDrop = {
    init() {
        // Capture phase, so the chat input's editor does not insert the image first
        window.addEventListener("paste", (event) => handleTransfer(event, event.clipboardData), { capture: true });
        document.addEventListener("drop", (event) => {
            hideOverlay();
            if (dropZoneFor(event)) handleTransfer(event, event.dataTransfer);
        }, { capture: true });

        // dragover fires every few milliseconds during any drag, including token and item drags on
        // the canvas — keep it cheap: type check first, DOM work only when the zone changes.
        document.addEventListener("dragover", (event) => {
            const zone = isExternalDrag(event) ? dropZoneFor(event) : null;
            if (zone) showOverlay(zone);
            else hideOverlay();
        });
        document.addEventListener("dragleave", (event) => {
            if (!overlay.element) return;
            // relatedTarget is null when the pointer leaves the window
            if (!(event.relatedTarget instanceof Element) || !event.relatedTarget.closest(DROP_ZONES)) hideOverlay();
        });
    }
};

/* -------------------------------------------- */
/*  Paste & Drop Handling                       */
/* -------------------------------------------- */

/**
 * @typedef {object} TransferContents
 * @property {File|null} file          An image file, if the transfer holds a readable one
 * @property {boolean} hasImageItem    The transfer announced an image, even if it could not be read
 * @property {string|null} htmlUrl     The src of the first <img> in pasted/dropped HTML
 * @property {string|null} plainUrl    Plain text that is a single image URL
 * @property {boolean} localPath       Plain text that is a path on the user's computer
 */

/**
 * @param {ClipboardEvent|DragEvent} event
 * @param {DataTransfer|null} dt
 */
async function handleTransfer(event, dt) {
    if (!dt || !canUserShare()) return;
    const target = event.target instanceof Element ? event.target : null;
    // Drops only get here from a chat drop zone; pastes count as chat when aimed at the chat input
    const chatTarget = event.type === "drop" || !!target?.closest("#chat-message");
    if (!chatTarget && target?.closest(EDITABLE)) return;
    // Users who leave canvas pastes to another module (e.g. to create tiles) can limit pasting to the chat input
    if (event.type === "paste") {
        const mode = getSetting(SETTINGS.PASTE_MODE);
        if (mode === "off" || (mode === "chat" && !chatTarget)) return;
    }

    const contents = readTransfer(dt, chatTarget);
    log.debug(`${event.type} received:`, contents);
    if (contents.localPath && chatTarget) ui.notifications.warn(localize("Notifications.LocalFile"));

    // Image URLs are only taken from the chat; elsewhere pasted text stays text
    const url = !contents.file && chatTarget ? contents.htmlUrl ?? contents.plainUrl : null;
    // Decide synchronously: once the handler awaits, the browser has already inserted the pasted content
    if (!contents.file && !url && !(contents.hasImageItem && chatTarget)) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    // Images already on this server (e.g. copied or dragged from a journal) are shared by their
    // path — no download, no duplicate upload, no upload permission needed.
    const existing = [url, contents.htmlUrl].map((u) => serverPath(u)).find(Boolean);
    if (existing) return Sharing.shareNewImage({ url: existing });
    if (!Uploads.canUpload) return ui.notifications.warn(localize("Notifications.NoUploadPermission"));
    if (url) return Sharing.shareNewImage({ url });

    const stopNotice = startBusyNotice();
    try {
        const file = await resolveFile(event, contents);
        if (file) return await Sharing.shareNewImage({ file });
        ui.notifications.warn(localize("Notifications.PasteFailed"));
    } catch (err) {
        log.error("Could not process the pasted or dropped image:", err);
        ui.notifications.warn(localize("Notifications.PasteFailed"));
    } finally {
        stopNotice();
    }
}

/**
 * Read what a paste or drop contains. Synchronous, since DataTransfer contents are only
 * available while the event is being dispatched.
 * @param {DataTransfer} dt
 * @param {boolean} chatTarget
 * @returns {TransferContents}
 */
function readTransfer(dt, chatTarget) {
    const contents = { file: null, hasImageItem: false, htmlUrl: null, plainUrl: null, localPath: false };

    for (const item of dt.items ?? []) {
        if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
        contents.hasImageItem = true;
        const file = item.getAsFile();
        // Chrome on Windows can return an empty "ghost" file when it fails to turn the copied
        // image into clipboard data; ignore it so the other sources are tried
        if (file?.size) {
            contents.file = file;
            break;
        }
    }
    if (!contents.file) {
        const file = Array.from(dt.files ?? []).find((f) => f.type.startsWith("image/") && f.size);
        if (file) {
            contents.file = file;
            contents.hasImageItem = true;
        }
    }

    // The HTML's image is the original when the clipboard only holds a rasterized copy, and shows
    // whether the image is already on this server. Only parsed when it can be used, since pasted
    // HTML can be large (e.g. from Word).
    const html = (contents.file || chatTarget) ? dt.getData("text/html") : "";
    if (html?.includes("<img")) {
        const src = new DOMParser().parseFromString(html, "text/html").querySelector("img[src]")?.src;
        if (src && /^https?:\/\//i.test(src)) contents.htmlUrl = src;
    }

    if (!contents.file && !contents.htmlUrl) {
        const plain = dt.getData("text/plain")?.trim() ?? "";
        if (isImageUrl(plain)) contents.plainUrl = plain;
        contents.localPath = /^file:|^[a-z]:\\/i.test(plain);
    }
    return contents;
}

/**
 * Turn a paste or drop into a file ready for upload.
 * @param {ClipboardEvent|DragEvent} event
 * @param {TransferContents} contents
 * @returns {Promise<File|null>}
 */
async function resolveFile(event, contents) {
    let file = contents.file;
    // A paste that announced an image which could not be read synchronously (e.g. the Chrome
    // ghost file): ask the Async Clipboard API. Not done otherwise, since reading the clipboard
    // can trigger a permission prompt and pick up unrelated data.
    if (!file && event.type === "paste" && contents.hasImageItem) file = await readClipboardImage();
    if (!file) return null;

    // Copy the bytes into memory first. Clipboard-backed files can become unreadable later on
    // Chrome/Windows; a memory-backed file cannot.
    try {
        file = new File([await file.arrayBuffer()], file.name, { type: file.type || "image/png" });
    } catch (err) {
        log.warn("Could not read the pasted file:", err);
        return null;
    }
    if (!file.size) return null;

    // "Copy Image" in browsers puts a static PNG (the first frame) on the clipboard. If the
    // copied HTML points at an animated original, use that instead.
    if (file.type === "image/png" && contents.htmlUrl) {
        const original = await fetchAnimatedOriginal(contents.htmlUrl);
        if (original) return prepareForUpload(original, { animated: true });
    }
    return prepareForUpload(file);
}

/**
 * Read an image from the system clipboard through the Async Clipboard API.
 * @returns {Promise<File|null>}
 */
async function readClipboardImage() {
    try {
        if (!navigator.clipboard?.read) return null;
        const permission = await navigator.permissions?.query({ name: "clipboard-read" }).catch(() => null);
        if (permission?.state === "denied") return null;
        for (const item of await navigator.clipboard.read()) {
            const type = item.types.find((t) => t.startsWith("image/"));
            if (!type) continue;
            const blob = await item.getType(type);
            return new File([blob], `image.${extFromMime(type)}`, { type });
        }
    } catch (err) {
        log.debug("Async clipboard read failed:", err.message);
    }
    return null;
}

/**
 * Download the original behind a pasted image's HTML, if it is animated.
 * @param {string} url
 * @returns {Promise<File|null>}
 */
async function fetchAnimatedOriginal(url) {
    const name = fileNameFromUrl(url);
    // Skip the download for formats that can never be animated
    if (formatForPath(name)?.animated === false) return null;
    try {
        const blob = await fetchImageBlob(url, { signal: AbortSignal.timeout(ORIGINAL_FETCH_TIMEOUT_MS), allowRasterize: false });
        if (!(await isAnimated(blob))) return null;
        log.debug("Using the animated original instead of the clipboard's still image:", { url, type: blob.type, size: blob.size });
        return new File([blob], withExtension(name, extFromMime(blob.type)), { type: blob.type });
    } catch (err) {
        log.debug("Could not download the original image:", err.message);
        return null;
    }
}

/**
 * Show a "Preparing image…" notice if processing takes noticeably long. Quick pastes finish
 * before the delay, so they never flash a notification.
 * @returns {() => void}  Cancels or removes the notice
 */
function startBusyNotice() {
    let notice = null;
    const timer = setTimeout(() => {
        notice = ui.notifications.info(localize("Notifications.PreparingImage"), { permanent: true });
    }, 400);
    return () => {
        clearTimeout(timer);
        if (notice) ui.notifications.remove(notice);
    };
}

/* -------------------------------------------- */
/*  Drop Zones                                  */
/* -------------------------------------------- */

/**
 * @param {DragEvent} event
 * @returns {Element|null}  The chat drop zone under the pointer, if dropping is allowed
 */
function dropZoneFor(event) {
    if (!(event.target instanceof Element)) return null;
    if (!canUserShare() || !getSetting(SETTINGS.ENABLE_DRAG_DROP)) return null;
    return event.target.closest(DROP_ZONES);
}

/**
 * Whether a drag carries external content (files, images dragged from web pages). Foundry
 * document drags carry text/plain JSON only.
 * @param {DragEvent} event
 * @returns {boolean}
 */
function isExternalDrag(event) {
    const types = event.dataTransfer?.types ?? [];
    return ["Files", "text/uri-list", "text/html"].some((type) => Array.prototype.includes.call(types, type));
}

/**
 * Show the drop hint over a drop zone. The hint is fixed-positioned on <body>, so it covers the
 * visible area even when the zone is a scrolled container. Layout is only read when the zone changes.
 * @param {Element} zone
 */
function showOverlay(zone) {
    if (overlay.zone === zone) return;
    if (!overlay.element) {
        overlay.element = document.createElement("div");
        overlay.element.className = `${MODULE_ID}-drop-overlay`;
        overlay.element.textContent = localize("Notifications.DropHint");
        document.body.append(overlay.element);
    }
    overlay.zone = zone;
    const { top, left, width, height } = zone.getBoundingClientRect();
    Object.assign(overlay.element.style, { top: `${top}px`, left: `${left}px`, width: `${width}px`, height: `${height}px` });
}

function hideOverlay() {
    overlay.element?.remove();
    overlay.element = overlay.zone = null;
}
