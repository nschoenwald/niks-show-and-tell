import { DEFAULT_UPLOAD_FOLDER, HOOKS, MODULE_ID } from "../constants.js";
import { canUserShare, localize, log, UserFacingError } from "../helpers.js";
import { extFromMime, formatForMime, sniffImageMime } from "../image/formats.js";
import { fetchImageBlob } from "../image/processing.js";
import { isLocalOnlyUrl, sanitizeFileName } from "../image/urls.js";
import { getSetting, SETTINGS } from "../settings.js";

const SOCKET_NAME = `module.${MODULE_ID}`;

/** How long a player waits for the GM's client to answer a relayed upload. */
const RELAY_TIMEOUT_MS = 60_000;

/** Largest file the GM's client accepts through the relay. */
const RELAY_MAX_BYTES = 50 * 1024 * 1024;

/** Relay requests awaiting the GM's answer, by request ID. */
const pendingRelays = new Map();

/** Upload folders known to exist in this session, as "source:bucket:path". */
const knownFolders = new Set();

/**
 * Uploads shared images to the configured folder — directly when the user has the
 * "Upload New Files" permission, otherwise (if enabled) through the active GM's client.
 */
export const Uploads = {
    init() {
        game.socket.on(SOCKET_NAME, onSocketMessage);
    },

    /** Whether the current user can get an image uploaded, directly or via the GM relay. */
    get canUpload() {
        return game.user.hasPermission("FILES_UPLOAD") || this.relayAvailable;
    },

    /** Whether uploads can be relayed through a connected GM. */
    get relayAvailable() {
        const gm = game.users.activeGM;
        return !!getSetting(SETTINGS.GM_UPLOAD_RELAY) && !!gm && gm !== game.user;
    },

    /**
     * Upload an image and return its server path.
     * @param {object} source
     * @param {File} [source.file]  An in-memory image file
     * @param {string} [source.url] A data:, blob: or remote URL, downloaded when no file is given
     * @returns {Promise<string>}
     * @throws {UserFacingError}  With a localized message for expected failures
     */
    async upload({ file, url } = {}) {
        const direct = game.user.hasPermission("FILES_UPLOAD");
        if (!direct && !this.relayAvailable) throw new UserFacingError(localize("Notifications.NoUploadPermission"));

        let blob = file;
        if (!blob && url) {
            try {
                blob = await fetchImageBlob(url);
            } catch (e) {
                log.debug("Image download failed:", e.message);
                throw new UserFacingError(localize("Notifications.RemoteImageBlocked"));
            }
        }
        if (!blob?.size) throw new UserFacingError(localize("Notifications.EmptyImage"));

        const type = blob.type || "image/png";
        const name = timestampedName(file?.name || (url && !isLocalOnlyUrl(url) ? url : ""), type);
        const upload = new File([blob], name, { type });
        log.debug("Uploading:", { name, size: upload.size, type, direct });
        const path = direct ? await storeFile(upload, game.user) : await requestRelayUpload(upload);

        Hooks.callAll(HOOKS.IMAGE_UPLOADED, path, upload);
        return path;
    }
};

/**
 * Build the uploaded file's name: <YYYYMMDDHHMMSS>-<sanitized name>.<ext>
 * @param {string} original  Original file name or URL; may be empty
 * @param {string} mime
 * @returns {string}
 */
