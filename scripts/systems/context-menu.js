import { ChatSystem } from "./chat.js";
import { ImageShareUtils } from "../utils.js";
import { MODULE_ID, SETTINGS } from "../settings.js";

export class ContextMenuSystem {
    static init() {
        document.addEventListener("contextmenu", (event) => {
            if (!ImageShareUtils.canUserShare) return;
            const tgt = event.target;
            if (tgt && tgt.tagName === "IMG") {
                // Ignore Token HUD (status effects), Sidebar, and Buttons
                if (tgt.closest("#token-hud") || tgt.closest("#sidebar") || tgt.closest("button")) return;

                event.preventDefault();
                ContextMenuSystem.showContextMenu(event);
            }
        });

        document.addEventListener("click", (event) => {
            if (!event.target.closest(".niks-show-and-tell-menu")) {
                document.querySelectorAll(".niks-show-and-tell-menu").forEach((el) => el.remove());
            }
        });
    }

    static showContextMenu(event) {
        const src = event.target.getAttribute("src");
        document.querySelectorAll(".niks-show-and-tell-menu").forEach((el) => el.remove());

        const contextmenu = document.createElement("div");
        contextmenu.className = "niks-show-and-tell-menu";

        const buttons = ContextMenuSystem.getButtons(src);
        buttons.forEach((button) => {
            const el = document.createElement("div");
            el.className = "context-item";
            el.innerHTML = `${button.icon} <span>${button.name}</span>`;
            el.addEventListener("click", (e) => {
                button.callback(src, event);
                contextmenu.remove();
            });
            contextmenu.appendChild(el);
        });

        contextmenu.style.top = `${event.clientY}px`;
        contextmenu.style.left = `${event.clientX}px`;
        document.body.appendChild(contextmenu);
    }

    static getButtons(src) {
        const buttons = [
            {
                name: game.i18n.localize("NIKS-SHOW-AND-TELL.Buttons.Show"),
                icon: '<i class="fas fa-eye"></i>',
                callback: (s) => new foundry.applications.apps.ImagePopout({ src: s, shareable: true }).render(true)
            },
            {
                name: game.i18n.localize("NIKS-SHOW-AND-TELL.Buttons.SendToChat"),
                icon: '<i class="fas fa-share"></i>',
                callback: (s) => ChatSystem.toChat(s)
            },
            {
                name: game.i18n.localize("NIKS-SHOW-AND-TELL.Buttons.CopyURL"),
                icon: '<i class="fas fa-link"></i>',
                callback: (s) => {
                    const absoluteUrl = new URL(s, document.baseURI).href;
                    game.clipboard.copyPlainText(absoluteUrl);
                    ui.notifications.info(game.i18n.localize("NIKS-SHOW-AND-TELL.Notifications.URLCopied"));
                }
            }
        ];



        return buttons;
    }

}
