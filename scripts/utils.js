import { MODULE_ID, SETTINGS } from "./settings.js";

const LOG_PREFIX = "Nik's Show & Tell |";

/**
 * Log a debug message to the console, gated behind the debug setting.
 * Accepts any number of arguments, just like console.log.
 */
export function debugLog(...args) {
    try {
        if (game.settings.get(MODULE_ID, SETTINGS.DEBUG_LOGGING)) {
            console.log(`%c${LOG_PREFIX} DEBUG`, "color: #7c4dff; font-weight: bold;", ...args);
        }
    } catch {
        // Settings not yet registered — silently ignore
    }
}

export class ImageShareUtils {
    static get canUserShare() {
        const minRole = game.settings.get(MODULE_ID, SETTINGS.MIN_ROLE);
        return game.user.role >= minRole;
    }

    /**
     * Normalize an image source path.
     * If the path is a full URL pointing to the local Foundry server origin,
     * convert it to a root-relative path starting with "/" (e.g. "/ui/backgrounds/setup.webp")
     * so that other connected players on different IP/domain endpoints can load it cleanly
     * and ImagePopout resolves correctly regardless of current page route (/game).
     * @param {string} src
     * @returns {string}
     */
    static normalizeSrc(src) {
        if (!src) return "";
        if (src.startsWith("data:") || src.startsWith("blob:")) return src;

        try {
            const url = new URL(src, document.baseURI);
            if (url.origin === location.origin) {
                const path = url.pathname + url.search + url.hash;
                return path.startsWith("/") ? path : "/" + path;
            }
            return url.href;
        } catch {
            return src.startsWith("/") ? src : "/" + src;
        }
    }

