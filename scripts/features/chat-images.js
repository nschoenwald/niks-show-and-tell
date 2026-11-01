import { MODULE_ID } from "../constants.js";
import { canUserShare } from "../helpers.js";
import { EMBEDDABLE_IMAGE_URLS } from "../image/formats.js";
import { normalizeSrc } from "../image/urls.js";

/** Class of the <figure> around a shared image. */
const SHARED_CLASS = `${MODULE_ID}-image`;
/** Class of an image URL typed into chat that was embedded. */
const EMBED_CLASS = `${MODULE_ID}-embed`;
/** Class of shared images in messages from versions before 14.11. */
const LEGACY_CLASS = `${MODULE_ID}-chat-image`;

/** Images in chat messages that open a popout when clicked. */
const CLICKABLE_IMAGES = `.${SHARED_CLASS} img, img.${EMBED_CLASS}, img.${LEGACY_CLASS}`;

/** Text inside these elements is left alone when embedding image URLs. */
const NO_EMBED_INSIDE = "code, pre, textarea, script, style";

const EMBEDDABLE_TEST = new RegExp(EMBEDDABLE_IMAGE_URLS.source, "i");

export const ChatImages = {
    init() {
        Hooks.on("preCreateChatMessage", onPreCreateChatMessage);
        Hooks.on("renderChatMessageHTML", onRenderChatMessage);

        // Delegated, so it covers the sidebar, popped-out chat and chat notifications alike
        document.addEventListener("click", (event) => {
            const img = event.target instanceof Element ? event.target.closest(CLICKABLE_IMAGES) : null;
            if (!img?.closest(".chat-message")) return;
            const src = img.getAttribute("src");
            if (src) new foundry.applications.apps.ImagePopout({ src, window: { title: img.alt || "" } }).render({ force: true });
        });
    }
};

/**
 * Build the chat message content for a shared image.
 * @param {string} src
 * @param {string} [caption]
 * @returns {string}
 */
export function buildMessageContent(src, caption = "") {
    const figure = document.createElement("figure");
    figure.className = SHARED_CLASS;
    const img = document.createElement("img");
    img.setAttribute("src", src);
    img.alt = caption;
    figure.append(img);
    if (caption) {
        const figcaption = document.createElement("figcaption");
        figcaption.textContent = caption;
        figure.append(figcaption);
    }
    return figure.outerHTML;
}

/**
 * Defer loading and decoding of shared images until they scroll into view, so a chat log with
 * many (possibly animated) images doesn't download them all at once. Set at render time because
 * Foundry's HTML sanitizer strips these attributes from stored message content.
 */
function onRenderChatMessage(_message, html) {
    for (const img of html.querySelectorAll?.(CLICKABLE_IMAGES) ?? []) {
        img.loading = "lazy";
        img.decoding = "async";
    }
}

/** Embed image URLs typed or pasted into a chat message as images. */
function onPreCreateChatMessage(message, data) {
    if (data.flags?.[MODULE_ID] || !canUserShare()) return;
    const content = data.content;
    if (!content || !EMBEDDABLE_TEST.test(content)) return;
    const embedded = embedImageUrls(content);
    if (embedded !== null) message.updateSource({ content: embedded });
}

/**
 * Replace image URLs in the text of an HTML fragment with <img> elements. Only text is looked
 * at, so URLs in attributes (an existing image's src, a link's href) stay as they are.
 * @param {string} html
 * @returns {string|null}  The new HTML, or null if nothing was embedded
 */
export function embedImageUrls(html) {
    const template = document.createElement("template");
    template.innerHTML = html;
    const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) {
        if (!walker.currentNode.parentElement?.closest(NO_EMBED_INSIDE)) textNodes.push(walker.currentNode);
    }

    let changed = false;
    for (const node of textNodes) {
        const parts = [];
        let end = 0;
        for (const match of node.data.matchAll(EMBEDDABLE_IMAGE_URLS)) {
            const img = document.createElement("img");
            img.className = EMBED_CLASS;
            img.setAttribute("src", normalizeSrc(match[0]));
            img.alt = "";
            parts.push(node.data.slice(end, match.index), img);
            end = match.index + match[0].length;
        }
        if (!parts.length) continue;
        parts.push(node.data.slice(end));
        node.replaceWith(...parts.filter((part) => part !== ""));
        changed = true;
    }
    return changed ? template.innerHTML : null;
}
