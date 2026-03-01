# Commons Desk

Commons Desk is a serverless browser app for finding Wikimedia Commons images and generating Hugo-ready shortcodes with export workflows.

## Core features

- Search Wikimedia Commons with sort, assessment, and experimental photo-date filters
- Review image metadata and generate shortcodes for multiple layouts
- Build galleries and edit per-image captions/layout from History
- Export optimized images with configurable settings:
  - manual max width
  - manual target file size
  - file format (`webp`, `jpg`, `png`)
- Save reusable history and local settings in browser storage
- Optional direct folder export via File System Access API (when supported)

## Project structure

- `index.html` — UI markup and script entrypoint
- `styles.css` — app styles
- `js/main.js` — primary app orchestration and feature logic
- `js/utils.js` — shared utility helpers
- `MAINTAINABILITY.md` — code navigation and refactor guide

## Run locally

No backend or build step is required.

1. Open `index.html` directly, or
2. Serve with any static server.

Example:

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Notes

- Data is fetched directly from the Wikimedia Commons API.
- Clipboard features may require a secure context (`https` or `localhost`).
- Direct folder export availability depends on browser support and permissions.
