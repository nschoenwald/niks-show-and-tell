import { ChatSystem } from "./chat.js";
import { ImageShareUtils } from "../utils.js";
import { MODULE_ID, SETTINGS } from "../settings.js";

export class ContextMenuSystem {
    static init() {
        document.addEventListener("contextmenu", (event) => {
            if (!ImageShareUtils.canUserShare) return;
            const tgt = event.target;
            if (tgt && tgt.tagName === "IMG") {
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



        // Tile targeting logic
        if (canvas.ready) {
            const targetTiles = canvas.scene?.tiles.filter((t) => t.getFlag(MODULE_ID, "targetName")) ?? [];
            for (const tile of targetTiles) {
                const targetName = tile.getFlag(MODULE_ID, "targetName");
                buttons.push({
                    name: targetName,
                    icon: '<i class="fas fa-cubes"></i>',
                    callback: (s) => ContextMenuSystem.setTileTexture(s, tile)
                });
            }
        }

        return buttons;
    }

    static async setTileTexture(src, tile) {
        // OPTIMIZATION: Use loadTexture to get dimensions
        let width, height;
        try {
            const texture = await loadTexture(src);
            width = texture.width;
            height = texture.height;
        } catch (e) {
            console.error("Failed to load texture for sizing:", e);
            return;
        }

        const current = { width: tile.width, height: tile.height };
        const preserve = game.settings.get(MODULE_ID, SETTINGS.PRESERVE_DIMENSION);
        const next = { width: tile.width, height: tile.height };

        if (width && height) {
            if (preserve === "width") next.height = Math.round((height / width) * tile.width);
            else if (preserve === "height") next.width = Math.round((width / height) * tile.height);
        }

        const centerX = tile.x + current.width / 2;
        const centerY = tile.y + current.height / 2;
        const newPos = { x: centerX - next.width / 2, y: centerY - next.height / 2 };

        await tile.update({
            "texture.src": src,
            width: next.width,
            height: next.height,
            x: newPos.x,
            y: newPos.y
        });
    }

    static renderTileConfig(app, html) {
        if (!ImageShareUtils.canUserShare) return;

        // V13 AppV2 HTML handling might be different, but for now assuming standard form manipulation via DOM
        // Check if we already injected to avoid duplicates
        if (html.querySelector(`[name="flags.${MODULE_ID}.targetName"]`)) return;

        const targetName = app.document.getFlag(MODULE_ID, "targetName") || "";

        // Attempt to find the appearance tab or append to end
        const tab = html.querySelector(`.tab[data-tab="appearance"]`) ??
            html.querySelector(`section.tab[data-tab="appearance"]`) ?? // V12/V13 AppV2 style
            html;

        const fieldset = document.createElement("fieldset");
        fieldset.innerHTML = `
        <legend>Image Context</legend>
        <div class="form-group">
          <label>Target Name</label>
          <div class="form-fields">
              <input type="text" name="flags.${MODULE_ID}.targetName" value="${targetName}" />
          </div>
          <p class="hint">Target tiles appear in the Image Context menu for quick texture swapping.</p>
        </div>`;

        // If using AppV2, html might be the element itself
        if (tab) tab.appendChild(fieldset);
    }
}
