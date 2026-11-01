import { I18N_PREFIX } from "./constants.js";
import { getSetting, SETTINGS } from "./settings.js";

const LOG_PREFIX = "Nik's Show & Tell |";

/**
 * Localize a module string.
 * @param {string} key     Key without the module prefix, e.g. "Notifications.UploadFailed"
 * @param {object} [data]  Format data
 * @returns {string}
 */
export function localize(key, data) {
    const fullKey = `${I18N_PREFIX}.${key}`;
    return data ? game.i18n.format(fullKey, data) : game.i18n.localize(fullKey);
}

/** Console logging with the module prefix. debug() only logs with the "Debug Logging" setting on. */
export const log = {
    debug(...args) {
        try {
            if (!getSetting(SETTINGS.DEBUG_LOGGING)) return;
        } catch {
            // Settings not registered yet
            return;
        }
        console.log(`%c${LOG_PREFIX} DEBUG`, "color: #7c4dff; font-weight: bold;", ...args);
    },
    warn: (...args) => console.warn(LOG_PREFIX, ...args),
    error: (...args) => console.error(LOG_PREFIX, ...args)
};

/** An error whose message is already localized and can be shown to the user as-is. */
export class UserFacingError extends Error {}

/**
 * Show an error to the user: the message of a UserFacingError, otherwise the given fallback
 * string. Unexpected errors are logged.
 * @param {Error} err
 * @param {string} fallbackKey  Localization key used for unexpected errors
 */
export function notifyError(err, fallbackKey) {
    if (err instanceof UserFacingError) return ui.notifications.error(err.message);
    log.error(err);
    ui.notifications.error(localize(fallbackKey));
}

/**
 * Read a File or Blob into a data: URL.
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export function fileToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
    });
}

/** Whether the current user's role may use the module (the "Minimum Required Role" setting). */
export function canUserShare(user = game.user) {
    return user.role >= getSetting(SETTINGS.MIN_ROLE);
}
