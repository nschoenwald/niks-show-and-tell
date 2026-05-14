import { MODULE_ID, SETTINGS } from "./settings.js";

export class ImageShareUtils {
    static get canUserShare() {
        const minRole = game.settings.get(MODULE_ID, SETTINGS.MIN_ROLE);
        return game.user.role >= minRole;
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
        return ImageShareUtils.fileToDataURL(new File([blob], "clipboard", { type: blob.type || "application/octet-stream" }));
    }

    static async blobFromDataURL(dataURL) {
        return await (await fetch(dataURL)).blob();
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
