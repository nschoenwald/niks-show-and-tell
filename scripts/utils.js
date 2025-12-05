import { MODULE_ID, SETTINGS } from "./settings.js";

export class ImageShareUtils {
    static get canUserShare() {
        const minRole = game.settings.get(MODULE_ID, SETTINGS.MIN_ROLE);
        return game.user.role >= minRole;
    }

    static get uploadLocation() {
        let dir = game.settings.get(MODULE_ID, SETTINGS.UPLOAD_LOCATION)?.trim() || "niks-show-and-tell-uploads";
        return this.#normalizeUploadFolder(dir);
    }

    static #normalizeUploadFolder(dir) {
        if (/^[a-z]+:\/\//i.test(dir)) dir = "niks-show-and-tell-uploads";
        if (!dir.includes("/")) dir = `worlds/${game.world.id}/${dir}`;

        // v13: Enforce strict user data paths to avoid security issues
        const badRoots = /^(modules|systems)\/|^worlds\/?$|^worlds\/[^/]+$/i;
        if (badRoots.test(dir)) {
            dir = `worlds/${game.world.id}/niks-show-and-tell-uploads`;
        }
        return dir.replace(/\/\/+/g, "/");
    }

    static async compressImage(fileOrBlob) {
        const quality = game.settings.get(MODULE_ID, SETTINGS.WEBP_QUALITY) || 0.8;
        console.log(`Nik's Show & Tell | Compressing to WebP (Q=${quality})...`);

        // Create a bitmap from the source
        const bitmap = await createImageBitmap(fileOrBlob);

        // Draw to canvas
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(bitmap, 0, 0);

        // Convert to blob
        return new Promise((resolve) => {
            canvas.toBlob((blob) => {
                console.log(`Nik's Show & Tell | Compressed: ${fileOrBlob.size} -> ${blob.size} bytes`);
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
        const ext = mime.split("/")[1]?.toLowerCase();
        // Prefer jpg for jpeg, otherwise standard.
        if (ext === "jpeg") return "jpg";
        return ext;
    }
}
