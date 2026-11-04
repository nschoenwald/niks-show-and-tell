import { MODULE_ID, TEMPLATES } from "../constants.js";
import { localize, notifyError } from "../helpers.js";
import { getSetting, SETTINGS } from "../settings.js";
import { Sharing } from "./sharing.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * The share dialog: image preview, caption and a recipient list. In "post" mode it posts the image to chat
 * ("Post Publicly" / "Whisper"); in "show" mode it pops the image up on users' screens
 * ("Show to Everyone" / "Show to Selected").
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
     * @param {"post"|"show"} [config.mode]  Post to chat, or show in a popout
     * @param {string} [config.imageTitle]  Popout window title in "show" mode
     * @param {object} [options]  ApplicationV2 options
     */
    constructor({ previewUrl, resolvePath, caption = "", needsUpload = false, onClose, mode = "post", imageTitle = "" }, options = {}) {
        super(options);
        this.#mode = mode;
        this.#imageTitle = imageTitle;
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
    #mode;
    #imageTitle;
    #busy = false;
    /** Recipients ticked before a re-render; null until the first re-render, then the saved selection is used. */
    #selected = null;
    /** Hook ID of the userConnected listener in "show" mode. */
    #connectionHook = null;

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
        if (this.#mode === "show") return localize("ShareDialog.TitleShow");
        return localize(this.#needsUpload ? "ShareDialog.TitleUpload" : "ShareDialog.Title");
    }

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const show = this.#mode === "show";
        const selected = this.#selected
            ?? new Set(getSetting(show ? SETTINGS.LAST_SHOW_TARGETS : SETTINGS.LAST_WHISPER_TARGETS) ?? []);
        // All other users, GMs included, so GMs can whisper each other. Connected users first.
        // Showing only reaches connected clients and isn't delivered later, so "show" mode lists only those.
        const users = game.users
            .filter((u) => (u !== game.user) && (!show || u.active))
            .sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name, game.i18n.lang))
            .map((u) => ({
                id: u.id,
                name: u.name,
                isGM: u.isGM,
                active: u.active,
                color: u.color?.css ?? "#888888",
                selected: selected.has(u.id)
            }));
        const disabled = show && !users.length;

        // The first button is the default, used when Enter is pressed in the caption field
        const buttons = show
            ? [
                { value: "all", icon: "fa-solid fa-users", label: localize("ShareDialog.ShowEveryone"), disabled },
                { value: "selected", icon: "fa-solid fa-eye", label: localize("ShareDialog.ShowSelected"), disabled }
            ]
            : [
                { value: "all", icon: "fa-solid fa-users", label: localize("ShareDialog.PostPublicly") },
                { value: "selected", icon: "fa-solid fa-user-secret", label: localize("ShareDialog.Whisper") }
            ];

        return Object.assign(context, {
            previewUrl: this.#previewUrl,
            caption: this.#caption,
            recipientsLabel: localize(show ? "ShareDialog.ShowRecipients" : "ShareDialog.Recipients"),
            emptyLabel: localize(show ? "ShareDialog.NoConnectedUsers" : "ShareDialog.NoOtherUsers"),
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
    async _onFirstRender(context, options) {
        await super._onFirstRender(context, options);
        if (this.#mode === "show") this.#connectionHook = Hooks.on("userConnected", () => this.#refreshRecipients());
    }

    /**
     * Re-render the recipient list when a user connects or disconnects, keeping the caption and the ticked users.
     * Skipped while the image is being shown, so the busy state isn't reset.
     */
    #refreshRecipients() {
        if (this.#busy || !this.rendered) return;
        const form = this.element;
        this.#caption = form.elements.caption?.value ?? this.#caption;
        this.#selected = new Set(Array.from(form.querySelectorAll("input[data-recipient]:checked"), (box) => box.dataset.recipient));
        this.render();
    }

    /** @override */
    _onClose(options) {
        super._onClose(options);
        if (this.#connectionHook !== null) Hooks.off("userConnected", this.#connectionHook);
        this.#connectionHook = null;
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
     * Post or show the image. Enter in the caption field submits with the first ("all") button.
     * @this {ShareDialog}
     * @param {SubmitEvent} event
     * @param {HTMLFormElement} form
     */
    static async #onSubmit(event, form) {
        if (this.#busy) return;
        const caption = form.elements.caption?.value.trim() ?? "";
        const show = this.#mode === "show";
        let users;
        if (event.submitter?.value === "selected") {
            users = Array.from(form.querySelectorAll("input[data-recipient]:checked"), (box) => box.dataset.recipient);
            // An empty list would post or show the image to everyone
            if (!users.length) return ui.notifications.warn(localize(show ? "Notifications.NoShowTargets" : "Notifications.NoWhisperTargets"));
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
            if (show) Sharing.show(path, { title: this.#imageTitle, caption, users });
            else await Sharing.post(path, caption, users);
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
