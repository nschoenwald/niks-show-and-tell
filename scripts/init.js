import { registerSettings } from "./settings.js";
import { ClipboardSystem } from "./systems/clipboard.js";
import { ChatSystem } from "./systems/chat.js";
import { ContextMenuSystem } from "./systems/context-menu.js";
import { SceneToolsSystem } from "./systems/tools.js";

Hooks.once("init", async () => {
    console.log("Nik's Show & Tell | Initializing...");
    registerSettings();
});

Hooks.once("ready", () => {
    ClipboardSystem.init();
    ChatSystem.init();
    ContextMenuSystem.init();
});

Hooks.on("renderTileConfig", (app, html) => {
    ContextMenuSystem.renderTileConfig(app, html);
});

// Scene Tools hooks are better initialized early or via static init if they hook themselves
SceneToolsSystem.init();
