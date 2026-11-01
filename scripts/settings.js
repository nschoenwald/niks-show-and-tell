import { DEFAULT_UPLOAD_FOLDER, I18N_PREFIX, MODULE_ID } from "./constants.js";

export const SETTINGS = {
    CHOOSE_RECIPIENTS: "chooseRecipients",
    UPLOAD_LOCATION: "uploadLocation",
    UPLOAD_SUBFOLDER: "uploadSubfolder",
    GM_UPLOAD_RELAY: "gmUploadRelay",
    COMPRESS_IMAGES: "compressImages",
    MIN_ROLE: "minRole",
    WEBP_QUALITY: "webpQuality",
    MAX_IMAGE_DIMENSION: "maxImageDimension",
    ENABLE_DRAG_DROP: "enableDragDrop",
    CONTEXT_MENU_MODE: "contextMenuMode",
    CHAT_IMAGE_MAX_HEIGHT: "chatImageMaxHeight",
    LAST_WHISPER_TARGETS: "lastWhisperTargets",
    DEBUG_LOGGING: "debugLogging"
};

/** Setting definitions in the order they appear in the settings window. */
const DEFINITIONS = {
    [SETTINGS.CHOOSE_RECIPIENTS]: { scope: "world", type: Boolean, default: true },
    [SETTINGS.UPLOAD_LOCATION]: { scope: "world", type: String, filePicker: "folder", default: DEFAULT_UPLOAD_FOLDER },
    [SETTINGS.UPLOAD_SUBFOLDER]: {
        scope: "world", type: String, default: "none",
        choices: { none: "None", user: "User", month: "Month" }
    },
    [SETTINGS.GM_UPLOAD_RELAY]: { scope: "world", type: Boolean, default: false },
    [SETTINGS.COMPRESS_IMAGES]: { scope: "world", type: Boolean, default: true },
    [SETTINGS.MIN_ROLE]: {
        scope: "world", type: Number, default: 4,
        // Core role labels, not module strings
        coreChoices: { 1: "USER.RolePlayer", 2: "USER.RoleTrusted", 3: "USER.RoleAssistant", 4: "USER.RoleGamemaster" }
    },
    [SETTINGS.WEBP_QUALITY]: { scope: "world", type: Number, range: { min: 0.1, max: 1, step: 0.1 }, default: 0.8 },
    [SETTINGS.MAX_IMAGE_DIMENSION]: { scope: "world", type: Number, range: { min: 0, max: 8192, step: 256 }, default: 0 },
    [SETTINGS.ENABLE_DRAG_DROP]: { scope: "world", type: Boolean, default: true },
    [SETTINGS.CONTEXT_MENU_MODE]: {
        scope: "client", type: String, default: "always",
        choices: { always: "Always", noSheets: "NoSheets", shift: "Shift", off: "Off" }
    },
    [SETTINGS.CHAT_IMAGE_MAX_HEIGHT]: {
        scope: "client", type: Number, range: { min: 0, max: 1000, step: 50 }, default: 300,
        onChange: (value) => applyChatImageMaxHeight(value)
    },
    // Remembers the last whisper recipients so the share dialog can preselect them
    [SETTINGS.LAST_WHISPER_TARGETS]: { scope: "client", type: Array, default: [], config: false },
    [SETTINGS.DEBUG_LOGGING]: { scope: "client", type: Boolean, default: false }
};

/** Cached setting values, kept current by each setting's onChange handler. */
const cache = new Map();

/**
 * Read a module setting. game.settings.get constructs a Setting document on every call
 * (client settings also parse localStorage), which is too costly for hot paths such as
 * dragover handlers and debug logging, so values are cached until they change.
 * @param {string} key  One of SETTINGS
 * @returns {any}
 */
export function getSetting(key) {
    if (!cache.has(key)) cache.set(key, game.settings.get(MODULE_ID, key));
    return cache.get(key);
}

/**
 * @param {string} key  One of SETTINGS
 * @param {any} value
 * @returns {Promise<any>}
 */
export function setSetting(key, value) {
    return game.settings.set(MODULE_ID, key, value);
}

/**
 * Register all settings. Names, hints and choice labels are derived from the key:
 * Settings.<Key>.Name, Settings.<Key>.Hint and Settings.<Key>.<Choice>.
 */
export function registerSettings() {
    for (const [key, { coreChoices, choices, onChange, config = true, ...definition }] of Object.entries(DEFINITIONS)) {
        const prefix = `${I18N_PREFIX}.Settings.${key.charAt(0).toUpperCase()}${key.slice(1)}`;
        const labels = coreChoices ?? (choices && Object.fromEntries(
            Object.entries(choices).map(([value, label]) => [value, `${prefix}.${label}`])));
        game.settings.register(MODULE_ID, key, {
            ...definition,
            config,
            ...(config && { name: `${prefix}.Name`, hint: `${prefix}.Hint` }),
            ...(labels && { choices: labels }),
            // onChange fires on every client, including when another user changes a world setting
            onChange: (value) => {
                cache.set(key, value);
                onChange?.(value);
            }
        });
    }
}

/**
 * Apply the chat image height limit as a CSS variable used by styles/main.css.
 * @param {number} [value]  Height in pixels; 0 removes the limit
 */
export function applyChatImageMaxHeight(value = getSetting(SETTINGS.CHAT_IMAGE_MAX_HEIGHT)) {
    const height = Number(value) > 0 ? `${Number(value)}px` : "none";
    document.documentElement.style.setProperty(`--${MODULE_ID}-chat-image-max-height`, height);
}
