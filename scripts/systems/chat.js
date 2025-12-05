import { MODULE_ID, SETTINGS } from "../settings.js";
import { ImageShareUtils } from "../utils.js";

export class ChatSystem {
    static init() {
        Hooks.on("preCreateChatMessage", ChatSystem.onPreCreateChatMessage);

        // Global listener for clicking chat images to pop them out
        document.addEventListener("click", (event) => {
            const tgt = event.target;
            if (!(tgt instanceof HTMLElement)) return;
            if (tgt.classList.contains("niks-show-and-tell-chat-image")) {
                const src = tgt.dataset.src || tgt.getAttribute("src");
                if (src) {
                    new foundry.applications.apps.ImagePopout({ src, shareable: ImageShareUtils.canUserShare }).render(true);
                }
            }
        });
    }

    static async toChat(src, caption = "") {
        if (game.settings.get(MODULE_ID, SETTINGS.ADVANCED_TO_CHAT)) {
            ChatSystem.toChatWithDialog(src, caption);
        } else {
            await ChatMessage.create({
                content: ChatSystem.formatImageHtml(src, caption)
            }, { imageShareContextSkip: true });
        }
    }

    static toChatWithDialog(src, caption = "") {
        const contentHTML = ChatSystem.getDialogContentHTML(src, caption);

        new foundry.applications.api.DialogV2({
            window: { title: game.i18n.localize("NIKS-SHOW-AND-TELL.Dialog.SendToChat.Title") },
            position: { width: 320, height: "auto" },
            content: contentHTML,
            rejectClose: false,
            buttons: [
                {
                    action: "all",
                    label: game.i18n.localize("NIKS-SHOW-AND-TELL.Buttons.ShowToAll"),
                    icon: "fas fa-users",
                    callback: async (event, button) => {
                        const newCaption = button.form.querySelector(`[name="caption"]`).value || "";
                        await ChatMessage.create({
                            content: ChatSystem.formatImageHtml(src, newCaption)
                        }, { imageShareContextSkip: true });
                        return true;
                    }
                },
                {
                    action: "wisp",
                    label: game.i18n.localize("NIKS-SHOW-AND-TELL.Buttons.Whisper"),
                    icon: "fas fa-user-check",
                    callback: async (_event, button) => {
                        const newCaption = button.form.querySelector(`[name="caption"]`).value || "";
                        const players = Array.from(button.form.querySelectorAll(".niks-show-and-tell-dialog-checkbox:checked")).map((e) =>
                            e.getAttribute("data-player")
                        );
                        await ChatMessage.create({
                            content: ChatSystem.formatImageHtml(src, newCaption),
                            whisper: players
                        }, { imageShareContextSkip: true });
                        return true;
                    }
                }
            ]
        }).render({ force: true });
    }

    static formatImageHtml(src, caption = "") {
        let html = `<img class="niks-show-and-tell-chat-image" data-src="${src}" src="${src}">`;
        if (caption) {
            html += `<p class="niks-show-and-tell-caption" style="text-align: center; font-style: italic; margin-top: 5px;">${caption}</p>`;
        }
        return html;
    }

    static getDialogContentHTML(src, caption = "") {
        const players = game.users.players;

        const container = document.createElement("div");
        container.className = "niks-show-and-tell-dialog";

        // Preview
        const preview = document.createElement("img");
        preview.src = src;
        preview.className = "preview-image";
        container.appendChild(preview);

        // Caption
        const captionGroup = document.createElement("div");
        captionGroup.className = "form-group";
        const captionInput = document.createElement("input");
        captionInput.type = "text";
        captionInput.className = "caption-input";
        captionInput.name = "caption";
        captionInput.value = caption;
        captionInput.placeholder = game.i18n.localize("NIKS-SHOW-AND-TELL.Dialog.Caption.Placeholder");
        captionGroup.appendChild(captionInput);
        container.appendChild(captionGroup);

        const header = document.createElement("div");
        header.innerHTML = "<strong>Send Image to:</strong>";
        container.appendChild(header);

        const playerContainer = document.createElement("div");
        playerContainer.className = "dialog-players";
        container.appendChild(playerContainer);

        players.forEach((player) => {
            const div = document.createElement("div");
            div.className = "player-row";

            const label = document.createElement("label");
            label.className = "player-label";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.className = "niks-show-and-tell-dialog-checkbox";
            checkbox.setAttribute("data-player", player.id);
            checkbox.style.marginRight = "5px";

            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(player.name));

            div.appendChild(label);
            playerContainer.appendChild(div);
        });

        return container.outerHTML;
    }

    // Pre-DB hook to expand URLs to images
    static onPreCreateChatMessage(doc, data, options, userId) {
        if (!ImageShareUtils.canUserShare) return;
        if (options.imageShareContextSkip) return;

        const content = data.content || "";
        if (!content) return;

        const imgExts = "jpg|jpeg|png|gif|svg|webp";
        const urlRegex = new RegExp(`(https?:\\/\\/[^\\s"']+\\.(${imgExts})[^\\s"']*)`, "gi");

        if (!urlRegex.test(content)) return;

        let modified = false;
        const newContent = content.replace(urlRegex, (match) => {
            // Avoid double wrapping
            if (content.includes(`"${match}"`) || content.includes(`'${match}'`)) return match;

            modified = true;
            return ChatSystem.formatImageHtml(match);
        });

        if (modified) {
            doc.updateSource({ content: newContent });
        }
    }
}