function timestampedName(original, mime) {
    const ext = extFromMime(mime);
    let base = sanitizeFileName(original.split(/[?#]/)[0]).replace(/\.[^.]*$/, "");
    if (!base.replace(/_/g, "")) base = `image-${foundry.utils.randomID(8)}`;
    return `${localTimestamp().replace(/\D/g, "")}-${base}.${ext}`;
}

/** @returns {string}  The current local time as "YYYY-MM-DD HH:MM:SS" */
function localTimestamp() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} `
        + `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

/**
 * Parse the "Upload Location" setting.
 * - "s3://bucket" or "s3://bucket/folder" uploads to an S3 bucket
 * - a bare folder name is placed inside the world folder
 * - anything else is a path in the user data folder; module, system and top-level world
 *   folders are refused in favour of the default
 * @returns {{source: string, bucket: string|null, folder: string}}
 */
function uploadTarget() {
    const raw = getSetting(SETTINGS.UPLOAD_LOCATION)?.trim() ?? "";
    const worldDefault = `worlds/${game.world.id}/${DEFAULT_UPLOAD_FOLDER}`;
    const tidy = (path) => path.replace(/\/{2,}/g, "/").replace(/^\/|\/$/g, "");

    const s3 = /^s3:\/{2,3}([^/]+)\/?(.*)$/i.exec(raw);
    if (s3) return { source: "s3", bucket: s3[1], folder: tidy(s3[2]) || DEFAULT_UPLOAD_FOLDER };

    // Other URL schemes are not upload targets
    if (!raw || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return { source: "data", bucket: null, folder: worldDefault };

    let folder = tidy(raw);
    if (!folder.includes("/")) folder = `worlds/${game.world.id}/${folder}`;
    if (/^(modules|systems)(\/|$)|^worlds(\/[^/]+)?$/i.test(folder)) folder = worldDefault;
    return { source: "data", bucket: null, folder };
}

/**
 * The folder chosen by the "Organize Uploads" setting.
 * @param {string} base
 * @param {User} owner
 * @returns {string}
 */
function withSubfolder(base, owner) {
    switch (getSetting(SETTINGS.UPLOAD_SUBFOLDER)) {
        case "user": return `${base}/${owner?.name?.slugify({ strict: true }) || owner?.id || "unknown"}`;
        case "month": return `${base}/${localTimestamp().slice(0, 7)}`;
        default: return base;
    }
}

/**
 * Create a folder and its parents if they are missing. Users without the "Browse File Explorer"
 * permission cannot check whether a folder exists, so creation errors (e.g. "already exists")
 * are tolerated; the upload itself reports a folder that is really missing.
 */
async function ensureFolder(FilePicker, source, folder, options) {
    const cacheKey = `${source}:${options.bucket ?? ""}:${folder}`;
    if (knownFolders.has(cacheKey)) return;
    try {
        await FilePicker.browse(source, folder, options);
    } catch {
        log.debug("Creating upload folder:", folder);
        let path = "";
        for (const part of folder.split("/")) {
            path = path ? `${path}/${part}` : part;
            try {
                await FilePicker.createDirectory(source, path, options);
            } catch (e) {
                log.debug("Could not create folder (it may already exist):", path, e.message);
            }
        }
    }
    knownFolders.add(cacheKey);
}

/**
 * Upload a file to the configured folder. Runs on the uploading user's client, or on the GM's
 * for relayed uploads.
 * @param {File} file
 * @param {User} owner  The user the image belongs to (for per-user subfolders)
 * @returns {Promise<string>}  The uploaded file's path
 */
async function storeFile(file, owner) {
    const FilePicker = foundry.applications.apps.FilePicker.implementation;
    const { source, bucket, folder: base } = uploadTarget();
    const folder = withSubfolder(base, owner);
    const options = bucket ? { bucket } : {};
    await ensureFolder(FilePicker, source, folder, options);

    // notify: false — the chat message is the confirmation; Foundry's "saved to…" toast is noise
    const result = await FilePicker.upload(source, folder, file, options, { notify: false });
    if (!result?.path) {
        log.debug("Upload returned no path:", result);
        // The folder may have been deleted since it was checked
        knownFolders.delete(`${source}:${bucket ?? ""}:${folder}`);
        throw new UserFacingError(localize("Notifications.UploadNoPath"));
    }
    return result.path;
}

/* -------------------------------------------- */
/*  GM Upload Relay                             */
/* -------------------------------------------- */

/**
 * Ask the active GM's client to upload a file on this user's behalf. The request goes to that
 * GM only, not to every connected client.
 * @param {File} file
 * @returns {Promise<string>}  The uploaded file's path
 */
async function requestRelayUpload(file) {
    if (file.size > RELAY_MAX_BYTES) throw new UserFacingError(localize("Notifications.RelayTooLarge"));
    const gm = game.users.activeGM;
    const requestId = foundry.utils.randomID();
    const data = await file.arrayBuffer();
    log.debug("Requesting GM relay upload:", { requestId, gm: gm.name, name: file.name, size: file.size });

    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            pendingRelays.delete(requestId);
            reject(new UserFacingError(localize("Notifications.RelayTimeout")));
        }, RELAY_TIMEOUT_MS);
        pendingRelays.set(requestId, { resolve, reject, timer, gmId: gm.id });
        game.socket.emit(SOCKET_NAME, { action: "upload", requestId, name: file.name, data }, { recipients: [gm.id] });
    });
}

/**
 * @param {object} message
 * @param {string} senderId  Set by the server, so it cannot be forged by the sender
 */
function onSocketMessage(message, senderId) {
    if (message?.action === "upload") handleRelayRequest(message, senderId);
    else if (message?.action === "uploadResult") handleRelayResult(message, senderId);
}

/** On the active GM's client: validate and upload a player's image, then answer with the path. */
async function handleRelayRequest({ requestId, name, data }, senderId) {
    if (!game.user.isActiveGM) return;
    const reply = (result) => game.socket.emit(SOCKET_NAME, { action: "uploadResult", requestId, ...result },
        { recipients: [senderId] });

    try {
        const requester = game.users.get(senderId);
        const allowed = getSetting(SETTINGS.GM_UPLOAD_RELAY) && requester && canUserShare(requester);
        const validSize = data instanceof ArrayBuffer && data.byteLength > 0 && data.byteLength <= RELAY_MAX_BYTES;
        if (!allowed || !validSize) return reply({ error: "Notifications.RelayRejected" });

        // Trust the bytes, not the sender's claims: the type comes from the file's magic bytes
        // and the extension is forced to match it.
        const blob = new Blob([data]);
        const mime = await sniffImageMime(blob);
        if (!formatForMime(mime)?.relay) return reply({ error: "Notifications.RelayRejected" });
        const base = sanitizeFileName(name).replace(/\.[^.]*$/, "") || `image-${foundry.utils.randomID(8)}`;

        log.debug("Handling relay upload:", { requestId, requester: requester.name, size: data.byteLength, mime });
        const path = await storeFile(new File([blob], `${base}.${extFromMime(mime)}`, { type: mime }), requester);
        reply({ path });
    } catch (err) {
        log.error("Relay upload failed:", err);
        reply({ error: "Notifications.UploadFailed" });
    }
}

/** On the requesting player's client: settle the pending relay request. */
function handleRelayResult({ requestId, path, error }, senderId) {
    const pending = pendingRelays.get(requestId);
    if (!pending || pending.gmId !== senderId) return;
    pendingRelays.delete(requestId);
    clearTimeout(pending.timer);
    if (path) pending.resolve(path);
    else pending.reject(new UserFacingError(localize(error || "Notifications.UploadFailed")));
}
