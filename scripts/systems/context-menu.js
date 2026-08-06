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
        const src = event.target.currentSrc || event.target.src || event.target.getAttribute("src");
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

        // Temporarily place off-screen to measure dimensions
        contextmenu.style.visibility = "hidden";
        document.body.appendChild(contextmenu);

        // Clamp position to keep menu within viewport
        const rect = contextmenu.getBoundingClientRect();
        const maxX = window.innerWidth - rect.width - 4;
        const maxY = window.innerHeight - rect.height - 4;
        contextmenu.style.top = `${Math.min(event.clientY, Math.max(0, maxY))}px`;
        contextmenu.style.left = `${Math.min(event.clientX, Math.max(0, maxX))}px`;
        contextmenu.style.visibility = "";
    }

    static getButtons(src) {
        const buttons = [
            {
                name: game.i18n.localize("NIKS-SHOW-AND-TELL.Buttons.Show"),
                icon: '<i class="fas fa-eye"></i>',
                callback: (s) => new foundry.applications.apps.ImagePopout({ src: s }).render(true)
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
            },
            {
                name: game.i18n.localize("NIKS-SHOW-AND-TELL.Buttons.CopyImage"),
                icon: '<i class="fas fa-copy"></i>',
                callback: async (s) => {
                    const absoluteUrl = new URL(s, document.baseURI).href;
                    const isSameOrigin = new URL(absoluteUrl).origin === location.origin;

                    // Check for Secure Context (HTTPS or localhost)
                    if (!navigator.clipboard?.write) {
                        game.clipboard.copyPlainText(absoluteUrl);
                        ui.notifications.warn(game.i18n.localize("NIKS-SHOW-AND-TELL.Notifications.URLCopied") + " (Clipboard API requires HTTPS)");
                        return;
                    }

                    // Check browser ClipboardItem support (Issue 10 fix)
                    if (typeof ClipboardItem === "undefined" || (typeof ClipboardItem.supports === "function" && !ClipboardItem.supports("image/png"))) {
                        game.clipboard.copyPlainText(absoluteUrl);
                        ui.notifications.warn(game.i18n.localize("NIKS-SHOW-AND-TELL.Notifications.URLCopied") + " (Image copy not supported in this browser)");
                        return;
                    }

                    let blob;
                    try {
                        if (s.startsWith("data:")) {
                            blob = await ImageShareUtils.blobFromDataURL(s);
                        } else {
                            try {
                                // Issue 8 fix: use same-origin mode for same-origin URLs
                                const response = await fetch(absoluteUrl, { mode: isSameOrigin ? "same-origin" : "cors" });
                                if (!response.ok) throw new Error(`HTTP status ${response.status}`);
                                blob = await response.blob();
                            } catch (fetchErr) {
                                if (!isSameOrigin) {
                                    // S3 / Browser Cache issue: query param cache-buster with CORS mode
                                    const corsUrl = absoluteUrl + (absoluteUrl.includes("?") ? "&" : "?") + "_cors=" + Date.now();
                                    try {
                                        const response = await fetch(corsUrl, { mode: "cors" });
                                        if (!response.ok) throw new Error(`HTTP status ${response.status}`);
                                        blob = await response.blob();
                                    } catch (corsFetchErr) {
                                        blob = await ImageShareUtils.fetchImageViaCanvas(corsUrl);
                                    }
                                } else {
                                    blob = await ImageShareUtils.fetchImageViaCanvas(absoluteUrl);
                                }
                            }
                        }

                        if (blob.type !== "image/png") {
                            const bmp = await createImageBitmap(blob);
                            const canvas = document.createElement("canvas");
                            canvas.width = bmp.width;
                            canvas.height = bmp.height;
                            const ctx = canvas.getContext("2d");
                            ctx.drawImage(bmp, 0, 0);
                            blob = await new Promise((resolve, reject) => {
                                canvas.toBlob((result) => {
                                    if (result) resolve(result);
                                    else reject(new Error("Canvas PNG conversion returned null"));
                                }, "image/png");
                            });
                        }
                    } catch (fetchOrCanvasErr) {
                        // Raw image bitmap could not be fetched/converted (e.g. CORS restriction on external server)
                        console.warn("Nik's Show & Tell | Direct image byte fetch failed (CORS restriction). Falling back to URL copy.", fetchOrCanvasErr);
                        game.clipboard.copyPlainText(absoluteUrl);
                        ui.notifications.warn(game.i18n.localize("NIKS-SHOW-AND-TELL.Notifications.URLCopied"));
                        return;
                    }

                    // Write PNG blob to system clipboard
                    try {
                        const item = new ClipboardItem({ "image/png": blob });
                        await navigator.clipboard.write([item]);
                        ui.notifications.info(game.i18n.localize("NIKS-SHOW-AND-TELL.Notifications.ImageCopied"));
                    } catch (writeErr) {
                        console.error("Nik's Show & Tell | Clipboard write failed, falling back to URL copy:", writeErr);
                        game.clipboard.copyPlainText(absoluteUrl);
                        ui.notifications.warn(game.i18n.localize("NIKS-SHOW-AND-TELL.Notifications.URLCopied"));
                    }
                }
            },
            {
                name: game.i18n.localize("NIKS-SHOW-AND-TELL.Buttons.SaveImage"),
                icon: '<i class="fas fa-download"></i>',
                callback: async (s) => {
                    try {
                        const absoluteUrl = new URL(s, document.baseURI).href;
                        const isSameOrigin = new URL(absoluteUrl).origin === location.origin;
                        let blob;
                        if (s.startsWith("data:")) {
                            blob = await ImageShareUtils.blobFromDataURL(s);
                        } else {
                            try {
                                const response = await fetch(absoluteUrl, { mode: isSameOrigin ? "same-origin" : "cors" });
                                if (!response.ok) throw new Error(`HTTP status ${response.status}`);
                                blob = await response.blob();
                            } catch (fetchErr) {
                                blob = await ImageShareUtils.fetchImageViaCanvas(absoluteUrl);
                            }
                        }
                        const filename = absoluteUrl.split("/").pop().split("?")[0] || "image.png";
                        const a = document.createElement("a");
                        const blobUrl = URL.createObjectURL(blob);
                        a.href = blobUrl;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(blobUrl);
                    } catch (err) {
                        console.error("Nik's Show & Tell | Failed to save image", err);
                        ui.notifications.error(game.i18n.localize("NIKS-SHOW-AND-TELL.Notifications.SaveFailed"));
                    }
                }
            }
        ];

        return buttons;
    }

}
