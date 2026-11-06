# Changelog

## 14.16.1

- Fixed pasting images copied from some websites, such as Notion, in Chrome on Windows. The image now comes straight from your clipboard instead of being downloaded from the website, which often failed because the site requires a login or blocks downloads from other sites.
- With **Paste Images** set to "Anywhere outside text fields", these images can now also be pasted outside the chat input.

## 14.16.0

- **Show to Players** now opens a dialog where you choose who sees the image: everyone, or only selected users (with the same Players / GMs / None buttons as for whispers). Only users who are currently connected are listed, and the list updates when someone joins or leaves. You can also add a caption, which appears below the image. Your last selection is remembered. Press Enter to show the image to everyone right away.

## 14.15.0

- The module settings are now grouped into sections: Sharing, Uploads, Compression and Your Preferences. Maximum Image Size is greyed out while compression is off.
- Removed the setting **Choose Recipients When Sharing**. "Post to Chat" and pasted images now always open the share dialog with the recipient list. Press Enter in the dialog to post for everyone right away.
- Removed the setting **WebP Compression Quality**. Compressed images always use quality 0.8, the previous default. To upload images in full quality, turn off **Compress Images**.
- **Paste Images** now defaults to "Only in the chat input", so pasting on the canvas is left to Foundry and other modules. If you prefer pasting images from anywhere, switch it back to "Anywhere outside text fields" (per user). Players who already changed this setting keep their choice.

## 14.14.1

- Removed the French, Spanish, Italian, Brazilian Portuguese, Japanese, Polish and Czech translations. They were machine-translated and never checked by a native speaker. Players who use Foundry in one of these languages now see this module in English. Translations by native speakers are welcome as an issue or pull request.

## 14.14.0

- New per-user setting **Paste Images**: share pasted images anywhere (as before), only when pasting into the chat input, or never. Choose "Only in the chat input" if you use another module that turns pasted images into tiles or scenes, so its paste dialog opens again.

## 14.13.1

- Fixed the version numbering of the GitHub releases. 14.12.0 and 14.13.0 had been published under the wrong release numbers (14.2.0 and 14.3.0).

## 14.13.0

- New translations: Japanese, Polish and Czech. The module is now available in nine languages.

## 14.12.0

- The module is now available in German, French, Spanish, Italian and Brazilian Portuguese.

## 14.11.0

- First release after a comprehensive refactor of the module.
