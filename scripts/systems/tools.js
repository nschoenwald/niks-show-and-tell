import { ImageShareUtils } from "../utils.js";
import { ClipboardSystem } from "./clipboard.js";

export class SceneToolsSystem {
    static init() {
        Hooks.on("getSceneControlButtons", SceneToolsSystem.addTool);
    }

    static addTool(controls) {
        if (!ImageShareUtils.canUserShare) return;

        const tiles = controls.find(c => c.name === "tiles");
        if (!tiles) return;

        const toolDef = {
            name: "showurl",
            title: "NIKS-SHOW-AND-TELL.Tools.ShowUrl.Title",
            icon: "fas fa-images",
            button: true,
            visible: true,
            onClick: async () => {
                try {
                    // 1. Try Image Blob (Copy Image)
                    const b64 = await ImageShareUtils.imageFromClipboard();
                    if (b64) {
                        return ClipboardSystem.showPasteMenuForSource({ dataUrl: b64 });
                    }

                    // 2. Try Text URL (Copy Image Link)
                    const text = await navigator.clipboard.readText();
                    if (text) {
                        // Validate it looks like a URL or file path before opening dialog
                        // Simple check: starts with http/https or file: or has an image extension
                        const isUrl = /^https?:\/\//i.test(text);
                        const isFile = /^file:\/\//i.test(text);
                        const hasImgExt = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(text);

                        if (isUrl || isFile || hasImgExt) {
                            return ClipboardSystem.showPasteMenuForSource({ dataUrl: text });
                        }
                    }

                    ui.notifications.warn(game.i18n.localize("NIKS-SHOW-AND-TELL.Notifications.ClipboardEmpty"));

                } catch (err) {
                    console.error("Paste Error:", err);
                    new foundry.applications.api.DialogV2({
                        window: { title: game.i18n.localize("NIKS-SHOW-AND-TELL.Dialog.PasteImage.Title") },
                        content: game.i18n.localize("NIKS-SHOW-AND-TELL.Dialog.PasteImage.Content"),
                        buttons: [{ action: "close", label: game.i18n.localize("NIKS-SHOW-AND-TELL.Buttons.Close"), icon: "fas fa-times" }]
                    }).render(true);
                }
            }
        };

        // Ensure tiles.tools exists and is an array before pushing
        if (!tiles.tools) tiles.tools = [];
        if (Array.isArray(tiles.tools)) {
            tiles.tools.push(toolDef);
        }
    }
}