import { ChatImages } from "./features/chat-images.js";
import { ImageMenu } from "./features/image-menu.js";
import { PasteDrop } from "./features/paste-drop.js";
import { Uploads } from "./features/uploads.js";
import { applyChatImageMaxHeight, registerSettings } from "./settings.js";

Hooks.once("init", () => {
    registerSettings();
    // Before the chat log first renders
    applyChatImageMaxHeight();
    ChatImages.init();
});

Hooks.once("ready", () => {
    Uploads.init();
    ImageMenu.init();
    PasteDrop.init();
});
