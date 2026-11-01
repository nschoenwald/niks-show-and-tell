export const MODULE_ID = "niks-show-and-tell";

/** Prefix of every localization key. */
export const I18N_PREFIX = "NIKS-SHOW-AND-TELL";

export const TEMPLATES = {
    SHARE_DIALOG: `modules/${MODULE_ID}/templates/share-dialog.hbs`
};

/** Hooks other modules can use. Documented in README.md. */
export const HOOKS = {
    MENU_OPEN: "niksShowAndTellContextMenuOpen",
    MENU_BUTTONS: "niksShowAndTellGetMenuButtons",
    PASTE_IMAGE: "niksShowAndTellPasteImage",
    IMAGE_UPLOADED: "niksShowAndTellImageUploaded",
    SHARE_IMAGE: "niksShowAndTellShareImage",
    SHARED: "niksShowAndTellShared"
};

/**
 * Every image format the module knows about.
 * - mime:      the canonical MIME type
 * - ext:       file extensions (first one is used for new files)
 * - animated:  whether files of this format can hold more than one frame
 * - relay:     accepted by the GM upload relay. SVG is not: it is a document format that can carry
 *              scripts, and the relay uploads for users who were not trusted with uploads themselves.
 * - embed:     image URLs with this extension typed into chat are embedded as images
 */
export const IMAGE_FORMATS = [
    { mime: "image/png", ext: ["png", "apng"], animated: true, relay: true, embed: true },
    { mime: "image/jpeg", ext: ["jpg", "jpeg"], animated: false, relay: true, embed: true },
    { mime: "image/gif", ext: ["gif"], animated: true, relay: true, embed: true },
    { mime: "image/webp", ext: ["webp"], animated: true, relay: true, embed: true },
    { mime: "image/avif", ext: ["avif"], animated: true, relay: true, embed: true },
    { mime: "image/bmp", ext: ["bmp"], animated: false, relay: true, embed: false },
    { mime: "image/svg+xml", ext: ["svg"], animated: false, relay: false, embed: true },
    { mime: "image/tiff", ext: ["tif", "tiff"], animated: false, relay: false, embed: false },
    { mime: "image/x-icon", ext: ["ico"], animated: false, relay: false, embed: false }
];

/** Default upload folder name, inside the world folder. */
export const DEFAULT_UPLOAD_FOLDER = "niks-show-and-tell-uploads";
