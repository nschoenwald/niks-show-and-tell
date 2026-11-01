import { MODULE_ID, TEMPLATES } from "../constants.js";
import { localize, notifyError } from "../helpers.js";
import { getSetting, SETTINGS } from "../settings.js";
import { Sharing } from "./sharing.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * The share dialog: image preview, caption and — with the "Choose Recipients" setting — the
 * recipient list with "Post Publicly" / "Whisper" buttons; otherwise a single post button.
 *
 * The dialog stays open until the image is posted, so a failed upload can be retried.
 * Only one share dialog is open at a time.
 */
export class ShareDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    /** @type {ShareDialog|null} */
    static #current = null;

    /**
     * @param {object} config
     * @param {string} config.previewUrl  Shown in the preview (may be a blob: URL)
     * @param {() => string|Promise<string>} config.resolvePath  Returns the path to post; may upload
     * @param {string} [config.caption]   Initial caption
     * @param {boolean} [config.needsUpload]  The image is uploaded when it is shared
     * @param {Function} [config.onClose]  Called once when the dialog closes
     * @param {object} [options]  ApplicationV2 options
     */
    constructor({ previewUrl, resolvePath, caption = "", needsUpload = false, onClose }, options = {}) {
        super(options);
        this.#previewUrl = previewUrl;
        this.#resolvePath = resolvePath;
        this.#caption = caption;
        this.#needsUpload = needsUpload;
        this.#onCloseCallback = onClose;
    }

    #previewUrl;
    #resolvePath;
    #caption;
    #needsUpload;
    #onCloseCallback;
    #busy = false;

    static DEFAULT_OPTIONS = {
        classes: [`${MODULE_ID}-share-dialog`],
        tag: "form",
        window: { icon: "fa-solid fa-image", contentClasses: ["standard-form"] },
        position: { width: 340, height: "auto" },
        form: { handler: ShareDialog.#onSubmit, closeOnSubmit: false },
        actions: { pickRecipients: ShareDialog.#onPickRecipients }
    };

    static PARTS = {
        form: { template: TEMPLATES.SHARE_DIALOG }
    };

    /**
     * Open a share dialog, closing the one already open.
     * @param {object} config  See the constructor
     * @returns {ShareDialog}
     */
    static open(config) {
        ShareDialog.#current?.close();
        const dialog = new ShareDialog(config);
        ShareDialog.#current = dialog;
        dialog.render({ force: true });
        return dialog;
    }

    /** @override */
    get title() {
        return localize(this.#needsUpload ? "ShareDialog.TitleUpload" : "ShareDialog.Title");
    }

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const chooseRecipients = getSetting(SETTINGS.CHOOSE_RECIPIENTS);
        const lastTargets = new Set(getSetting(SETTINGS.LAST_WHISPER_TARGETS) ?? []);
        // All other users, GMs included, so GMs can whisper each other. Connected users first.
        const users = chooseRecipients ? game.users
            .filter((u) => u !== game.user)
            .sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name, game.i18n.lang))
            .map((u) => ({
                id: u.id,
                name: u.name,
                isGM: u.isGM,
                active: u.active,
                color: u.color?.css ?? "#888888",
                selected: lastTargets.has(u.id)
            })) : [];

        const buttons = chooseRecipients
            ? [
                { value: "public", icon: "fa-solid fa-users", label: localize("ShareDialog.PostPublicly") },
                { value: "whisper", icon: "fa-solid fa-user-secret", label: localize("ShareDialog.Whisper") }
            ]
            : [{
                value: "public",
                icon: this.#needsUpload ? "fa-solid fa-cloud-arrow-up" : "fa-solid fa-comment",
                label: localize(this.#needsUpload ? "ShareDialog.UploadAndPost" : "ShareDialog.Post")
            }];

        return Object.assign(context, {
            previewUrl: this.#previewUrl,
            caption: this.#caption,
            chooseRecipients,
            users,
            buttons
        });
    }

    /** @override */
    async _onRender(context, options) {
        await super._onRender(context, options);
        if (options.isFirstRender) this.element.querySelector("[name=caption]")?.focus();
    }

    /** @override */
    _onClose(options) {
        super._onClose(options);
        if (ShareDialog.#current === this) ShareDialog.#current = null;
        this.#onCloseCallback?.();
        this.#onCloseCallback = null;
    }

    /**
     * Select recipients with the "Players" / "GMs" / "None" buttons.
     * @this {ShareDialog}
     * @param {PointerEvent} _event
     * @param {HTMLElement} target
     */
    static #onPickRecipients(_event, target) {
        const pick = target.dataset.pick;
        for (const box of this.element.querySelectorAll("input[data-recipient]")) {
            const isGM = box.dataset.gm === "true";
            box.checked = (pick === "players" && !isGM) || (pick === "gms" && isGM);
        }
    }

    /**
     * Post the image. Enter in the caption field submits with the first (public) button.
     * @this {ShareDialog}
     * @param {SubmitEvent} event
     * @param {HTMLFormElement} form
     */
    static async #onSubmit(event, form) {
        if (this.#busy) return;
        const caption = form.elements.caption?.value.trim() ?? "";
        let whisper;
        if (event.submitter?.value === "whisper") {
            whisper = Array.from(form.querySelectorAll("input[data-recipient]:checked"), (box) => box.dataset.recipient);
            // An empty whisper list would post the image publicly
            if (!whisper.length) return ui.notifications.warn(localize("Notifications.NoWhisperTargets"));
        }

        this.#setBusy(true, event.submitter);
        let path;
        try {
            path = await this.#resolvePath();
        } catch (err) {
            this.#setBusy(false);
            return notifyError(err, "Notifications.UploadFailed");
        }
        try {
            await Sharing.post(path, caption, whisper);
        } catch (err) {
            this.#setBusy(false);
            return notifyError(err, "Notifications.ShareFailed");
        }
        // Closed after a successful post, or when another module cancelled it
        this.close();
    }

    /**
     * Disable the buttons and show progress while the image is uploaded and posted.
     * @param {boolean} busy
     * @param {HTMLButtonElement} [button]  The clicked button, which gets a spinner
     */
    #setBusy(busy, button) {
        this.#busy = busy;
        const form = this.element;
        for (const el of form.querySelectorAll("button")) el.disabled = busy;
        const status = form.querySelector(".share-status");
        status.hidden = !(busy && this.#needsUpload);
        if (busy) {
            status.textContent = localize("ShareDialog.Uploading");
            const icon = button?.querySelector("i");
            if (icon) {
                icon.dataset.icon = icon.className;
                icon.className = "fa-solid fa-spinner fa-spin";
            }
        } else {
            for (const icon of form.querySelectorAll("i[data-icon]")) {
                icon.className = icon.dataset.icon;
                delete icon.dataset.icon;
            }
        }
    }
}
