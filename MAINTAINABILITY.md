# Commons Desk Maintainability Guide

This app is now organized with a primary orchestrator file plus a shared helper module.

## File structure

- `index.html`: UI structure and script entrypoint
- `styles.css`: stylesheet entry file (imports split style modules)
- `styles/base.css`: tokens and global/shared styles
- `styles/layout.css`: topbar, page frame, shared panel layout
- `styles/history.css`: history page + gallery inspector styles
- `styles/settings.css`: settings drawer and export settings styles
- `styles/finder.css`: finder/search/details/results styles
- `styles/responsive.css`: responsive overrides
- `js/main.js`: app orchestration, UI events, state, feature flows
- `js/utils.js`: reusable pure helpers (text, date parsing, escaping, file helpers)

## `js/main.js` navigation map

### 1) Bootstrapping and state
Top of file:
- Constants and default settings
- DOM references
- Runtime state values
- Event listener registration

### 2) Search and sorting
Functions around:
- `buildSearchUrl`
- `buildSearchQuery`
- `mapPageToImageResult`
- `sortResultsBySelectedMode`
- `setSearchStatus`

### 3) Finder details and shortcode generation
Functions around:
- `selectImage`
- `regenerateOutputs`
- `buildCaption`
- `buildShortcodeForImage`

### 4) Settings and view controls
Functions around:
- `setActiveView`
- `openSettingsPanel`
- `applySettingsToUI`
- `parseExportMaxWidth`
- `parseExportTargetKb`
- `parseExportFormat`

### 5) Gallery mode
Functions around:
- `toggleGallerySelection`
- `updateGallerySelectionList`
- `saveGalleryDraftToHistory`
- `finishCurrentGallery`

### 6) History and gallery inspector
Functions around:
- `renderHistory`
- `openHistoryGalleryInspector`
- `renderHistoryGalleryInspector`
- `refreshActiveHistoryGalleryShortcode`
- `exportAllHistoryGalleryImages`

### 7) Persistence and export directory
Functions around:
- `loadHistory` / `persistHistory`
- `loadSettings` / `saveSettings`
- `chooseExportDirectory`
- `updateExportDirectoryUI`

### 8) Image export pipeline
Functions near lower section:
- `optimizeImageForDownload`
- `canvasToImageBlob`
- `getImageFileName`
- `normalizeFileNameForExport`

## `js/utils.js` responsibilities

`js/utils.js` contains pure reusable helpers:
- escaping: `escapeHtml`, `escapeAttribute`, `escapeShortcodeValue`
- text cleanup: `cleanFileTitle`, `stripHtml`, `normalizeAuthor`
- filename helpers: `slugifyFileName`, `removeCommonImageExtension`
- date parsing: `parseCommonsMetadataDate`
- browser download trigger: `triggerDownload`

## Refactor strategy for future work

If you want to continue splitting `app.js`, do it by feature slice:

1. `search.js` (search requests + sort logic)
2. `history.js` (history rendering + actions)
3. `gallery.js` (gallery mode + inspector)
4. `export.js` (optimize/format/download pipeline)

Keep each module mostly pure, pass dependencies as arguments, and keep DOM event wiring in one place.

## Styling workflow

Use this order when editing styles:

1. Add shared tokens/utilities to `styles/base.css`
2. Add feature styles to the matching module (`history`, `settings`, `finder`)
3. Add viewport-specific adjustments only in `styles/responsive.css`
4. Keep `styles.css` as imports only (do not add direct style rules there)
