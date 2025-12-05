export const MODULE_ID = "niks-show-and-tell";

export const SETTINGS = {
    ADVANCED_TO_CHAT: "advancedToChat",
    PRESERVE_DIMENSION: "preserveDimension",
    UPLOAD_LOCATION: "uploadLocation",
    MIN_ROLE: "minRole",
    WEBP_QUALITY: "webpQuality",
    ENABLE_DRAG_DROP: "enableDragDrop"
};

export function registerSettings() {
    game.settings.register(MODULE_ID, SETTINGS.ADVANCED_TO_CHAT, {
        name: "NIKS-SHOW-AND-TELL.Settings.AdvancedToChat.Name",
        hint: "NIKS-SHOW-AND-TELL.Settings.AdvancedToChat.Hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register(MODULE_ID, SETTINGS.PRESERVE_DIMENSION, {
        name: "NIKS-SHOW-AND-TELL.Settings.PreserveDimension.Name",
        hint: "NIKS-SHOW-AND-TELL.Settings.PreserveDimension.Hint",
        scope: "world",
        config: true,
        type: String,
        choices: {
            width: "NIKS-SHOW-AND-TELL.Settings.PreserveDimension.Width",
            height: "NIKS-SHOW-AND-TELL.Settings.PreserveDimension.Height"
        },
        default: "width"
    });

    game.settings.register(MODULE_ID, SETTINGS.UPLOAD_LOCATION, {
        name: "NIKS-SHOW-AND-TELL.Settings.UploadLocation.Name",
        hint: "NIKS-SHOW-AND-TELL.Settings.UploadLocation.Hint",
        scope: "world",
        config: true,
        type: String,
        filePicker: "folder",
        default: "niks-show-and-tell-uploads"
    });

    game.settings.register(MODULE_ID, SETTINGS.MIN_ROLE, {
        name: "NIKS-SHOW-AND-TELL.Settings.MinRole.Name",
        hint: "NIKS-SHOW-AND-TELL.Settings.MinRole.Hint",
        scope: "world",
        config: true,
        type: Number,
        choices: {
            1: "Player",
            2: "Trusted Player",
            3: "Assistant GM",
            4: "Game Master"
        },
        default: 4
    });

    game.settings.register(MODULE_ID, SETTINGS.WEBP_QUALITY, {
        name: "NIKS-SHOW-AND-TELL.Settings.WebPQuality.Name",
        hint: "NIKS-SHOW-AND-TELL.Settings.WebPQuality.Hint",
        scope: "world",
        config: true,
        type: Number,
        range: { min: 0.1, max: 1.0, step: 0.1 },
        default: 0.8
    });

    game.settings.register(MODULE_ID, SETTINGS.ENABLE_DRAG_DROP, {
        name: "NIKS-SHOW-AND-TELL.Settings.EnableDragDrop.Name",
        hint: "NIKS-SHOW-AND-TELL.Settings.EnableDragDrop.Hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: true
    });
}
