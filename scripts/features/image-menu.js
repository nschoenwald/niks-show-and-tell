import { HOOKS, MODULE_ID } from "../constants.js";
import { canUserShare, localize, log } from "../helpers.js";
import { extFromMime, isAnimated } from "../image/formats.js";
import { fetchImageBlob, reencodeBlob } from "../image/processing.js";
import { absoluteUrl, fileNameFromUrl, isLocalOnlyUrl, normalizeSrc, withExtension } from "../image/urls.js";
import { getSetting, SETTINGS } from "../settings.js";
import { Sharing } from "./sharing.js";

/**
 * @typedef {object} ImageMenuEntry
 * @property {string} [id]           Identifier, so other modules can find or remove entries
 * @property {string} label          Text of the entry (also accepted as `name`)
 * @property {string} icon           Font Awesome classes, e.g. "fa-solid fa-eye" (an <i> element as HTML is accepted too)
 * @property {(src: string, event: MouseEvent) => any} callback  Called with the image's path and the right-click event
 */

/**
 * The image right-click menu. A small menu of its own rather than Foundry's ContextMenu, since it
 * opens on any image anywhere in the interface and must not interfere with the context menus
 * applications define for their own elements.
 */
export const ImageMenu = {
    /** @type {HTMLElement|null} */
    element: null,

    init() {
        // Bound to <body> rather than document: Foundry prevents the default of every contextmenu
        // event at document level, so only a body listener can tell whether an inner context menu
        // (Foundry or system) already claimed the click.
        document.body.addEventListener("contextmenu", (event) => this.onContextMenu(event));

        const closeOutside = (event) => {
            if (this.element && !this.element.contains(event.target)) this.close();
        };
        document.addEventListener("pointerdown", closeOutside, { capture: true });
        document.addEventListener("wheel", closeOutside, { capture: true, passive: true });
        window.addEventListener("blur", () => this.close());
        window.addEventListener("resize", () => this.close());
    },

    /** @param {MouseEvent} event */
    onContextMenu(event) {
        const img = event.target;
        // Another context menu is opening, or right-click on something else
        if (!(img instanceof HTMLImageElement) || !this.shouldOpenFor(img, event)) return this.close();
        event.preventDefault();
        this.open(img, event);
    },

    /**
     * Whether the menu opens for a right-clicked image, given the "Image Right-Click Menu" setting.
     * @param {HTMLImageElement} img
     * @param {MouseEvent} event
     * @returns {boolean}
     */
    shouldOpenFor(img, event) {
        if (!canUserShare()) return false;
        // Token HUD (status effects), sidebar icons and buttons have menus or actions of their own
        if (img.closest("#token-hud, #sidebar, button")) return false;
        // A Foundry or system context menu (e.g. an item row on a sheet) already handled the click
        if (event.defaultPrevented) return false;
        switch (getSetting(SETTINGS.CONTEXT_MENU_MODE)) {
            case "off": return false;
            case "shift": return event.shiftKey;
            case "noSheets": return !isInActorOrItemSheet(img);
            default: return true;
        }
    },

    /**
     * @param {HTMLImageElement} img
     * @param {MouseEvent} event  The right-click
     */
    open(img, event) {
        this.close();
        const src = normalizeSrc(img.currentSrc || img.getAttribute("src"));
        if (!src) return;
        Hooks.callAll(HOOKS.MENU_OPEN, src);

        const menu = document.createElement("nav");
        menu.className = `${MODULE_ID}-menu`;
        const list = document.createElement("menu");
        list.className = "menu-items";
        list.setAttribute("role", "menu");
        menu.append(list);

        for (const entry of entriesFor(src, img)) {
            const item = renderEntry(entry);
            if (!item) continue;
            item.addEventListener("click", () => {
                this.close();
                try {
                    const result = entry.callback(src, event);
                    if (result instanceof Promise) result.catch((err) => log.error("Menu action failed:", err));
                } catch (err) {
                    log.error("Menu action failed:", err);
                }
            });
            list.append(item);
        }
        menu.addEventListener("keydown", (e) => onMenuKeydown(e, this));

        // Measure hidden, then keep the menu inside the viewport
        menu.style.visibility = "hidden";
        document.body.append(menu);
        this.element = menu;
        const { width, height } = menu.getBoundingClientRect();
        menu.style.left = `${Math.max(0, Math.min(event.clientX, window.innerWidth - width - 4))}px`;
        menu.style.top = `${Math.max(0, Math.min(event.clientY, window.innerHeight - height - 4))}px`;
        menu.style.visibility = "";
        list.querySelector("[role=menuitem]")?.focus({ preventScroll: true });
    },

    close() {
        this.element?.remove();
        this.element = null;
    }
};

/**
 * Whether an element is inside an Actor or Item sheet. Checked through the owning application's
 * document rather than CSS classes, which vary between systems (journals are sheets too).
 * @param {Element} el
 * @returns {boolean}
 */
function isInActorOrItemSheet(el) {
    const appElement = el.closest(".application, .app");
    if (!appElement) return false;
    const app = foundry.applications.instances.get(appElement.id) ?? ui.windows?.[appElement.dataset.appid];
    const doc = app?.document ?? app?.object;
    return (doc instanceof Actor) || (doc instanceof Item);
}

/**
 * @param {ImageMenuEntry} entry
 * @returns {HTMLLIElement|null}
 */
function renderEntry(entry) {
    const label = entry.label ?? entry.name;
    if (!label || typeof entry.callback !== "function") return null;
    const item = document.createElement("li");
    item.className = "menu-item";
    item.setAttribute("role", "menuitem");
    item.tabIndex = -1;
    const icon = document.createElement("i");
    icon.className = iconClasses(entry.icon);
    icon.inert = true;
    const text = document.createElement("span");
    text.textContent = label;
    item.append(icon, text);
    return item;
}

