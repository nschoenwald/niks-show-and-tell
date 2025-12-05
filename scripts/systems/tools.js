import { ImageShareUtils } from "../utils.js";
import { ClipboardSystem } from "./clipboard.js";

export class SceneToolsSystem {
    static init() {
        Hooks.on("getSceneControlButtons", SceneToolsSystem.addTool);
    }

    static addTool(controls) {
        if (!ImageShareUtils.canUserShare) return;

        const tiles = controls.find((c) => c.name === "tiles");
        if (!tiles) return;

        const toolDef = {
            name: "showurl",
            title: "NIKS-SHOW-AND-TELL.Tools.ShowUrl.Title",
            icon: "fas fa-images",
            button: true,
            visible: true,
            onClick: async () => {
                try {
                    const b64 = await ImageShareUtils.imageFromClipboard();
                    if (b64) {
                        return ClipboardSystem.showPasteMenuForSource({ dataUrl: b64 });
                    }

                    const src = await navigator.clipboard.readText();
                    if (src) {
                        ClipboardSystem.showPasteMenuForSource({ dataUrl: src });
                    } else {
                        ui.notifications.warn(game.i18n.localize("NIKS-SHOW-AND-TELL.Notifications.ClipboardEmpty"));
                    }
                } catch (err) {
                    new foundry.applications.api.DialogV2({
                        window: { title: game.i18n.localize("NIKS-SHOW-AND-TELL.Dialog.PasteImage.Title") },
                        content: game.i18n.localize("NIKS-SHOW-AND-TELL.Dialog.PasteImage.Content"),
                        buttons: [{ action: "close", label: game.i18n.localize("NIKS-SHOW-AND-TELL.Buttons.Close"), icon: "fas fa-times" }]
                    }).render(true);
                }
            }
        };

        // Patching tools array
        if (Array.isArray(tiles.tools)) tiles.tools.push(toolDef);
    }
}
