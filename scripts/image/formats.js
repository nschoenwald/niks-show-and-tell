import { IMAGE_FORMATS } from "../constants.js";
import { log } from "../helpers.js";

/**
 * @param {string} mime
 * @returns {object|undefined}  The IMAGE_FORMATS entry for a MIME type
 */
export function formatForMime(mime) {
    const type = mime?.split(";")[0].trim().toLowerCase();
    return IMAGE_FORMATS.find((f) => f.mime === type);
}

/**
 * @param {string} path  A file name, path or URL path
 * @returns {object|undefined}  The IMAGE_FORMATS entry for the path's extension
 */
export function formatForPath(path) {
    const ext = /\.([a-z0-9]+)$/i.exec(path ?? "")?.[1]?.toLowerCase();
    return ext ? IMAGE_FORMATS.find((f) => f.ext.includes(ext)) : undefined;
}

/**
 * File extension for a MIME type: the known one, else the MIME subtype, else "png".
 * @param {string} mime
 * @returns {string}
 */
export function extFromMime(mime) {
    const known = formatForMime(mime)?.ext[0];
    if (known) return known;
    const subtype = /^image\/([a-z0-9]+)/i.exec(mime ?? "")?.[1];
    return subtype?.toLowerCase() ?? "png";
}

/**
 * Build a regex matching http(s) URLs whose path ends in one of the given extensions.
 * A query string or fragment after the extension is allowed (e.g. signed CDN links). The URL must
 * end there, apart from trailing punctuation of the surrounding sentence, which is not matched.
 * @param {string[]} extensions
 * @param {string} flags
 * @returns {RegExp}
 */
function imageUrlRegex(extensions, flags) {
    const ext = extensions.join("|");
    const query = String.raw`(?:[?#][^\s"'<>]*?)?`;
    const end = String.raw`(?=[.,!?;:)\]]*(?:[\s"'<>]|$))`;
    return new RegExp(String.raw`https?:\/\/[^\s"'<>?#]+\.(?:${ext})` + query + end, flags);
}

/** Image URLs inside chat text that are embedded as images (global, for String#matchAll). */
export const EMBEDDABLE_IMAGE_URLS = imageUrlRegex(IMAGE_FORMATS.filter((f) => f.embed).flatMap((f) => f.ext), "gi");

/** A string that is exactly one image URL of any known format. */
const SINGLE_IMAGE_URL = new RegExp(`^${imageUrlRegex(IMAGE_FORMATS.flatMap((f) => f.ext), "").source}$`, "i");

/**
 * @param {string} text
 * @returns {boolean}  Whether the text is a single image URL
 */
export function isImageUrl(text) {
    return SINGLE_IMAGE_URL.test(text?.trim() ?? "");
}

/**
 * Detect the image MIME type from a blob's magic bytes.
 * Useful when a server or the clipboard reports an empty/generic type.
 * @param {Blob} blob
 * @returns {Promise<string|null>} e.g. "image/gif", or null if unrecognized
 */
export async function sniffImageMime(blob) {
    if (!blob?.size) return null;
    const b = new Uint8Array(await blob.slice(0, 32).arrayBuffer());
    const ascii = (start, end) => String.fromCharCode(...b.subarray(start, end));
    if (ascii(0, 4) === "GIF8") return "image/gif";
    if (b[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
    if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return "image/jpeg";
    if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
    if (ascii(4, 8) === "ftyp" && /^avi[fs]$/.test(ascii(8, 12))) return "image/avif";
    if (ascii(0, 2) === "BM") return "image/bmp";
    return null;
}

/**
 * Determine whether an image blob contains more than one frame.
 * Supports GIF, APNG, animated WebP and AVIF image sequences.
 * Canvas-based processing (compression, rasterization) keeps only the first frame,
 * so animated images must bypass it.
 * Only the bytes needed for the decision are read, so large files are not copied in full.
 * @param {Blob} blob
 * @returns {Promise<boolean>}
 */
export async function isAnimated(blob) {
    if (!blob?.size) return false;
    try {
        const mime = await sniffImageMime(blob);
        const read = async (start, end) => new Uint8Array(await blob.slice(start, end).arrayBuffer());
        const ascii = (b, start, end) => String.fromCharCode(...b.subarray(start, end));

        if (mime === "image/gif") {
            // The second frame usually starts shortly after the first, so read progressively
            for (let size = 256 * 1024; ; size *= 4) {
                const b = await read(0, size);
                const { frames, complete } = countGifFrames(b, 2);
                if (frames > 1) return true;
                if (complete || b.length >= blob.size) return false;
            }
        }

        if (mime === "image/png") {
            // APNG: an acTL chunk must appear before the first IDAT chunk.
            // Chunk headers are read one at a time, skipping over chunk data.
            let p = 8;
            while (p + 12 <= blob.size) {
                const header = await read(p, p + 12);
                const view = new DataView(header.buffer);
                const type = ascii(header, 4, 8);
                if (type === "acTL") return view.getUint32(8) > 1;
                if (type === "IDAT" || type === "IEND") return false;
                p += 12 + view.getUint32(0);
            }
            return false;
        }

        if (mime === "image/webp") {
            // Extended WebP: VP8X chunk with the animation flag (bit 1)
            const b = await read(0, 21);
            return ascii(b, 12, 16) === "VP8X" && (b[20] & 0x02) !== 0;
        }

        if (mime === "image/avif") {
            // AVIF image sequences advertise the "avis" brand in the ftyp box
            const head = await read(0, 4);
            const boxSize = Math.min(new DataView(head.buffer).getUint32(0), blob.size, 4096);
            const b = await read(0, boxSize);
            if (ascii(b, 8, 12) === "avis") return true;
            for (let p = 16; p + 4 <= b.length; p += 4) {
                if (ascii(b, p, p + 4) === "avis") return true;
            }
        }
    } catch (e) {
        log.debug("isAnimated check failed:", e.message);
    }
    return false;
}

/**
 * Walk the GIF block structure and count image frames, stopping early at `limit`.
 * @param {Uint8Array} b  The file's bytes, or a prefix of them
 * @param {number} limit
 * @returns {{frames: number, complete: boolean}}  complete is false if the walk ran past the
 *   end of `b`, i.e. more bytes are needed for a definite answer
 */
function countGifFrames(b, limit = Infinity) {
    const skipSubBlocks = (p) => {
        while (p < b.length && b[p] !== 0) p += b[p] + 1;
        return p + 1;
    };
    let p = 13;
    const lsdFlags = b[10];
    if (lsdFlags & 0x80) p += 3 * (1 << ((lsdFlags & 0x07) + 1));

    let frames = 0;
    while (p < b.length) {
        const block = b[p];
        if (block === 0x21) {
            // Extension: introducer + label, then data sub-blocks
            p = skipSubBlocks(p + 2);
        } else if (block === 0x2C) {
            // Image descriptor (10 bytes), optional local color table, LZW min code size, data
            if (++frames >= limit) return { frames, complete: true };
            const localFlags = b[p + 9];
            p += 10;
            if (localFlags & 0x80) p += 3 * (1 << ((localFlags & 0x07) + 1));
            p = skipSubBlocks(p + 1);
        } else {
            // Trailer (0x3B) or malformed data
            return { frames, complete: true };
        }
    }
    return { frames, complete: false };
}