/**
 * Icon classes of a menu entry, which may be given as classes or as an <i> element's HTML.
 * The HTML is parsed without being inserted, so nothing in it runs.
 * @param {string} icon
 * @returns {string}
 */
function iconClasses(icon) {
    if (!icon?.includes("<")) return icon ?? "";
    return new DOMParser().parseFromString(icon, "text/html").body.querySelector("[class]")?.className ?? "";
}

/** Arrow keys move between entries, Enter/Space choose one, Escape closes the menu. */
function onMenuKeydown(event, menu) {
    const items = Array.from(menu.element?.querySelectorAll("[role=menuitem]") ?? []);
    const index = items.indexOf(document.activeElement);
    switch (event.key) {
        case "ArrowDown": items[(index + 1) % items.length]?.focus(); break;
        case "ArrowUp": items[(index - 1 + items.length) % items.length]?.focus(); break;
        case "Enter":
        case " ": items[index]?.click(); break;
        case "Escape": menu.close(); break;
        default: return;
    }
    event.preventDefault();
    event.stopPropagation();
}

/**
 * The menu entries for an image. Other modules can add, change or remove entries through the
 * niksShowAndTellGetMenuButtons hook.
 * @param {string} src
 * @param {HTMLImageElement} img
 * @returns {ImageMenuEntry[]}
 */
function entriesFor(src, img) {
    const localOnly = isLocalOnlyUrl(src);
    const entries = [
        { id: "view", label: localize("Menu.View"), icon: "fa-solid fa-magnifying-glass-plus", callback: () => viewImage(src, img) },
        // GM-only, like the "Show Players" button of Foundry's own image popout. data:/blob: images
        // only exist in this browser, so other users couldn't load them.
        (game.user.isGM && !localOnly) && {
            id: "showPlayers", label: localize("Menu.ShowPlayers"), icon: "fa-solid fa-display", callback: () => Sharing.showImage(src, imageTitle(src, img))
        },
        { id: "postToChat", label: localize("Menu.PostToChat"), icon: "fa-solid fa-comment", callback: () => Sharing.shareImage(src) },
        { id: "copyLink", label: localize("Menu.CopyLink"), icon: "fa-solid fa-link", callback: () => copyLink(src) },
        { id: "copyImage", label: localize("Menu.CopyImage"), icon: "fa-solid fa-copy", callback: () => copyImage(src) },
        { id: "download", label: localize("Menu.Download"), icon: "fa-solid fa-download", callback: () => downloadImage(src) }
    ].filter(Boolean);
    Hooks.callAll(HOOKS.MENU_BUTTONS, entries, src);
    return entries;
}

/* -------------------------------------------- */
/*  Menu Actions                                */
/* -------------------------------------------- */

/** Window title for an image: its alt/title text, else its file name without extension. */
function imageTitle(src, img) {
    return img?.alt || img?.title || fileNameFromUrl(src).replace(/\.[^.]+$/, "");
}

function viewImage(src, img) {
    new foundry.applications.apps.ImagePopout({ src, window: { title: imageTitle(src, img) } }).render({ force: true });
}

/**
 * @param {string} src
 * @param {string} [messageKey]  Notification shown afterwards
 * @param {"info"|"warn"} [level]
 */
function copyLink(src, messageKey = "Notifications.LinkCopied", level = "info") {
    game.clipboard.copyPlainText(isLocalOnlyUrl(src) ? src : absoluteUrl(src));
    ui.notifications[level](localize(messageKey));
}

/**
 * Copy the image to the system clipboard as PNG, the only image type browsers write there.
 * Falls back to copying the link when that is impossible or would lose an animation.
 */
async function copyImage(src) {
    // Writing images needs a secure context (HTTPS or localhost) and ClipboardItem support
    if (!navigator.clipboard?.write) return copyLink(src, "Notifications.LinkCopiedNoHttps", "warn");
    if (typeof ClipboardItem === "undefined" || ClipboardItem.supports?.("image/png") === false) {
        return copyLink(src, "Notifications.LinkCopiedUnsupported", "warn");
    }

    let png;
    try {
        const blob = await fetchImageBlob(src);
        // PNG on the clipboard holds a single frame; the link keeps the animation
        if (await isAnimated(blob)) return copyLink(src, "Notifications.AnimatedLinkCopied");
        png = blob.type === "image/png" ? blob : (await reencodeBlob(blob)).blob;
    } catch (err) {
        log.warn("Could not read the image, copying its link instead:", err);
        return copyLink(src, "Notifications.LinkCopiedImageBlocked", "warn");
    }

    try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
        ui.notifications.info(localize("Notifications.ImageCopied"));
    } catch (err) {
        log.warn("Clipboard write failed, copying the link instead:", err);
        copyLink(src, "Notifications.LinkCopiedImageBlocked", "warn");
    }
}

/** Save the image's original bytes as a file. */
async function downloadImage(src) {
    try {
        const blob = await fetchImageBlob(src);
        const name = withExtension(fileNameFromUrl(src), extFromMime(blob.type));
        const url = URL.createObjectURL(blob);
        const link = Object.assign(document.createElement("a"), { href: url, download: name });
        document.body.append(link);
        link.click();
        link.remove();
        // Revoked after the click has been handled, so the download can start
        setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (err) {
        log.error("Download failed:", err);
        ui.notifications.error(localize("Notifications.DownloadFailed"));
    }
}
