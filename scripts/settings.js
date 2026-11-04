import { DEFAULT_UPLOAD_FOLDER, I18N_PREFIX, MODULE_ID } from "./constants.js";

export const SETTINGS = {
    UPLOAD_LOCATION: "uploadLocation",
    UPLOAD_SUBFOLDER: "uploadSubfolder",
    GM_UPLOAD_RELAY: "gmUploadRelay",
    COMPRESS_IMAGES: "compressImages",
    MIN_ROLE: "minRole",
    MAX_IMAGE_DIMENSION: "maxImageDimension",
    ENABLE_DRAG_DROP: "enableDragDrop",
    PASTE_MODE: "pasteMode",
    CONTEXT_MENU_MODE: "contextMenuMode",
    CHAT_IMAGE_MAX_HEIGHT: "chatImageMaxHeight",
    LAST_WHISPER_TARGETS: "lastWhisperTargets",
    LAST_SHOW_TARGETS: "lastShowTargets",
    DEBUG_LOGGING: "debugLogging"
};

/**
 * Sections of the settings window, each with a heading. World settings come first (GMs only see them),
 * then the per-user settings. DEFINITIONS lists the settings in this order.
 */
const SECTIONS = {
    Sharing: [SETTINGS.MIN_ROLE, SETTINGS.ENABLE_DRAG_DROP],
    Uploads: [SETTINGS.UPLOAD_LOCATION, SETTINGS.UPLOAD_SUBFOLDER, SETTINGS.GM_UPLOAD_RELAY],
    Compression: [SETTINGS.COMPRESS_IMAGES, SETTINGS.MAX_IMAGE_DIMENSION],
    Personal: [SETTINGS.PASTE_MODE, SETTINGS.CONTEXT_MENU_MODE, SETTINGS.CHAT_IMAGE_MAX_HEIGHT, SETTINGS.DEBUG_LOGGING]
};

/** Settings that only apply while Compress Images is on, disabled in the settings window while it is off. */
const COMPRESSION_OPTIONS = [SETTINGS.MAX_IMAGE_DIMENSION];

/** Setting definitions in the order they appear in the settings window (see SECTIONS). */
const DEFINITIONS = {
    // Sharing
    [SETTINGS.MIN_ROLE]: {
        scope: "world", type: Number, default: 4,
        // Core role labels, not module strings
        coreChoices: { 1: "USER.RolePlayer", 2: "USER.RoleTrusted", 3: "USER.RoleAssistant", 4: "USER.RoleGamemaster" }
    },
    [SETTINGS.ENABLE_DRAG_DROP]: { scope: "world", type: Boolean, default: true },
    // Uploads
    [SETTINGS.UPLOAD_LOCATION]: { scope: "world", type: String, filePicker: "folder", default: DEFAULT_UPLOAD_FOLDER },
    [SETTINGS.UPLOAD_SUBFOLDER]: {
        scope: "world", type: String, default: "none",
        choices: { none: "None", user: "User", month: "Month" }
    },
    [SETTINGS.GM_UPLOAD_RELAY]: { scope: "world", type: Boolean, default: false },
    // Compression
    [SETTINGS.COMPRESS_IMAGES]: { scope: "world", type: Boolean, default: true },
    [SETTINGS.MAX_IMAGE_DIMENSION]: { scope: "world", type: Number, range: { min: 0, max: 8192, step: 256 }, default: 0 },
    // Personal
    [SETTINGS.PASTE_MODE]: {
        scope: "client", type: String, default: "chat",
        choices: { chat: "Chat", anywhere: "Anywhere", off: "Off" }
    },
    [SETTINGS.CONTEXT_MENU_MODE]: {
        scope: "client", type: String, default: "always",
        choices: { always: "Always", noSheets: "NoSheets", shift: "Shift", off: "Off" }
    },
    [SETTINGS.CHAT_IMAGE_MAX_HEIGHT]: {
        scope: "client", type: Number, range: { min: 0, max: 1000, step: 50 }, default: 300,
        onChange: (value) => applyChatImageMaxHeight(value)
    },
    [SETTINGS.DEBUG_LOGGING]: { scope: "client", type: Boolean, default: false },
    // Remembers the last whisper recipients so the share dialog can preselect them
    [SETTINGS.LAST_WHISPER_TARGETS]: { scope: "client", type: Array, default: [], config: false },
    // Remembers the users last selected for "Show to Players"
    [SETTINGS.LAST_SHOW_TARGETS]: { scope: "client", type: Array, default: [], config: false }
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
    Hooks.on("renderSettingsConfig", decorateSettingsConfig);
}

/**
 * Add section headings to this module's settings and disable the compression options while compression is off.
 * Settings the user can't see (world settings for players) are not rendered, so a section without any rendered
 * setting gets no heading.
 * @param {foundry.applications.settings.SettingsConfig} application
 * @param {HTMLElement} element
 */
function decorateSettingsConfig(application, element) {
    const formGroup = (key) => element.querySelector(`[name="${MODULE_ID}.${key}"]`)?.closest(".form-group");
    for (const [section, keys] of Object.entries(SECTIONS)) {
        const first = keys.map(formGroup).find(Boolean);
        if (!first || first.previousElementSibling?.dataset.niksShowAndTellSection) continue;
        const heading = document.createElement("h4");
        heading.className = "divider";
        heading.dataset.niksShowAndTellSection = section;
        heading.textContent = game.i18n.localize(`${I18N_PREFIX}.Settings.Section.${section}`);
        first.before(heading);
    }

    const compress = element.querySelector(`[name="${MODULE_ID}.${SETTINGS.COMPRESS_IMAGES}"]`);
    if (!compress) return;
    const update = () => {
        for (const key of COMPRESSION_OPTIONS) {
            const input = element.querySelector(`[name="${MODULE_ID}.${key}"]`);
            // Disabled inputs aren't submitted, and SettingsConfig skips settings missing from the form data
            if (input) input.disabled = !compress.checked;
        }
    };
    compress.addEventListener("change", update);
    update();
}

/**
 * Apply the chat image height limit as a CSS variable used by styles/main.css.
 * @param {number} [value]  Height in pixels; 0 removes the limit
 */
export function applyChatImageMaxHeight(value = getSetting(SETTINGS.CHAT_IMAGE_MAX_HEIGHT)) {
    const height = Number(value) > 0 ? `${Number(value)}px` : "none";
    document.documentElement.style.setProperty(`--${MODULE_ID}-chat-image-max-height`, height);
}
