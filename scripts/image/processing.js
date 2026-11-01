import { log } from "../helpers.js";
import { getSetting, SETTINGS } from "../settings.js";
import { isAnimated, sniffImageMime } from "./formats.js";
import { absoluteUrl, isSameOrigin } from "./urls.js";

/**
 * Draw an image to a canvas and encode it. The canvas backing store (width × height × 4 bytes)
 * is released right away instead of waiting for garbage collection.
 * @param {CanvasImageSource & {width: number, height: number}} source  An ImageBitmap or loaded <img>
 * @param {object} [options]
 * @param {string} [options.type="image/png"]
 * @param {number} [options.quality]       Encoder quality for lossy types
 * @param {number} [options.maxDimension]  Downscale so the longest side is at most this; 0 = keep size
 * @returns {Promise<{blob: Blob, resized: boolean}>}
 */
export function encodeImage(source, { type = "image/png", quality, maxDimension = 0 } = {}) {
    const width = source.naturalWidth || source.width;
    const height = source.naturalHeight || source.height;
    const longest = Math.max(width, height);
    const scale = maxDimension > 0 && longest > maxDimension ? maxDimension / longest : 1;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            canvas.width = canvas.height = 0;
            if (blob?.size) resolve({ blob, resized: scale < 1 });
            else reject(new Error(`Encoding to ${type} returned no data`));
        }, type, quality);
    });
}

/**
 * Re-encode an image blob.
 * @param {Blob} blob
 * @param {object} [options]  See encodeImage
 * @returns {Promise<{blob: Blob, resized: boolean}>}
 */
export async function reencodeBlob(blob, options) {
    const bitmap = await createImageBitmap(blob);
    try {
        return await encodeImage(bitmap, options);
    } finally {
        bitmap.close();
    }
}

/**
 * Fetch an image URL and return its original bytes (preserving animation).
 * data: and blob: URLs are read directly. If a cross-origin fetch is blocked, the image is
 * loaded through an <img> with CORS and rasterized instead (first frame only).
 * @param {string} url
 * @param {object} [options]
 * @param {AbortSignal} [options.signal]          Aborts the download
 * @param {boolean} [options.allowRasterize=true] Allow the rasterizing fallback
 * @returns {Promise<Blob>}
 */
export async function fetchImageBlob(url, { signal, allowRasterize = true } = {}) {
    const href = absoluteUrl(url);
    const sameOrigin = isSameOrigin(href);
    const attempts = [{ mode: sameOrigin ? "same-origin" : "cors", signal }];
    // A cached copy loaded earlier by an <img> without CORS headers (common with S3) makes
    // CORS fetches fail, so retry cross-origin requests bypassing the HTTP cache.
    if (!sameOrigin) attempts.push({ mode: "cors", cache: "reload", signal });

    for (const init of attempts) {
        try {
            const response = await fetch(href, init);
            if (!response.ok) throw new Error(`HTTP status ${response.status}`);
            let blob = await response.blob();
            // Servers (e.g. S3) may report a generic type — correct it from the magic bytes
            if (!blob.type?.startsWith("image/")) {
                const sniffed = await sniffImageMime(blob);
                if (!sniffed) throw new Error(`Response is not an image (${blob.type || "unknown type"})`);
                blob = new Blob([blob], { type: sniffed });
            }
            if (blob.size) return blob;
        } catch (e) {
            log.debug("Image fetch attempt failed:", init.cache ?? init.mode, e.message);
            if (signal?.aborted) throw e;
        }
    }
    if (!allowRasterize) throw new Error(`Could not fetch image: ${href}`);
    log.debug("Falling back to rasterizing the image:", href);
    return rasterizeUrl(href, !sameOrigin);
}

/**
 * Load an image URL into an <img> and encode it as PNG. Cross-origin images are requested with
 * CORS, since a canvas tainted by a non-CORS image cannot be exported.
 * @param {string} url
 * @param {boolean} useCors
 * @returns {Promise<Blob>}
 */
async function rasterizeUrl(url, useCors) {
    const img = new Image();
    if (useCors) img.crossOrigin = "anonymous";
    img.src = url;
    try {
        await img.decode();
        return (await encodeImage(img)).blob;
    } catch (e) {
        log.debug("Rasterizing failed:", e.message);
        throw new Error(`The image could not be loaded, probably because of CORS restrictions: ${url}`);
    }
}

/**
 * Get an image ready for upload: re-encode it as WebP (downscaled to the "Maximum Image Size"
 * setting) when the "Compress Images" setting is on and that makes it smaller. Animated images
 * are never re-encoded, since a canvas keeps only their first frame.
 * @param {File} file
 * @param {object} [options]
 * @param {boolean} [options.animated]  Whether the file is known to be animated; detected otherwise
 * @returns {Promise<File>}
 */
export async function prepareForUpload(file, { animated } = {}) {
    if (!getSetting(SETTINGS.COMPRESS_IMAGES)) {
        log.debug("Compression disabled, uploading original");
        return file;
    }
    if (animated ?? await isAnimated(file)) {
        log.debug("Animated image, not compressing:", { type: file.type, size: file.size });
        return file;
    }
    try {
        const { blob, resized } = await reencodeBlob(file, {
            type: "image/webp",
            quality: getSetting(SETTINGS.WEBP_QUALITY) || 0.8,
            maxDimension: Number(getSetting(SETTINGS.MAX_IMAGE_DIMENSION)) || 0
        });
        // A downscaled result is always used (it enforces the size limit); otherwise only when it is smaller
        if (!resized && blob.size >= file.size) {
            log.debug("Compressed image is not smaller, keeping original:", { original: file.size, compressed: blob.size });
            return file;
        }
        const name = file.name ? file.name.replace(/\.[^.]+$/, "") + ".webp" : "image.webp";
        log.debug("Compressed image:", { name, original: file.size, compressed: blob.size, resized });
        return new File([blob], name, { type: "image/webp" });
    } catch (e) {
        log.warn("Compression failed, uploading original:", e);
        return file;
    }
}
