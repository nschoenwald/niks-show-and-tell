/** Top-level folders of Foundry's own asset routes. */
const FOUNDRY_ASSET_PATH = /^\/(ui|systems|modules|worlds|tokens|tiles|cards|icons|assets|fonts|sounds|music)\//i;
const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|::1)$/i;

/**
 * Whether a URL only exists in this browser (data: or blob:), so other users cannot load it.
 * @param {string} url
 * @returns {boolean}
 */
export function isLocalOnlyUrl(url) {
    return /^(data|blob):/i.test(url ?? "");
}

/**
 * @param {string} url  Absolute, root-relative or relative URL
 * @returns {string}    The absolute URL
 */
export function absoluteUrl(url) {
    return new URL(url, document.baseURI).href;
}

/**
 * @param {string} url
 * @returns {boolean}  Whether a URL can be fetched without CORS (same origin, data: or blob:)
 */
export function isSameOrigin(url) {
    if (isLocalOnlyUrl(url)) return true;
    try {
        return new URL(url, document.baseURI).origin === location.origin;
    } catch {
        return false;
    }
}

/**
 * Normalize an image source. URLs served by this Foundry server become root-relative paths
 * (e.g. "/worlds/x/handout.webp"), so every user can load them whatever address they connect
 * with, and the same image always has the same path. Anything else is returned as an absolute URL.
 *
 * A URL counts as this server's when it is
 * - on the same origin as the page, or
 * - on this host or a loopback address, with the same port or under one of Foundry's asset folders
 *   (the GM's own browser may reach the server as localhost:30000 behind a reverse proxy).
 * @param {string} src
 * @returns {string}
 */
export function normalizeSrc(src) {
    if (!src) return "";
    if (isLocalOnlyUrl(src)) return src;
    let url;
    try {
        url = new URL(src, document.baseURI);
    } catch {
        return src;
    }
    const sameOrigin = url.origin === location.origin;
    const thisMachine = url.hostname === location.hostname || LOOPBACK_HOST.test(url.hostname);
    const foundryRoute = url.port === location.port || FOUNDRY_ASSET_PATH.test(url.pathname);
    if (sameOrigin || (thisMachine && foundryRoute)) return url.pathname + url.search + url.hash;
    return url.href;
}

/**
 * If an image is served by this Foundry server, return its root-relative path.
 * Such images can be shared directly instead of being uploaded again.
 * @param {string} url
 * @returns {string|null}
 */
export function serverPath(url) {
    if (!url || isLocalOnlyUrl(url)) return null;
    const normalized = normalizeSrc(url);
    return normalized.startsWith("/") ? normalized : null;
}

/**
 * The decoded last path segment of a URL, without query or fragment.
 * @param {string} url
 * @returns {string}  "" for data:/blob: URLs and URLs without a file name
 */
export function fileNameFromUrl(url) {
    if (!url || isLocalOnlyUrl(url)) return "";
    try {
        return decodeURIComponent(new URL(url, document.baseURI).pathname.split("/").pop() || "");
    } catch {
        return "";
    }
}

/**
 * Make a file name safe for upload: no folders, only letters, digits, ".", "-" and "_".
 * @param {string} name
 * @returns {string}
 */
export function sanitizeFileName(name) {
    return String(name ?? "").split(/[/\\]/).pop().replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * Give a file name the extension of its format, keeping a name that already has one.
 * @param {string} name  May be empty
 * @param {string} ext   Extension without the dot
 * @returns {string}
 */
export function withExtension(name, ext) {
    if (!name) return `image.${ext}`;
    return /\.[^.]+$/.test(name) ? name : `${name}.${ext}`;
}
