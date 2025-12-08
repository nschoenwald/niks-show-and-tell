import { ImageShareUtils } from "../utils.js";
import { ClipboardSystem } from "./clipboard.js";

export class SceneToolsSystem {
    static init() {
        Hooks.on("getSceneControlButtons", SceneToolsSystem.addTool);
    }

    static addTool(controls) {
        if (!ImageShareUtils.canUserShare) return;

        let tiles;

        // === UNIVERSAL LOOKUP ===
        // 1. Try Direct Access (Plain Object) - This is what your V13 build uses
        if (controls.tiles) {
            tiles = controls.tiles;
        }
        // 2. Try Map/Collection (.get) - Used in some other V13 prototypes
        else if (typeof controls.get === "function") {
            tiles = controls.get("tiles");
        } 
        // 3. Try Array (.find) - Used in V12 and older
        else if (Array.isArray(controls)) {
            tiles = controls.find(c => c.name === "tiles");
        }
        // 4. "Brute Force" Fallback
        // If it's an object but not keyed as expected, search values
        else {
            tiles = Object.values(controls || {}).find(c => c.name === "tiles");
        }
        // ========================

        if (!tiles) {
            console.warn("NIKS-SHOW-AND-TELL | Could not find 'tiles' layer.");
            return;
        }

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
                    const src = await navigator.clipboard.readText();
                    if (src) {
                        return ClipboardSystem.showPasteMenuForSource({ dataUrl: src });
                    } else {
                        ui.notifications.warn(game.i18n.localize("NIKS-SHOW-AND-TELL.Notifications.ClipboardEmpty"));
                    }
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