    /**
     * Escape a string for safe insertion into an HTML attribute value.
     */
    static escapeAttr(str) {
        if (!str) return "";
        return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    /**
     * Returns the parsed upload target.
     * For S3: { source: "s3", bucket: "bucket-name", folder: "optional/path" }
     * For local: { source: "data", bucket: null, folder: "worlds/worldId/uploads" }
     */
    static get uploadTarget() {
        const raw = game.settings.get(MODULE_ID, SETTINGS.UPLOAD_LOCATION)?.trim() || "";
        return this.#parseUploadTarget(raw);
    }

    /**
     * @deprecated Use uploadTarget instead. Kept for backwards compatibility.
     */
    static get uploadLocation() {
        return this.uploadTarget.folder;
    }

    static #parseUploadTarget(raw) {
        // Detect S3 paths: s3://bucket-name  or  s3://bucket-name/path/within
        const s3Match = raw.match(/^s3:\/\/\/?([^/]+)(?:\/(.*))?$/i);
        if (s3Match) {
            const bucket = s3Match[1];
            let folder = (s3Match[2] || "").replace(/\/+$/, "");
            // Default sub-folder inside the bucket
            if (!folder) folder = "niks-show-and-tell-uploads";
            return { source: "s3", bucket, folder: folder.replace(/\/\/+/g, "/") };
        }

        // Non-S3 URL schemes (http://, ftp://, etc.) are invalid — fall back to default
        if (/^[a-z]+:\/\//i.test(raw)) {
            return { source: "data", bucket: null, folder: this.#normalizeLocalFolder("niks-show-and-tell-uploads") };
        }

        let dir = raw || "niks-show-and-tell-uploads";
        return { source: "data", bucket: null, folder: this.#normalizeLocalFolder(dir) };
    }

    static #normalizeLocalFolder(dir) {
        if (!dir.includes("/")) dir = `worlds/${game.world.id}/${dir}`;

        // Enforce strict user data paths — block any path under modules/ or systems/
        const badRoots = /^(modules|systems)(\/|$)|^worlds\/?$|^worlds\/[^/]+$/i;
        if (badRoots.test(dir)) {
            dir = `worlds/${game.world.id}/niks-show-and-tell-uploads`;
        }
        return dir.replace(/\/\/+/g, "/");
    }

    static async compressImage(fileOrBlob) {
        const quality = game.settings.get(MODULE_ID, SETTINGS.WEBP_QUALITY) || 0.8;

        // Create a bitmap from the source
        const bitmap = await createImageBitmap(fileOrBlob);

        // Draw to canvas
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(bitmap, 0, 0);

        // Convert to blob
        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (!blob) return reject(new Error("WebP conversion returned null"));
                resolve(blob);
            }, "image/webp", quality);
        });
    }

    static async fileToDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = reject;
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(file);
        });
    }

    static async blobToDataURL(blob) {
        return ImageShareUtils.fileToDataURL(new File([blob], "clipboard", { type: blob.type || "image/png" }));
    }

    static async blobFromDataURL(dataURL) {
        if (!dataURL) throw new Error("blobFromDataURL: no dataURL provided");

        // For actual data: URIs, fetch works perfectly
        if (dataURL.startsWith("data:")) {
            return await (await fetch(dataURL)).blob();
        }

        // For remote URLs (https://), try loading via canvas to bypass CORS
        return await ImageShareUtils.fetchImageViaCanvas(dataURL);
    }

    /**
     * Load a remote or local image URL via an <img> element + canvas.
     * This bypasses CORS fetch restrictions because browsers allow rendering
     * cross-origin images — we just can't fetch them programmatically.
     * @param {string} url - The image URL
     * @returns {Promise<Blob>} The image as a blob
     */
    static async fetchImageViaCanvas(url) {
        const isSameOrigin = /^data:|^blob:/i.test(url) || (new URL(url, document.baseURI).origin === location.origin);

        if (isSameOrigin) {
            try {
                const blob = await ImageShareUtils.#loadImageToCanvas(url, false);
                if (blob && blob.size > 0) return blob;
            } catch (e) {
                debugLog("fetchImageViaCanvas same-origin attempt failed:", e.message);
            }
        }

        // Attempt 1: With crossOrigin (clean canvas, if server allows CORS)
        try {
            const blob = await ImageShareUtils.#loadImageToCanvas(url, true);
            if (blob && blob.size > 0) return blob;
        } catch (e) {
            debugLog("fetchImageViaCanvas CORS attempt failed:", e.message);
        }

        // Attempt 2: Without crossOrigin (tainted canvas, but can still render)
        try {
            const blob = await ImageShareUtils.#loadImageToCanvas(url, false);
            if (blob && blob.size > 0) return blob;
        } catch (e) {
            debugLog("fetchImageViaCanvas non-CORS attempt failed:", e.message);
        }

        throw new Error(`Failed to load remote image due to CORS restrictions: ${url}`);
    }

    /**
     * @param {string} url
     * @param {boolean} useCORS - Whether to set crossOrigin="anonymous"
     * @returns {Promise<Blob>}
     */
    static #loadImageToCanvas(url, useCORS) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            if (useCORS) img.crossOrigin = "anonymous";

            img.onload = () => {
                try {
                    const canvas = document.createElement("canvas");
                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;
                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(img, 0, 0);
                    canvas.toBlob((blob) => {
                        if (blob && blob.size > 0) resolve(blob);
                        else reject(new Error("Canvas toBlob returned empty"));
                    }, "image/png");
                } catch (e) {
                    // SecurityError from tainted canvas
                    reject(e);
                }
            };

            img.onerror = () => reject(new Error(`Image load failed for: ${url}`));
            img.src = url;
        });
    }

    static async imageFromClipboard() {
        try {
            if (navigator.permissions?.query) {
                const perm = await navigator.permissions.query({ name: "clipboard-read" });
                if (perm.state === "denied") return null;
            }
            if (!navigator.clipboard?.read) return null;

            const items = await navigator.clipboard.read();
            for (const item of items) {
                const type = item.types.find((t) => t.startsWith("image/"));
                if (!type) continue;
                const blob = await item.getType(type);
                return await ImageShareUtils.blobToDataURL(blob);
            }
        } catch (e) {
            console.warn("Clipboard read failed or denied", e);
        }
        return null;
    }

    static extFromMime(mime) {
        if (!mime?.includes("/")) return "png";
        let ext = mime.split("/")[1]?.toLowerCase();
        // Strip structured syntax suffix (e.g. svg+xml → svg)
        if (ext?.includes("+")) ext = ext.split("+")[0];
        // Prefer jpg for jpeg, otherwise standard.
        if (ext === "jpeg") return "jpg";
        return ext || "png";
    }
}
