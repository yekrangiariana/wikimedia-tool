import {
  cleanFileTitle,
  escapeAttribute,
  escapeHtml,
  escapeShortcodeValue,
  normalizeAuthor,
  parseCommonsMetadataDate,
  removeCommonImageExtension,
  slugifyFileName,
  stripHtml,
  triggerDownload,
} from "./utils.js";
import { createImageEditorController } from "./editor.js";
import {
  buildEditedPreviewUrlFromImageUrl,
  normalizeEditOperations,
} from "./editPipeline.js";

const API_BASE = "https://commons.wikimedia.org/w/api.php";
const SEARCH_LIMIT = 50;
const PHOTO_DATE_SCAN_PAGES_DEFAULT = 6;
const PREVIEW_THUMB_WIDTH = 160;
const DOWNLOAD_MAX_WIDTH = 1920;
const DOWNLOAD_MAX_BYTES = 150 * 1024;
const EXPORT_WIDTH_MIN = 320;
const EXPORT_WIDTH_MAX = 6000;
const EXPORT_TARGET_KB_MIN = 40;
const EXPORT_TARGET_KB_MAX = 5000;
const EXPORT_FORMATS = ["webp", "jpg", "png"];
const SPLIT_CACHE_URL_PREFIX = "split-cache:";
const HISTORY_STORAGE_KEY = "wikimediaTool.history.v1";
const SETTINGS_STORAGE_KEY = "wikimediaTool.settings.v1";
const IMAGE_EDITS_STORAGE_KEY = "wikimediaTool.imageEdits.v1";
const DIRECTORY_DB_NAME = "wikimediaTool.storage";
const DIRECTORY_STORE_NAME = "kv";
const PREVIEW_CACHE_STORE_NAME = "previewCache";
const DIRECTORY_HANDLE_KEY = "exportDirectoryHandle";
const HISTORY_INDEXED_DB_KEY = "historyEntries";
const DEFAULT_SETTINGS = {
  gridColumns: 3,
  exportPathLabel: "",
  photoScanPages: PHOTO_DATE_SCAN_PAGES_DEFAULT,
  galleryMode: false,
  splitMode: false,
  exportMaxWidth: DOWNLOAD_MAX_WIDTH,
  exportTargetKb: Math.round(DOWNLOAD_MAX_BYTES / 1024),
  exportFormat: "webp",
};

const searchForm = document.getElementById("searchForm");
const searchInput = document.getElementById("searchInput");
const searchSubmitBtn = searchForm.querySelector("button[type='submit']");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
const showMoreBtn = document.getElementById("showMoreBtn");
const finderView = document.getElementById("finderView");
const historyView = document.getElementById("historyView");
const showFinderViewBtn = document.getElementById("showFinderViewBtn");
const showHistoryViewBtn = document.getElementById("showHistoryViewBtn");
const historyHeader = document.querySelector(".history-header");
const historyList = document.getElementById("historyList");
const historySectionToggle = document.getElementById("historySectionToggle");
const historyShowSingleBtn = document.getElementById("historyShowSingleBtn");
const historyShowGalleriesBtn = document.getElementById(
  "historyShowGalleriesBtn",
);
const historyGallerySection = document.getElementById("historyGallerySection");
const historySingleSection = document.getElementById("historySingleSection");
const historyGalleryList = document.getElementById("historyGalleryList");
const historySingleList = document.getElementById("historySingleList");
const historyEmpty = document.getElementById("historyEmpty");
const historyHeaderTitle = document.getElementById("historyHeaderTitle");
const historyHeaderSubtitle = document.getElementById("historyHeaderSubtitle");
const historyHeaderTitleEditBtn = document.getElementById(
  "historyHeaderTitleEditBtn",
);
const historyHeaderSubtitleEditBtn = document.getElementById(
  "historyHeaderSubtitleEditBtn",
);
const historyGalleryHeaderBar = document.getElementById(
  "historyGalleryHeaderBar",
);
const historyGalleryInspector = document.getElementById(
  "historyGalleryInspector",
);
const historyGalleryMeta = document.getElementById("historyGalleryMeta");
const historyGalleryItems = document.getElementById("historyGalleryItems");
const historyGalleryPrefixExportCheckbox = document.getElementById(
  "historyGalleryPrefixExportCheckbox",
);
const historyGalleryExportAllBtn = document.getElementById(
  "historyGalleryExportAllBtn",
);
const historyGalleryCopyAllCaptionsBtn = document.getElementById(
  "historyGalleryCopyAllCaptionsBtn",
);
const historyGalleryAddMoreBtn = document.getElementById(
  "historyGalleryAddMoreBtn",
);
const historyGalleryCloseBtn = document.getElementById(
  "historyGalleryCloseBtn",
);
const historyGalleryDetails = document.getElementById("historyGalleryDetails");
const historyGalleryDetailsEmpty = document.getElementById(
  "historyGalleryDetailsEmpty",
);
const historyGalleryPreview = document.getElementById("historyGalleryPreview");
const historyGalleryProgressOverlay = document.getElementById(
  "historyGalleryProgressOverlay",
);
const historyGalleryItemTitle = document.getElementById(
  "historyGalleryItemTitle",
);
const historyGalleryCaptionInput = document.getElementById(
  "historyGalleryCaptionInput",
);
const historyGalleryFillDefaultCaptionBtn = document.getElementById(
  "historyGalleryFillDefaultCaptionBtn",
);
const historyGalleryLayoutSelect = document.getElementById(
  "historyGalleryLayoutSelect",
);
const historyGalleryWidthRow = document.getElementById(
  "historyGalleryWidthRow",
);
const historyGalleryWidthInput = document.getElementById(
  "historyGalleryWidthInput",
);
const historyGalleryShortcodeOutput = document.getElementById(
  "historyGalleryShortcodeOutput",
);
const historyGalleryCopyBtn = document.getElementById("historyGalleryCopyBtn");
const openSettingsBtn = document.getElementById("openSettingsBtn");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
const settingsPanel = document.getElementById("settingsPanel");
const settingsBackdrop = document.getElementById("settingsBackdrop");
const gridColumnsSelect = document.getElementById("gridColumnsSelect");
const galleryModeCheckbox = document.getElementById("galleryModeCheckbox");
const splitModeCheckbox = document.getElementById("splitModeCheckbox");
const photoScanPagesSelect = document.getElementById("photoScanPagesSelect");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const exportSupportText = document.getElementById("exportSupportText");
const exportDirStatus = document.getElementById("exportDirStatus");
const exportMaxWidthInput = document.getElementById("exportMaxWidthInput");
const exportTargetKbInput = document.getElementById("exportTargetKbInput");
const exportFormatSelect = document.getElementById("exportFormatSelect");
const exportPathInput = document.getElementById("exportPathInput");
const selectExportDirBtn = document.getElementById("selectExportDirBtn");
const clearExportDirBtn = document.getElementById("clearExportDirBtn");
const exportFolderSection = document.getElementById("exportFolderSection");
const actionToast = document.getElementById("actionToast");
const progressNotice = document.getElementById("progressNotice");
const editorView = document.getElementById("editorView");
const detailEditBtn = document.getElementById("detailEditBtn");
const historyGalleryEditBtn = document.getElementById("historyGalleryEditBtn");
const editorStage = document.getElementById("editorStage");
const editorProgressOverlay = document.getElementById("editorProgressOverlay");
const editorCanvas = document.getElementById("editorCanvas");
const editorOverlay = document.getElementById("editorOverlay");
const editorBackBtn = document.getElementById("editorBackBtn");
const editorCropToggleBtn = document.getElementById("editorCropToggleBtn");
const editorRemoveBgBtn = document.getElementById("editorRemoveBgBtn");
const editorBackgroundBtn = document.getElementById("editorBackgroundBtn");
const editorColorAdjustBtn = document.getElementById("editorColorAdjustBtn");
const editorEraserBtn = document.getElementById("editorEraserBtn");
const editorApplyCropBtn = document.getElementById("editorApplyCropBtn");
const editorApplyBackgroundBtn = document.getElementById(
  "editorApplyBackgroundBtn",
);
const editorApplyColorAdjustBtn = document.getElementById(
  "editorApplyColorAdjustBtn",
);
const editorColorAdjustContent = document.getElementById(
  "editorColorAdjustContent",
);
const editorBrightnessInput = document.getElementById("editorBrightnessInput");
const editorBrightnessValue = document.getElementById("editorBrightnessValue");
const editorWhiteBalanceInput = document.getElementById(
  "editorWhiteBalanceInput",
);
const editorWhiteBalanceValue = document.getElementById(
  "editorWhiteBalanceValue",
);
const editorSaturationInput = document.getElementById("editorSaturationInput");
const editorSaturationValue = document.getElementById("editorSaturationValue");
const editorBlackpointInput = document.getElementById("editorBlackpointInput");
const editorBlackpointValue = document.getElementById("editorBlackpointValue");
const editorEraserContent = document.getElementById("editorEraserContent");
const editorEraserSizeInput = document.getElementById("editorEraserSizeInput");
const editorEraserSizeValue = document.getElementById("editorEraserSizeValue");
const editorEraserOpacityInput = document.getElementById(
  "editorEraserOpacityInput",
);
const editorEraserOpacityValue = document.getElementById(
  "editorEraserOpacityValue",
);
const editorEraserUndoBtn = document.getElementById("editorEraserUndoBtn");
const editorEraserRedoBtn = document.getElementById("editorEraserRedoBtn");
const editorUndoBtn = document.getElementById("editorUndoBtn");
const editorResetBtn = document.getElementById("editorResetBtn");
const editorDownloadBtn = document.getElementById("editorDownloadBtn");
const editorTitle = document.getElementById("editorTitle");
const editorDimensions = document.getElementById("editorDimensions");
const editorCropContent = document.getElementById("editorCropContent");
const editorBackgroundContent = document.getElementById(
  "editorBackgroundContent",
);
const editorCropHint = document.getElementById("editorCropHint");
const editorAspectRatioRow = document.getElementById("editorAspectRatioRow");
const editorHistoryInfo = document.getElementById("editorHistoryInfo");
const editorSplitReframeControls = document.getElementById(
  "editorSplitReframeControls",
);
const editorSplitMoveUpBtn = document.getElementById("editorSplitMoveUpBtn");
const editorSplitMoveDownBtn = document.getElementById("editorSplitMoveDownBtn");
const editorSplitMoveLeftBtn = document.getElementById("editorSplitMoveLeftBtn");
const editorSplitMoveRightBtn = document.getElementById("editorSplitMoveRightBtn");
const editorSplitZoomInBtn = document.getElementById("editorSplitZoomInBtn");
const editorSplitZoomOutBtn = document.getElementById("editorSplitZoomOutBtn");
const editorAspectRatioSelect = document.getElementById(
  "editorAspectRatioSelect",
);
const editorBackgroundColorInput = document.getElementById(
  "editorBackgroundColorInput",
);
const editorBackgroundColorPreview = document.getElementById(
  "editorBackgroundColorPreview",
);
const editorBackgroundSwatchButtons = Array.from(
  document.querySelectorAll("[data-editor-color]"),
);

const emptyState = document.getElementById("emptyState");
const detailsEl = document.getElementById("details");
const detailsPanel = document.querySelector(".details-panel");
const detailsToggleBtn = document.getElementById("detailsToggleBtn");
const detailPreview = document.getElementById("detailPreview");
const detailProgressOverlay = document.getElementById("detailProgressOverlay");
const detailTitle = document.getElementById("detailTitle");
const detailAuthor = document.getElementById("detailAuthor");
const detailLicense = document.getElementById("detailLicense");
const detailDescription = document.getElementById("detailDescription");
const detailImageUrl = document.getElementById("detailImageUrl");
const detailFilePage = document.getElementById("detailFilePage");
const galleryDetails = document.getElementById("galleryDetails");
const galleryTitleInput = document.getElementById("galleryTitleInput");
const galleryDescriptionInput = document.getElementById(
  "galleryDescriptionInput",
);
const gallerySelectionList = document.getElementById("gallerySelectionList");
const gallerySelectionEmpty = document.getElementById("gallerySelectionEmpty");
const galleryDoneBtn = document.getElementById("galleryDoneBtn");

const splitDetails = document.getElementById("splitDetails");
const splitLayoutSelect = document.getElementById("splitLayoutSelect");
const splitCanvasPresetSelect = document.getElementById("splitCanvasPresetSelect");
const splitSelectionList = document.getElementById("splitSelectionList");
const splitSelectionEmpty = document.getElementById("splitSelectionEmpty");
const splitSelectionCount = document.getElementById("splitSelectionCount");
const splitOutputLayoutSelect = document.getElementById("splitOutputLayoutSelect");
const splitWidthRow = document.getElementById("splitWidthRow");
const splitCustomWidth = document.getElementById("splitCustomWidth");
const splitCaptionInput = document.getElementById("splitCaptionInput");
const splitShortcodeOutput = document.getElementById("splitShortcodeOutput");
const splitCombineBtn = document.getElementById("splitCombineBtn");
const splitCopyShortcodeBtn = document.getElementById("splitCopyShortcodeBtn");

const SPLIT_CANVAS_PRESETS = {
  "16-9": { width: 1920, height: 1080 },
  "4-3": { width: 1600, height: 1200 },
};

function getSplitCanvasSizeFromPreset() {
  const selectedPresetKey = splitCanvasPresetSelect?.value;
  const selectedPreset = SPLIT_CANVAS_PRESETS[selectedPresetKey];
  return selectedPreset || SPLIT_CANVAS_PRESETS["16-9"];
}

const layoutSelect = document.getElementById("layoutSelect");
const widthRow = document.getElementById("widthRow");
const customWidth = document.getElementById("customWidth");
const captionInput = document.getElementById("captionInput");
const fillDefaultCaptionBtn = document.getElementById("fillDefaultCaptionBtn");
const shortcodeOutput = document.getElementById("shortcodeOutput");
const sortSelect = document.getElementById("sortSelect");
const assessmentSelect = document.getElementById("assessmentSelect");
const photoDateSortSelect = document.getElementById("photoDateSortSelect");
const scanMorePhotoBtn = document.getElementById("scanMorePhotoBtn");

const copyShortcodeBtn = document.getElementById("copyShortcodeBtn");
const downloadImageBtn = document.getElementById("downloadImageBtn");

let currentResults = [];
let selectedImage = null;
let currentQuery = "";
let nextContinue = null;
let currentTotalAvailable = null;
let loadingMore = false;
let downloadingImage = false;
let downloadingHistoryId = null;
let isMobileDetailsCollapsed = false;
let historyEntries = [];
let settings = { ...DEFAULT_SETTINGS };
let exportDirectoryHandle = null;
let exportDirectoryName = "";
let activeViewName = "finder";
let actionToastTimer = null;
let editorSettingsWasOpen = false;
const imageEditState = new Map();
let persistedImageEdits = {};
let scanningPhotoDate = false;
let selectedSplitItems = new Map();
let selectedGalleryItems = new Map();
let currentGalleryHistoryId = null;
let gallerySaveTimer = null;
let galleryDoneButtonTimer = null;
let galleryDoneLinkEntryId = null;
let activeHistoryGalleryId = null;
let activeHistoryGalleryItemIndex = null;
let historySectionMode = "single";
let draggedHistoryGalleryIndex = null;
const historyGalleryDrafts = new Map();
let exportingHistoryGalleryImages = false;
const ROUTE_FINDER = "finder";
const ROUTE_VAULT = "vault";
let isApplyingHashRoute = false;
let activeEditorRouteId = null;
let lastEditorOpenRequest = null;
const editorRouteRequests = new Map();
const MOBILE_DRAG_LONG_PRESS_MS = 220;
const MOBILE_DRAG_CANCEL_MOVE_PX = 10;
const HISTORY_GALLERY_AUTOSCROLL_EDGE_PX = 64;
const HISTORY_GALLERY_AUTOSCROLL_MAX_STEP = 18;
let historyGalleryAutoScrollRaf = null;
let historyGalleryAutoScrollStep = 0;
const previewBuildQueue = [];
let previewBuildQueueRunning = false;
let progressNoticeDepth = 0;
const previewBlobUrls = new Map();
let imageEditsNeedsCompaction = false;
let activeSearchAbortController = null;
let activeSearchRequestId = 0;
let directoryDbPromise = null;

function normalizeEditorHexColor(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  const shortHexMatch = raw.match(/^#([0-9a-f]{3})$/i);
  if (shortHexMatch) {
    const digits = shortHexMatch[1].toLowerCase();
    return `#${digits[0]}${digits[0]}${digits[1]}${digits[1]}${digits[2]}${digits[2]}`;
  }

  const longHexMatch = raw.match(/^#([0-9a-f]{6})$/i);
  if (longHexMatch) {
    return `#${longHexMatch[1].toLowerCase()}`;
  }

  return null;
}

function syncEditorBackgroundSwatches(color) {
  editorBackgroundSwatchButtons.forEach((button) => {
    const swatchColor = normalizeEditorHexColor(button.dataset.editorColor);
    button.classList.toggle("active-color", swatchColor === color);
  });
}

function applyEditorBackgroundColor(color) {
  const normalized = normalizeEditorHexColor(color) || "#ffffff";

  if (editorBackgroundColorInput) {
    editorBackgroundColorInput.value = normalized;
  }
  if (editorBackgroundColorPreview) {
    editorBackgroundColorPreview.style.background = normalized;
  }

  syncEditorBackgroundSwatches(normalized);
}

function initializeEditorBackgroundPicker() {
  if (!editorBackgroundColorInput) {
    return;
  }

  editorBackgroundColorInput.addEventListener("input", () => {
    const normalized = normalizeEditorHexColor(
      editorBackgroundColorInput.value,
    );
    if (!normalized) {
      return;
    }
    applyEditorBackgroundColor(normalized);
  });

  editorBackgroundColorInput.addEventListener("blur", () => {
    applyEditorBackgroundColor(editorBackgroundColorInput.value);
  });

  editorBackgroundSwatchButtons.forEach((button) => {
    const swatchColor = normalizeEditorHexColor(button.dataset.editorColor);
    if (!swatchColor) {
      return;
    }

    button.style.background = swatchColor;
    button.addEventListener("click", () => {
      applyEditorBackgroundColor(swatchColor);
    });
  });

  applyEditorBackgroundColor(editorBackgroundColorInput.value);
}

function enqueuePreviewBuild(task) {
  return new Promise((resolve, reject) => {
    previewBuildQueue.push({ task, resolve, reject });
    drainPreviewBuildQueue();
  });
}

function schedulePreviewQueueDrain(callback) {
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(
      () => {
        callback();
      },
      { timeout: 700 },
    );
    return;
  }

  window.setTimeout(callback, 0);
}

function drainPreviewBuildQueue() {
  if (previewBuildQueueRunning || !previewBuildQueue.length) {
    return;
  }

  previewBuildQueueRunning = true;
  const nextJob = previewBuildQueue.shift();

  schedulePreviewQueueDrain(() => {
    Promise.resolve()
      .then(() => nextJob.task())
      .then(nextJob.resolve)
      .catch(nextJob.reject)
      .finally(() => {
        previewBuildQueueRunning = false;
        drainPreviewBuildQueue();
      });
  });
}

const imageEditor = createImageEditorController({
  rootEl: editorView,
  stageEl: editorStage,
  progressOverlayEl: editorProgressOverlay,
  canvasEl: editorCanvas,
  overlayEl: editorOverlay,
  backBtn: editorBackBtn,
  cropToggleBtn: editorCropToggleBtn,
  removeBgBtn: editorRemoveBgBtn,
  backgroundBtn: editorBackgroundBtn,
  colorAdjustBtn: editorColorAdjustBtn,
  eraserBtn: editorEraserBtn,
  applyCropBtn: editorApplyCropBtn,
  applyBackgroundBtn: editorApplyBackgroundBtn,
  applyColorAdjustBtn: editorApplyColorAdjustBtn,
  colorAdjustContentEl: editorColorAdjustContent,
  brightnessInput: editorBrightnessInput,
  brightnessValueEl: editorBrightnessValue,
  whiteBalanceInput: editorWhiteBalanceInput,
  whiteBalanceValueEl: editorWhiteBalanceValue,
  saturationInput: editorSaturationInput,
  saturationValueEl: editorSaturationValue,
  blackpointInput: editorBlackpointInput,
  blackpointValueEl: editorBlackpointValue,
  eraserContentEl: editorEraserContent,
  eraserSizeInput: editorEraserSizeInput,
  eraserSizeValueEl: editorEraserSizeValue,
  eraserOpacityInput: editorEraserOpacityInput,
  eraserOpacityValueEl: editorEraserOpacityValue,
  eraserUndoBtn: editorEraserUndoBtn,
  eraserRedoBtn: editorEraserRedoBtn,
  undoBtn: editorUndoBtn,
  resetBtn: editorResetBtn,
  downloadBtn: editorDownloadBtn,
  titleEl: editorTitle,
  dimensionsEl: editorDimensions,
  aspectRatioSelect: editorAspectRatioSelect,
  backgroundColorInput: editorBackgroundColorInput,
  aspectRatioRow: editorAspectRatioRow,
  cropContentEl: editorCropContent,
  backgroundContentEl: editorBackgroundContent,
  cropHintEl: editorCropHint,
  historyInfoEl: editorHistoryInfo,
  splitReframeControlsEl: editorSplitReframeControls,
  splitMoveUpBtn: editorSplitMoveUpBtn,
  splitMoveDownBtn: editorSplitMoveDownBtn,
  splitMoveLeftBtn: editorSplitMoveLeftBtn,
  splitMoveRightBtn: editorSplitMoveRightBtn,
  splitZoomInBtn: editorSplitZoomInBtn,
  splitZoomOutBtn: editorSplitZoomOutBtn,
  onBack: closeImageEditor,
  onStatus: (message) => {
    setStatus(message);
    showActionToast(message);
  },
  onChange: handleEditorImageChange,
});

detailsToggleBtn.addEventListener("click", () => {
  if (!isSmallScreen()) {
    return;
  }

  setMobileDetailsCollapsed(!isMobileDetailsCollapsed);
});

window.addEventListener("resize", syncMobileDetailsState);

showFinderViewBtn.addEventListener("click", () => setActiveView("finder"));
showHistoryViewBtn.addEventListener("click", () => setActiveView("history"));
historyShowSingleBtn.addEventListener("click", () => {
  setHistorySectionMode("single");
});
historyShowGalleriesBtn.addEventListener("click", () => {
  setHistorySectionMode("gallery");
});
historyGalleryCloseBtn.addEventListener("click", closeHistoryGalleryInspector);
historyGalleryExportAllBtn.addEventListener(
  "click",
  exportAllHistoryGalleryImages,
);
historyHeaderTitleEditBtn.addEventListener("click", () => {
  startInlineHistoryHeaderEdit("title");
});
historyHeaderSubtitleEditBtn.addEventListener("click", () => {
  startInlineHistoryHeaderEdit("description");
});
historyGalleryCopyAllCaptionsBtn.addEventListener(
  "click",
  copyAllHistoryGalleryCaptions,
);
historyGalleryAddMoreBtn.addEventListener(
  "click",
  addMoreImagesToHistoryGallery,
);
historyGalleryPrefixExportCheckbox.addEventListener("change", () => {
  refreshActiveHistoryGalleryShortcode();
});
historyGalleryCaptionInput.addEventListener(
  "input",
  refreshActiveHistoryGalleryShortcode,
);
historyGalleryFillDefaultCaptionBtn.addEventListener(
  "click",
  fillActiveHistoryGalleryDefaultCaption,
);
historyGalleryLayoutSelect.addEventListener(
  "change",
  refreshActiveHistoryGalleryShortcode,
);
historyGalleryWidthInput.addEventListener(
  "input",
  refreshActiveHistoryGalleryShortcode,
);
historyGalleryCopyBtn.addEventListener(
  "click",
  copyActiveHistoryGalleryShortcode,
);
detailEditBtn.addEventListener("click", openFinderEditor);
historyGalleryEditBtn.addEventListener("click", openHistoryGalleryEditor);
document.addEventListener("keydown", handleHistoryGalleryReorderHotkeys);

openSettingsBtn.addEventListener("click", openSettingsPanel);
closeSettingsBtn.addEventListener("click", closeSettingsPanel);
settingsBackdrop.addEventListener("click", closeSettingsPanel);
saveSettingsBtn.addEventListener("click", () => {
  settings = {
    gridColumns: parseGridColumns(gridColumnsSelect.value),
    exportPathLabel: (exportPathInput.value || "").trim(),
    photoScanPages: parsePhotoScanPages(photoScanPagesSelect.value),
    galleryMode: parseGalleryMode(settings.galleryMode),
    splitMode: parseSplitMode(settings.splitMode),
    exportMaxWidth: parseExportMaxWidth(exportMaxWidthInput.value),
    exportTargetKb: parseExportTargetKb(exportTargetKbInput.value),
    exportFormat: parseExportFormat(exportFormatSelect.value),
  };
  gridColumnsSelect.value = String(settings.gridColumns);
  exportPathInput.value = settings.exportPathLabel;
  photoScanPagesSelect.value = String(settings.photoScanPages);
  galleryModeCheckbox.checked = parseGalleryMode(settings.galleryMode);
  splitModeCheckbox.checked = parseSplitMode(settings.splitMode);
  exportMaxWidthInput.value = String(settings.exportMaxWidth);
  exportTargetKbInput.value = String(settings.exportTargetKb);
  exportFormatSelect.value = settings.exportFormat;
  saveSettings();
  applyGridColumns();
  applyGalleryModeUI();
  applySplitModeUI();
  renderResults(currentResults, { append: false });
  updateExportDirectoryUI();
  setStatus("Settings saved.");
});

galleryModeCheckbox.addEventListener("change", () => {
  const enabled = Boolean(galleryModeCheckbox.checked);
  // Disable split mode if enabling gallery mode
  if (enabled && splitModeCheckbox.checked) {
    splitModeCheckbox.checked = false;
    settings = {
      ...settings,
      splitMode: false,
    };
  }
  settings = {
    ...settings,
    galleryMode: enabled,
  };
  saveSettings();
  applyGalleryModeUI();
  renderResults(currentResults, { append: false });
  setStatus(enabled ? "Gallery mode enabled." : "Gallery mode disabled.");
});

splitModeCheckbox.addEventListener("change", () => {
  const enabled = Boolean(splitModeCheckbox.checked);
  // Disable gallery mode if enabling split mode
  if (enabled && galleryModeCheckbox.checked) {
    galleryModeCheckbox.checked = false;
    settings = {
      ...settings,
      galleryMode: false,
    };
  }
  settings = {
    ...settings,
    splitMode: enabled,
  };
  saveSettings();
  applySplitModeUI();
  renderResults(currentResults, { append: false });
  setStatus(enabled ? "Split mode enabled." : "Split mode disabled.");
});

selectExportDirBtn.addEventListener("click", chooseExportDirectory);
clearExportDirBtn.addEventListener("click", clearExportDirectory);

splitLayoutSelect.addEventListener("change", () => {
  const splitCount = splitLayoutSelect.value === "3" ? 3 : 2;
  splitSelectionCount.textContent = String(splitCount);
  // Trim selected items if switching to a smaller layout
  if (selectedSplitItems.size > splitCount) {
    const itemsArray = [...selectedSplitItems.entries()];
    selectedSplitItems.clear();
    itemsArray.slice(0, splitCount).forEach(([id, item]) => {
      selectedSplitItems.set(id, item);
    });
    updateSplitSelectionList();
    renderResults(currentResults, { append: false });
  }
  updateSplitCombineButtonState();
  regenerateSplitOutputs();
});

splitOutputLayoutSelect.addEventListener("change", () => {
  updateSplitWidthVisibility();
  regenerateSplitOutputs();
});

function syncSplitPresetFromDimensions() {
  if (!splitCanvasPresetSelect || !SPLIT_CANVAS_PRESETS[splitCanvasPresetSelect.value]) {
    splitCanvasPresetSelect.value = "16-9";
  }
}

splitCanvasPresetSelect?.addEventListener("change", () => {
  syncSplitPresetFromDimensions();
  regenerateSplitOutputs();
});

splitCustomWidth.addEventListener("input", regenerateSplitOutputs);
splitCaptionInput.addEventListener("input", regenerateSplitOutputs);

splitCombineBtn.addEventListener("click", handleSplitCombine);
splitCopyShortcodeBtn.addEventListener("click", async () => {
  await copyToClipboard(splitShortcodeOutput.value, "Shortcode copied!");
});

syncSplitPresetFromDimensions();

galleryTitleInput.addEventListener("input", scheduleGalleryAutoSave);
galleryDescriptionInput.addEventListener("input", scheduleGalleryAutoSave);
galleryDoneBtn.addEventListener("click", () => {
  if (openSavedGalleryFromDoneButton()) {
    return;
  }

  finishCurrentGallery();
});

searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = searchInput.value.trim();

  if (!query) {
    setStatus("Enter a search term.");
    return;
  }

  setStatus("Searching Wikimedia Commons...");
  currentQuery = query;
  clearResults();
  hideDetails();

  try {
    await runSearch({ append: false });
  } catch (error) {
    if (isAbortError(error)) {
      return;
    }
    console.error(error);
    setStatus("Search failed. Please try again.");
  }
});

showMoreBtn.addEventListener("click", async () => {
  if (
    loadingMore ||
    !nextContinue ||
    !currentQuery ||
    isPhotoDateSortMode(getActiveSortMode())
  ) {
    return;
  }

  loadingMore = true;
  updateShowMoreVisibility();
  setStatus("Loading more results...");

  try {
    await runSearch({ append: true });
  } catch (error) {
    if (isAbortError(error)) {
      return;
    }
    console.error(error);
    setStatus("Could not load more results. Please try again.");
  } finally {
    loadingMore = false;
    updateShowMoreVisibility();
  }
});

scanMorePhotoBtn.addEventListener("click", async () => {
  if (loadingMore || scanningPhotoDate || !nextContinue || !currentQuery) {
    return;
  }

  if (!isPhotoDateSortMode(getActiveSortMode())) {
    return;
  }

  setStatus("Scanning more photo-date metadata...");
  try {
    await runSearch({ append: true });
  } catch (error) {
    if (isAbortError(error)) {
      return;
    }
    console.error(error);
    setStatus("Could not scan more results. Please try again.");
  }
});

layoutSelect.addEventListener("change", () => {
  updateWidthVisibility();
  regenerateOutputs();
});

customWidth.addEventListener("input", regenerateOutputs);
captionInput.addEventListener("input", regenerateOutputs);
fillDefaultCaptionBtn.addEventListener("click", fillFinderDefaultCaption);

resultsEl.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const itemEl = target.closest(".result-item");
  if (!itemEl) {
    return;
  }

  const pageId = Number.parseInt(itemEl.dataset.pageId || "", 10);
  if (!Number.isInteger(pageId)) {
    return;
  }

  if (isGalleryMode()) {
    if (
      target instanceof HTMLInputElement &&
      target.classList.contains("result-select")
    ) {
      toggleGallerySelection(pageId, {
        additive: true,
        forceChecked: target.checked,
      });
      event.stopPropagation();
      return;
    }

    toggleGallerySelection(pageId, {
      additive: true,
      forceChecked: null,
    });
    return;
  }

  if (isSplitMode()) {
    if (
      target instanceof HTMLInputElement &&
      target.classList.contains("result-select")
    ) {
      toggleSplitSelection(pageId, {
        additive: true,
        forceChecked: target.checked,
      });
      event.stopPropagation();
      return;
    }

    toggleSplitSelection(pageId, {
      additive: true,
      forceChecked: null,
    });
    return;
  }

  selectImage(pageId);
});

resultsEl.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const itemEl = target.closest(".result-item");
  if (!itemEl) {
    return;
  }

  const pageId = Number.parseInt(itemEl.dataset.pageId || "", 10);
  if (!Number.isInteger(pageId)) {
    return;
  }

  event.preventDefault();
  if (isGalleryMode()) {
    toggleGallerySelection(pageId, {
      additive: true,
      forceChecked: null,
    });
    return;
  }

  selectImage(pageId);
});

sortSelect.addEventListener("change", () => {
  if (!currentQuery) {
    return;
  }

  clearResults();
  hideDetails();
  setStatus("Applying filters...");

  runSearch({ append: false }).catch((error) => {
    if (isAbortError(error)) {
      return;
    }
    console.error(error);
    setStatus("Could not apply filters. Please try again.");
  });
});

assessmentSelect.addEventListener("change", () => {
  if (!currentQuery) {
    return;
  }

  clearResults();
  hideDetails();
  setStatus("Applying filters...");

  runSearch({ append: false }).catch((error) => {
    if (isAbortError(error)) {
      return;
    }
    console.error(error);
    setStatus("Could not apply filters. Please try again.");
  });
});

photoDateSortSelect.addEventListener("change", () => {
  if (!currentQuery) {
    updateShowMoreVisibility();
    return;
  }

  clearResults();
  hideDetails();
  setStatus("Applying experimental photo-date filter...");

  runSearch({ append: false }).catch((error) => {
    if (isAbortError(error)) {
      return;
    }
    console.error(error);
    setStatus("Could not apply experimental filter. Please try again.");
  });
});

copyShortcodeBtn.addEventListener("click", async () => {
  const copied = await copyToClipboard(shortcodeOutput.value, "Copied.");
  if (!copied || !selectedImage) {
    return;
  }

  saveToHistory({
    pageId: selectedImage.pageId,
    title: selectedImage.title,
    thumbnailUrl: selectedImage.thumbnailUrl,
    imageUrl: selectedImage.imageUrl,
    fileName: getImageFileName(selectedImage),
    copiedText: shortcodeOutput.value,
    layout: layoutSelect.value,
  });
});

downloadImageBtn.addEventListener("click", async () => {
  if (!selectedImage || downloadingImage) {
    return;
  }

  downloadingImage = true;
  updateDownloadButtonState();
  setStatus("Preparing optimized image download...");
  setProgressOverlay(detailProgressOverlay, "Preparing download…");
  const reportDownloadProgress = createThrottledProgressUpdater({
    overlayEl: detailProgressOverlay,
  });

  try {
    const finderEditKey = buildImageEditKey(selectedImage, "finder");
    const finderEditState = getImageEditState(finderEditKey);
    const fileName =
      finderEditState?.fileName || getImageFileName(selectedImage);
    let blob;
    let width;

    if (finderEditState?.previewUrl) {
      const fastPathMessage = "Downloading edited image…";
      setStatus(fastPathMessage);
      setProgressOverlay(detailProgressOverlay, fastPathMessage);
      const editedResponse = await fetch(finderEditState.previewUrl);
      if (!editedResponse.ok) {
        throw new Error(
          `Edited image fetch failed with status ${editedResponse.status}`,
        );
      }
      blob = await editedResponse.blob();
      width = "edited";
    } else {
      const optimized = await optimizeImageForDownload(selectedImage.imageUrl, {
        onProgress: (message) => {
          reportDownloadProgress(message);
        },
      });
      blob = optimized.blob;
      width = optimized.width;
    }

    const savedToFolder = await exportBlob(blob, fileName);
    const kb = Math.round(blob.size / 1024);
    saveToHistory({
      pageId: selectedImage.pageId,
      title: selectedImage.title,
      thumbnailUrl: selectedImage.thumbnailUrl,
      imageUrl: selectedImage.imageUrl,
      fileName,
      copiedText: shortcodeOutput.value || "",
      layout: layoutSelect.value,
      downloaded: true,
    });
    const message = savedToFolder
      ? `Saved ${fileName} to ${exportDirectoryName} (${width === "edited" ? "edited" : `${width}px`}, ${kb}KB).`
      : `Downloaded ${fileName} (${width === "edited" ? "edited" : `${width}px`}, ${kb}KB).`;
    showActionToast(message);
    setStatus(message);
  } catch (error) {
    console.error(error);
    setStatus("Download failed. Try another image.");
  } finally {
    clearProgressOverlay(detailProgressOverlay);
    downloadingImage = false;
    updateDownloadButtonState();
  }
});

function buildSearchUrl(query, continueData = null) {
  const apiSort = mapSortModeToApiSort(sortSelect.value);
  const searchQuery = buildSearchQuery(query, assessmentSelect.value);

  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    generator: "search",
    gsrsearch: searchQuery,
    gsrlimit: String(SEARCH_LIMIT),
    gsrnamespace: "6",
    gsrinfo: "totalhits",
    prop: "imageinfo|info",
    iiprop: "url|extmetadata|size|timestamp",
    iiextmetadatafilter:
      "Artist|LicenseShortName|LicenseUrl|ImageDescription|Credit|Date|DateTime|DateTimeOriginal|DateTimeDigitized",
    inprop: "url",
    iiurlwidth: String(PREVIEW_THUMB_WIDTH),
  });

  if (apiSort) {
    params.set("gsrsort", apiSort);
  }

  if (continueData && typeof continueData === "object") {
    Object.entries(continueData).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.set(key, String(value));
      }
    });
  }

  return `${API_BASE}?${params.toString()}`;
}

function buildSearchQuery(query, assessmentMode) {
  const baseQuery = `${query} filetype:bitmap|drawing`;

  if (assessmentMode === "quality") {
    return `${baseQuery} incategory:"Quality images"`;
  }

  if (assessmentMode === "featured") {
    return `${baseQuery} incategory:"Featured pictures on Wikimedia Commons"`;
  }

  if (assessmentMode === "valued") {
    return `${baseQuery} incategory:"Valued images"`;
  }

  return baseQuery;
}

function isAbortError(error) {
  if (!error) {
    return false;
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }

  return error?.name === "AbortError";
}

async function runSearch({ append }) {
  const requestId = activeSearchRequestId + 1;
  activeSearchRequestId = requestId;
  if (activeSearchAbortController) {
    activeSearchAbortController.abort();
  }
  const abortController = new AbortController();
  activeSearchAbortController = abortController;

  const activeSortMode = getActiveSortMode();
  try {
    if (isPhotoDateSortMode(activeSortMode)) {
      await runPhotoDateScanSearch({
        append,
        signal: abortController.signal,
        requestId,
      });
      return;
    }

    const batch = await fetchSearchBatch(append ? nextContinue : null, {
      signal: abortController.signal,
    });
    if (abortController.signal.aborted || requestId !== activeSearchRequestId) {
      throw new DOMException("Search request superseded", "AbortError");
    }

    const parsedResults = batch.results;
    if (Number.isFinite(batch.totalHits)) {
      currentTotalAvailable = batch.totalHits;
    }

    if (!append) {
      currentResults = parsedResults;
      currentResults = sortResultsBySelectedMode(
        currentResults,
        activeSortMode,
      );
      renderResults(currentResults, { append: false });

      if (!currentResults.length) {
        setStatus("No image results found. Try another term.");
        nextContinue = null;
        currentTotalAvailable = 0;
        updateShowMoreVisibility();
        return;
      }
    } else {
      const existingIds = new Set(currentResults.map((item) => item.pageId));
      const uniqueNewResults = parsedResults.filter(
        (item) => !existingIds.has(item.pageId),
      );
      currentResults = [...currentResults, ...uniqueNewResults];
      currentResults = sortResultsBySelectedMode(
        currentResults,
        activeSortMode,
      );
      renderResults(currentResults, { append: false });
    }

    nextContinue = batch.continueData;

    updateShowMoreVisibility();
    setSearchStatus();
  } finally {
    if (activeSearchAbortController === abortController) {
      activeSearchAbortController = null;
    }
  }
}

async function runPhotoDateScanSearch({ append, signal, requestId }) {
  setPhotoDateScanningState(true);

  const baseResults = append ? [...currentResults] : [];
  const seenIds = new Set(baseResults.map((item) => item.pageId));
  let continueData = append ? nextContinue : null;
  let collected = [];
  let pagesFetched = 0;

  try {
    const scanPages = parsePhotoScanPages(settings.photoScanPages);

    while (pagesFetched < scanPages) {
      const batch = await fetchSearchBatch(continueData, { signal });
      if (signal?.aborted || requestId !== activeSearchRequestId) {
        throw new DOMException("Search request superseded", "AbortError");
      }

      if (Number.isFinite(batch.totalHits)) {
        currentTotalAvailable = batch.totalHits;
      }

      batch.results.forEach((item) => {
        if (!seenIds.has(item.pageId)) {
          seenIds.add(item.pageId);
          collected.push(item);
        }
      });

      pagesFetched += 1;
      continueData = batch.continueData;
      setStatus(
        `Scanning photo dates… page ${pagesFetched}/${scanPages} (${collected.length} new candidates found).`,
      );

      if (!continueData) {
        break;
      }
    }

    if (signal?.aborted || requestId !== activeSearchRequestId) {
      throw new DOMException("Search request superseded", "AbortError");
    }

    currentResults = [...baseResults, ...collected];
    currentResults = sortResultsBySelectedMode(
      currentResults,
      getActiveSortMode(),
    );
    renderResults(currentResults, { append: false });

    nextContinue = continueData;
    updateShowMoreVisibility();
    setSearchStatus();
  } finally {
    setPhotoDateScanningState(false);
  }
}

async function fetchSearchBatch(continueData, options = {}) {
  const response = await fetch(buildSearchUrl(currentQuery, continueData), {
    signal: options?.signal,
  });
  if (!response.ok) {
    throw new Error(
      `Wikimedia API request failed with status ${response.status}`,
    );
  }

  const data = await response.json();
  const pagesRaw = data?.query?.pages;
  const pages = Array.isArray(pagesRaw)
    ? pagesRaw
    : pagesRaw && typeof pagesRaw === "object"
      ? Object.values(pagesRaw)
      : [];

  const results = pages
    .map(mapPageToImageResult)
    .filter((item) => item.imageUrl && item.thumbnailUrl);

  const totalHitsRaw = data?.query?.searchinfo?.totalhits;
  const totalHits = Number.parseInt(totalHitsRaw, 10);

  return {
    results,
    totalHits,
    continueData:
      data?.continue && typeof data.continue === "object"
        ? data.continue
        : null,
  };
}

function mapPageToImageResult(page) {
  const imageInfo = page.imageinfo?.[0] ?? {};
  const metadata = imageInfo.extmetadata ?? {};
  const photoDateRaw =
    metadata.DateTimeOriginal?.value ||
    metadata.DateTime?.value ||
    metadata.DateTimeDigitized?.value ||
    metadata.Date?.value ||
    "";
  const photoTimestamp = parseCommonsMetadataDate(photoDateRaw);

  return {
    pageId: page.pageid,
    title: cleanFileTitle(page.title),
    pageUrl: page.fullurl || "",
    imageUrl: imageInfo.url || "",
    thumbnailUrl: imageInfo.thumburl || imageInfo.url || "",
    description:
      stripHtml(metadata.ImageDescription?.value) ||
      "No description available.",
    author: stripHtml(metadata.Artist?.value) || "Unknown",
    licenseShort: stripHtml(metadata.LicenseShortName?.value) || "Unknown",
    licenseUrl: metadata.LicenseUrl?.value || "",
    credit: stripHtml(metadata.Credit?.value) || "",
    uploadedAt: imageInfo.timestamp || "",
    photoDate: stripHtml(photoDateRaw),
    photoTimestamp,
  };
}

function sortResultsBySelectedMode(items, mode) {
  if (mode === "photo-newest" || mode === "photo-oldest") {
    return sortResultsByPhotoDate(items, mode);
  }

  return [...items];
}

function isPhotoDateSortMode(mode) {
  return mode === "photo-newest" || mode === "photo-oldest";
}

function sortResultsByPhotoDate(items, mode) {
  const direction = mode === "photo-oldest" ? 1 : -1;

  return [...items].sort((a, b) => {
    const aTime = a.photoTimestamp;
    const bTime = b.photoTimestamp;
    const aValid = Number.isFinite(aTime);
    const bValid = Number.isFinite(bTime);

    if (!aValid && !bValid) {
      return 0;
    }
    if (!aValid) {
      return 1;
    }
    if (!bValid) {
      return -1;
    }

    return direction * (aTime - bTime);
  });
}

function mapSortModeToApiSort(mode) {
  if (mode === "newest") {
    return "create_timestamp_desc";
  }
  if (mode === "oldest") {
    return "create_timestamp_asc";
  }
  return "";
}

function getActiveSortMode() {
  const photoMode = photoDateSortSelect.value;
  if (isPhotoDateSortMode(photoMode)) {
    return photoMode;
  }
  return sortSelect.value;
}

function sortLabel(mode) {
  if (mode === "newest") {
    return "newest first";
  }
  if (mode === "oldest") {
    return "oldest first";
  }
  if (mode === "photo-newest") {
    return "photo date newest first (experimental)";
  }
  if (mode === "photo-oldest") {
    return "photo date oldest first (experimental)";
  }
  return "default order";
}

function assessmentLabel(mode) {
  if (mode === "quality") {
    return "quality images (community)";
  }
  if (mode === "featured") {
    return "featured pictures (community)";
  }
  if (mode === "valued") {
    return "valued images (community)";
  }
  return "all assessments";
}

function getSearchModeLabel() {
  const labels = [sortLabel(getActiveSortMode())];
  const assessmentMode = assessmentSelect.value;

  if (assessmentMode && assessmentMode !== "off") {
    labels.push(assessmentLabel(assessmentMode));
  }

  return labels.join(", ");
}

function setSearchStatus() {
  const activeMode = getActiveSortMode();
  const modeLabel = getSearchModeLabel();
  const usingPhotoMode = isPhotoDateSortMode(activeMode);
  const totalText = Number.isFinite(currentTotalAvailable)
    ? `${currentTotalAvailable}`
    : "unknown";

  if (nextContinue) {
    setStatus(
      usingPhotoMode
        ? `Scanned ${currentResults.length} of ${totalText} total (${modeLabel}). Use “Scan more” for additional pages.`
        : `Showing ${currentResults.length} of ${totalText} total (${modeLabel}). More are available.`,
    );
    return;
  }

  setStatus(
    usingPhotoMode
      ? `Scanned ${currentResults.length} of ${totalText} total (${modeLabel}). End of results for this query.`
      : `Showing ${currentResults.length} of ${totalText} total (${modeLabel}). End of results for this query.`,
  );
}

function renderResults(items, options = {}) {
  const { append = false } = options;
  const galleryMode = isGalleryMode();
  const splitMode = isSplitMode();
  const fragment = document.createDocumentFragment();

  if (!append) {
    resultsEl.innerHTML = "";
  }

  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "result-item";
    li.tabIndex = 0;
    li.dataset.pageId = String(item.pageId || "");

    if (galleryMode) {
      li.innerHTML = `
        <div class="result-head">
          <input class="result-select" type="checkbox" ${selectedGalleryItems.has(item.pageId) ? "checked" : ""} />
        </div>
        <img src="${escapeAttribute(item.thumbnailUrl)}" alt="${escapeAttribute(item.title)}" loading="lazy" decoding="async" fetchpriority="low" />
        <div class="result-text">
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.licenseShort)}</p>
        </div>
      `;
      li.classList.toggle("active", selectedGalleryItems.has(item.pageId));
    } else if (splitMode) {
      li.innerHTML = `
        <div class="result-head">
          <input class="result-select" type="checkbox" ${selectedSplitItems.has(item.pageId) ? "checked" : ""} />
        </div>
        <img src="${escapeAttribute(item.thumbnailUrl)}" alt="${escapeAttribute(item.title)}" loading="lazy" decoding="async" fetchpriority="low" />
        <div class="result-text">
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.licenseShort)}</p>
        </div>
      `;
      li.classList.toggle("active", selectedSplitItems.has(item.pageId));
    } else {
      li.innerHTML = `
        <img src="${escapeAttribute(item.thumbnailUrl)}" alt="${escapeAttribute(item.title)}" loading="lazy" decoding="async" fetchpriority="low" />
        <div class="result-text">
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.licenseShort)}</p>
        </div>
      `;
    }

    fragment.appendChild(li);
  });

  resultsEl.appendChild(fragment);
}

function selectImage(pageId) {
  if (isGalleryMode()) {
    toggleGallerySelection(pageId, { additive: true });
    return;
  }

  if (isSplitMode()) {
    toggleSplitSelection(pageId, { additive: true });
    return;
  }

  selectedImage = currentResults.find((item) => item.pageId === pageId) || null;
  if (!selectedImage) return;

  [...resultsEl.children].forEach((node, index) => {
    node.classList.toggle("active", currentResults[index]?.pageId === pageId);
  });

  detailPreview.src = getDisplayImageUrl(selectedImage, "finder");
  detailTitle.textContent = selectedImage.title;
  detailAuthor.textContent = selectedImage.author;
  detailLicense.textContent = selectedImage.licenseShort;
  detailDescription.textContent = selectedImage.description;

  detailImageUrl.href =
    selectedImage.imageUrl || selectedImage.thumbnailUrl || "";
  detailImageUrl.textContent =
    selectedImage.imageUrl || selectedImage.thumbnailUrl || "";

  detailFilePage.href = selectedImage.pageUrl;
  detailFilePage.textContent = selectedImage.pageUrl;

  const selectedFinderKey = buildImageEditKey(selectedImage, "finder");
  ensurePreviewForImage(
    selectedImage,
    "finder",
    (previewUrl) => {
      if (!selectedImage) {
        return;
      }

      if (buildImageEditKey(selectedImage, "finder") !== selectedFinderKey) {
        return;
      }

      detailPreview.src = previewUrl;
      detailImageUrl.href =
        selectedImage.imageUrl || selectedImage.thumbnailUrl || "";
      detailImageUrl.textContent =
        selectedImage.imageUrl || selectedImage.thumbnailUrl || "";
    },
    { allowForegroundRebuild: true },
  );

  showDetails();
  if (isSmallScreen()) {
    setMobileDetailsCollapsed(false);
  }
  regenerateOutputs();
  updateDownloadButtonState();
}

function regenerateOutputs() {
  if (!selectedImage) {
    shortcodeOutput.value = "";
    return;
  }

  const caption = buildCaption(captionInput.value, selectedImage);

  shortcodeOutput.value = buildShortcode(selectedImage.imageUrl, caption);
}

function buildCaption(rawCaption, image) {
  const baseCaption = (rawCaption || "").trim().replace(/[.\s]+$/, "");
  const author = normalizeAuthor(image.author || "");
  const hasKnownAuthor = Boolean(author);
  const license =
    image.licenseShort && image.licenseShort !== "Unknown"
      ? image.licenseShort.trim()
      : "Unknown license";

  const suffix = hasKnownAuthor
    ? `Photo by ${author} © ${license}`
    : `© ${license}`;

  return baseCaption ? `${baseCaption}. ${suffix}` : suffix;
}

function getDefaultCaptionText(image) {
  const description = (image?.description || "").trim();
  if (!description || description === "No description available.") {
    return "";
  }

  return description.replace(/[.\s]+$/, "");
}

function fillFinderDefaultCaption() {
  if (!selectedImage) {
    setStatus("Select an image first.");
    return;
  }

  const defaultCaption = getDefaultCaptionText(selectedImage);
  if (!defaultCaption) {
    setStatus("No default caption available for this image.");
    return;
  }

  captionInput.value = defaultCaption;
  regenerateOutputs();
  setStatus("Default caption inserted.");
}

function buildShortcode(imageUrl, caption) {
  return buildShortcodeForImage(selectedImage, {
    layout: layoutSelect.value,
    customWidth: customWidth.value,
    caption,
  });
}

function buildShortcodeForImage(image, options = {}) {
  if (!image) {
    return "";
  }

  const layout = options.layout || "normal";
  const caption = typeof options.caption === "string" ? options.caption : "";
  const widthValue = Number.parseInt(options.customWidth, 10);
  const safeWidth =
    Number.isFinite(widthValue) && widthValue > 0 ? widthValue : 600;
  const relativePath =
    typeof options.relativePath === "string" && options.relativePath.trim()
      ? options.relativePath.trim()
      : getImageRelativePath(image);
  const localImagePath = `/images/${relativePath}`;
  const escapedUrl = escapeShortcodeValue(localImagePath);
  const escapedCaption = escapeShortcodeValue(caption);

  switch (layout) {
    case "large":
      return `{{< photo-large src="${escapedUrl}" caption="${escapedCaption}" >}}`;
    case "xlarge":
      return `{{< photo-xlarge src="${escapedUrl}" caption="${escapedCaption}" >}}`;
    case "custom": {
      return `{{< photo-custom src="${escapedUrl}" width="${safeWidth}" caption="${escapedCaption}" >}}`;
    }
    case "cover": {
      const escapedPath = escapeShortcodeValue(relativePath);
      return `image: "/images/${escapedPath}"\nimageCaption: "${escapedCaption}"`;
    }
    default:
      return `{{< photo-normal src="${escapedUrl}" caption="${escapedCaption}" >}}`;
  }
}

function updateWidthVisibility() {
  widthRow.classList.toggle("hidden", layoutSelect.value !== "custom");
}

function clearResults() {
  currentResults = [];
  resultsEl.innerHTML = "";
  nextContinue = null;
  currentTotalAvailable = null;
  updateShowMoreVisibility();
}

function hideDetails() {
  selectedImage = null;
  detailsEl.classList.add("hidden");
  captionInput.value = "";
  shortcodeOutput.value = "";
  if (isGalleryMode()) {
    emptyState.classList.add("hidden");
    splitDetails.classList.add("hidden");
    galleryDetails.classList.remove("hidden");
    updateGallerySelectionList();
  } else if (isSplitMode()) {
    emptyState.classList.add("hidden");
    galleryDetails.classList.add("hidden");
    splitDetails.classList.remove("hidden");
    updateSplitSelectionList();
  } else {
    galleryDetails.classList.add("hidden");
    splitDetails.classList.add("hidden");
    emptyState.classList.remove("hidden");
  }
  updateDownloadButtonState();
}

function showDetails() {
  if (isGalleryMode()) {
    emptyState.classList.add("hidden");
    detailsEl.classList.add("hidden");
    splitDetails.classList.add("hidden");
    galleryDetails.classList.remove("hidden");
    updateGallerySelectionList();
    return;
  }

  if (isSplitMode()) {
    emptyState.classList.add("hidden");
    detailsEl.classList.add("hidden");
    galleryDetails.classList.add("hidden");
    splitDetails.classList.remove("hidden");
    updateSplitSelectionList();
    return;
  }

  galleryDetails.classList.add("hidden");
  splitDetails.classList.add("hidden");
  emptyState.classList.add("hidden");
  detailsEl.classList.remove("hidden");
}

function buildImageEditKey(image, context = "finder") {
  const contextPrefix = context || "finder";
  if (Number.isInteger(image?.pageId)) {
    return `${contextPrefix}:page:${image.pageId}`;
  }

  if (typeof image?.imageUrl === "string" && image.imageUrl.trim()) {
    return `${contextPrefix}:url:${image.imageUrl.trim()}`;
  }

  const fallback =
    image?.fileName || image?.title || image?.thumbnailUrl || "unknown-image";
  return `${contextPrefix}:fallback:${fallback}`;
}

function getFinderUrlEditAliasKey(editKey, imageUrl) {
  if (
    typeof editKey !== "string" ||
    !editKey.startsWith("finder:page:") ||
    typeof imageUrl !== "string" ||
    !imageUrl.trim()
  ) {
    return "";
  }

  const aliasKey = buildImageEditKey({ imageUrl }, "finder");
  return aliasKey !== editKey ? aliasKey : "";
}

function getImageEditState(key) {
  if (!key) {
    return null;
  }

  const inMemory = imageEditState.get(key) || null;
  if (inMemory) {
    return inMemory;
  }

  const persisted = persistedImageEdits[key];
  if (
    !persisted ||
    (!Array.isArray(persisted.history) && !Array.isArray(persisted.operations))
  ) {
    return null;
  }

  const operations = normalizeEditOperations(
    Array.isArray(persisted.operations)
      ? persisted.operations
      : Array.isArray(persisted.history)
        ? persisted.history.map((step) => ({ type: "crop", ...step }))
        : [],
  );

  const hydrated = {
    previewUrl: "",
    fileName: persisted.fileName || "",
    history: Array.isArray(persisted.history) ? persisted.history : [],
    operations,
    previewOptimized: persisted.previewOptimized !== false,
    previewCacheChecked: false,
  };
  imageEditState.set(key, hydrated);
  return hydrated;
}

function isObjectUrl(url) {
  return typeof url === "string" && url.startsWith("blob:");
}

function getDisplayImageUrl(image, context = "finder") {
  const key = buildImageEditKey(image, context);
  const edit = getImageEditState(key);
  if (edit?.previewUrl) {
    return edit.previewUrl;
  }

  return image?.thumbnailUrl || image?.imageUrl || "";
}

function buildSplitCacheImageUrl(editKey) {
  if (typeof editKey !== "string" || !editKey.trim()) {
    return "";
  }

  return `${SPLIT_CACHE_URL_PREFIX}${editKey.trim()}`;
}

function parseSplitCacheImageUrl(url) {
  if (typeof url !== "string" || !url.startsWith(SPLIT_CACHE_URL_PREFIX)) {
    return "";
  }

  const key = url.slice(SPLIT_CACHE_URL_PREFIX.length).trim();
  return key || "";
}

async function resolvePersistedImageUrl(url) {
  if (typeof url !== "string" || !url.trim()) {
    return "";
  }

  const cacheKey = parseSplitCacheImageUrl(url);
  if (!cacheKey) {
    return url;
  }

  const cachedBlob = await loadPreviewBlobFromCache(cacheKey);
  if (!(cachedBlob instanceof Blob)) {
    return "";
  }

  return cachePreviewObjectUrl(cacheKey, cachedBlob);
}

function normalizeOperationsFromEdit(edit) {
  if (!edit) {
    return [];
  }

  if (Array.isArray(edit.operations) && edit.operations.length > 0) {
    return normalizeEditOperations(edit.operations);
  }

  if (Array.isArray(edit.history) && edit.history.length > 0) {
    return normalizeEditOperations(
      edit.history.map((step) => ({ type: "crop", ...step })),
    );
  }

  return [];
}

function hasCutoutOperation(operations) {
  return Array.isArray(operations)
    ? operations.some((step) => step?.type === "cutout")
    : false;
}

function hasCropOperation(operations) {
  return Array.isArray(operations)
    ? operations.some((step) => step?.type === "crop")
    : false;
}

async function buildPreviewUrlFromHistory(imageUrl, historyOrOperations) {
  return buildEditedPreviewUrlFromImageUrl(
    imageUrl,
    normalizeEditOperations(historyOrOperations),
  );
}

function getFinderAlternateEditKey(image, currentKey) {
  if (typeof currentKey !== "string" || !currentKey.startsWith("finder:")) {
    return "";
  }

  const pageKey = Number.isInteger(image?.pageId)
    ? buildImageEditKey({ pageId: image.pageId }, "finder")
    : "";
  const imageUrl =
    typeof image?.imageUrl === "string" && image.imageUrl.trim()
      ? image.imageUrl.trim()
      : "";
  const urlKey = imageUrl ? buildImageEditKey({ imageUrl }, "finder") : "";

  if (currentKey === pageKey) {
    return urlKey;
  }

  if (currentKey === urlKey) {
    return pageKey;
  }

  return pageKey || urlKey || "";
}

function ensurePreviewForImage(image, context, onReady, options = {}) {
  const allowForegroundRebuild = options?.allowForegroundRebuild === true;
  const key = buildImageEditKey(image, context);
  const edit = getImageEditState(key);
  const operations = normalizeOperationsFromEdit(edit);
  const includesCutout = hasCutoutOperation(operations);
  const includesCrop = hasCropOperation(operations);

  if (!key || !edit || !operations.length) {
    return;
  }

  if (
    !edit.previewUrl &&
    !edit.previewCacheChecked &&
    !edit.previewCachePromise
  ) {
    edit.previewCachePromise = loadPreviewBlobFromCache(key)
      .then((cachedBlob) => {
        if (!(cachedBlob instanceof Blob)) {
          return "";
        }

        const nextUrl = cachePreviewObjectUrl(key, cachedBlob);
        edit.previewUrl = nextUrl;
        return nextUrl;
      })
      .catch(() => "")
      .finally(() => {
        edit.previewCacheChecked = true;
        delete edit.previewCachePromise;
      });
  }

  if (edit.previewUrl) {
    if (typeof onReady === "function") {
      onReady(edit.previewUrl);
    }
    return;
  }

  if (edit.previewCachePromise) {
    if (typeof onReady === "function") {
      edit.previewCachePromise.then((url) => {
        if (url) {
          onReady(url);
        }
      });
    }
    return;
  }

  if (edit.previewPromise) {
    if (typeof onReady === "function") {
      edit.previewPromise.then((url) => {
        if (url) {
          onReady(url);
        }
      });
    }
    return;
  }

  if (!allowForegroundRebuild) {
    return;
  }

  if (includesCutout && !edit.previewUrl && !edit.previewCacheChecked) {
    return;
  }

  const sourceUrl =
    includesCrop || includesCutout
      ? image?.imageUrl || image?.thumbnailUrl || ""
      : image?.thumbnailUrl || image?.imageUrl || "";
  if (!sourceUrl) {
    return;
  }

  edit.previewPromise = enqueuePreviewBuild(() =>
    buildPreviewUrlFromHistory(sourceUrl, operations),
  )
    .then((url) => {
      const previousPreviewUrl = edit.previewUrl;
      edit.previewUrl = url;

      if (isObjectUrl(previousPreviewUrl) && previousPreviewUrl !== url) {
        URL.revokeObjectURL(previousPreviewUrl);
      }

      void fetch(url)
        .then((response) => response.blob())
        .then((blob) => savePreviewBlobToCache(key, blob))
        .catch(() => {});

      if (typeof onReady === "function") {
        onReady(url);
      }
      return url;
    })
    .catch((error) => {
      console.error(error);
      return "";
    })
    .finally(() => {
      delete edit.previewPromise;
    });
}

async function resolveDownloadSourceUrlForImage(image, context = "finder") {
  const key = buildImageEditKey(image, context);
  let edit = getImageEditState(key);
  let operations = normalizeOperationsFromEdit(edit);

  if ((!edit || !operations.length) && context === "finder") {
    const alternateKey = getFinderAlternateEditKey(image, key);
    if (alternateKey) {
      const alternateEdit = getImageEditState(alternateKey);
      const alternateOperations = normalizeOperationsFromEdit(alternateEdit);
      if (alternateEdit && alternateOperations.length > 0) {
        edit = alternateEdit;
        operations = alternateOperations;
      }
    }
  }

  if (
    typeof edit?.previewUrl === "string" &&
    edit.previewUrl &&
    !edit.previewOptimized
  ) {
    return {
      sourceUrl: edit.previewUrl,
      isEdited: true,
    };
  }

  if (!edit || !operations.length) {
    const persistedSourceUrl = await resolvePersistedImageUrl(
      image?.imageUrl || image?.thumbnailUrl || "",
    );
    return {
      sourceUrl: persistedSourceUrl,
      isEdited: false,
    };
  }

  const sourceUrl = await resolvePersistedImageUrl(
    image?.imageUrl || image?.thumbnailUrl || "",
  );
  if (!sourceUrl) {
    return {
      sourceUrl: "",
      isEdited: false,
    };
  }

  try {
    const previewUrl = await buildPreviewUrlFromHistory(sourceUrl, operations);
    edit.previewUrl = previewUrl;
    return {
      sourceUrl: previewUrl,
      isEdited: true,
    };
  } catch (error) {
    console.error(error);
    return {
      sourceUrl,
      isEdited: false,
    };
  }
}

function applyEditedPreviewToCurrentUi({ key, previewUrl, originalImageUrl }) {
  if (!key) {
    return;
  }

  const finderKey = selectedImage
    ? buildImageEditKey(selectedImage, "finder")
    : "";
  if (finderKey && finderKey === key) {
    const nextUrl =
      previewUrl ||
      selectedImage.thumbnailUrl ||
      originalImageUrl ||
      selectedImage.imageUrl;
    detailPreview.src = nextUrl;
    const sourceUrl =
      selectedImage.imageUrl ||
      selectedImage.thumbnailUrl ||
      originalImageUrl ||
      "";
    detailImageUrl.href = sourceUrl;
    detailImageUrl.textContent = sourceUrl;
  }

  const galleryContext = getActiveHistoryGalleryContext();
  if (galleryContext?.item) {
    const galleryKey = buildImageEditKey(
      galleryContext.item,
      `gallery:${galleryContext.entry.id}`,
    );
    if (galleryKey === key) {
      historyGalleryPreview.src =
        previewUrl || originalImageUrl || galleryContext.item.imageUrl || "";
    }
  }

  if (activeViewName === "history") {
    const singleCards = historySingleList.querySelectorAll(
      ".history-item[data-single-edit-key]",
    );
    singleCards.forEach((card) => {
      if (card.dataset.singleEditKey !== key) {
        return;
      }

      const previewImage = card.querySelector("img");
      if (previewImage) {
        previewImage.src = previewUrl || originalImageUrl || previewImage.src;
      }
    });
  }
}

function handleEditorImageChange(payload) {
  const key = payload?.editKey;
  if (!key) {
    return;
  }

  const aliasKey = getFinderUrlEditAliasKey(key, payload?.originalImageUrl);

  const previousState = getImageEditState(key);
  if (
    isObjectUrl(previousState?.previewUrl) &&
    previousState.previewUrl !== payload.previewUrl
  ) {
    URL.revokeObjectURL(previousState.previewUrl);
  }

  const nextHistory = Array.isArray(payload.history) ? payload.history : [];
  const nextOperations = Array.isArray(payload.operations)
    ? payload.operations
    : nextHistory.map((step) => ({ type: "crop", ...step }));

  if (!payload.previewUrl) {
    imageEditState.delete(key);
    void deletePreviewBlobFromCache(key);
    delete persistedImageEdits[key];

    if (aliasKey) {
      imageEditState.delete(aliasKey);
      void deletePreviewBlobFromCache(aliasKey);
      delete persistedImageEdits[aliasKey];
    }

    saveImageEdits();
    applyEditedPreviewToCurrentUi({
      key,
      previewUrl: "",
      originalImageUrl: payload.originalImageUrl || "",
    });
    if (aliasKey) {
      applyEditedPreviewToCurrentUi({
        key: aliasKey,
        previewUrl: "",
        originalImageUrl: payload.originalImageUrl || "",
      });
    }
    return;
  }

  const nextState = {
    previewUrl: payload.previewUrl,
    fileName: payload.fileName,
    history: nextHistory,
    operations: nextOperations,
    previewOptimized: payload.previewOptimized !== false,
    previewCacheChecked: true,
  };

  imageEditState.set(key, nextState);
  if (aliasKey) {
    imageEditState.set(aliasKey, { ...nextState });
  }

  void fetch(payload.previewUrl)
    .then((response) => response.blob())
    .then((blob) => {
      void savePreviewBlobToCache(key, blob);
      if (aliasKey) {
        void savePreviewBlobToCache(aliasKey, blob);
      }
    })
    .catch(() => {});

  if (nextOperations.length > 0) {
    const persistedEntry = {
      fileName: payload.fileName,
      history: nextHistory,
      operations: nextOperations,
      previewOptimized: payload.previewOptimized !== false,
      updatedAt: Date.now(),
    };
    persistedImageEdits[key] = persistedEntry;
    if (aliasKey) {
      persistedImageEdits[aliasKey] = {
        ...persistedEntry,
      };
    }
  } else {
    delete persistedImageEdits[key];
    if (aliasKey) {
      delete persistedImageEdits[aliasKey];
    }
  }
  saveImageEdits();

  if (key.startsWith("finder:") && payload.previewUrl) {
    const parsedPageId = Number.parseInt(payload.pageId, 10);
    const normalizedPageId = Number.isInteger(parsedPageId)
      ? parsedPageId
      : null;
    const normalizedImageUrl =
      typeof payload.originalImageUrl === "string"
        ? payload.originalImageUrl
        : "";

    const existingSingleEntry = historyEntries.find((item) => {
      if (item?.type === "gallery") {
        return false;
      }

      if (normalizedPageId !== null && Number.isInteger(item?.pageId)) {
        return item.pageId === normalizedPageId;
      }

      return (
        Boolean(normalizedImageUrl) && item?.imageUrl === normalizedImageUrl
      );
    });

    if (
      !existingSingleEntry ||
      (normalizedPageId !== null &&
        !Number.isInteger(existingSingleEntry.pageId))
    ) {
      saveToHistory({
        pageId: normalizedPageId,
        title: payload.title,
        thumbnailUrl: payload.thumbnailUrl || normalizedImageUrl,
        imageUrl: normalizedImageUrl,
        fileName: payload.fileName,
        copiedText: "",
        layout: "",
      });
    }
  }

  applyEditedPreviewToCurrentUi({
    key,
    previewUrl: payload.previewUrl,
    originalImageUrl: payload.originalImageUrl || "",
  });
  if (aliasKey) {
    applyEditedPreviewToCurrentUi({
      key: aliasKey,
      previewUrl: payload.previewUrl,
      originalImageUrl: payload.originalImageUrl || "",
    });
  }
}

function enterEditorMode() {
  document.body.classList.add("editor-active");
}

function leaveEditorMode() {
  document.body.classList.remove("editor-active");
}

function buildShortStableId(value = "") {
  const input = String(value || "");
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36).slice(0, 5) || "0";
}

function getEditorRouteId(meta = {}) {
  const rawLabel =
    meta.fileName ||
    meta.title ||
    (typeof meta.imageUrl === "string"
      ? decodeURIComponent(meta.imageUrl.split("/").pop() || "")
      : "") ||
    "image";

  const labelSlug =
    slugifyFileName(removeCommonImageExtension(rawLabel)).slice(0, 48) ||
    "image";

  const identitySeed =
    meta.editKey || meta.imageUrl || meta.fileName || meta.title || rawLabel;
  const suffix = buildShortStableId(identitySeed);

  return `${labelSlug}-${suffix}`;
}

function rememberEditorRequest(meta = {}) {
  const routeId = getEditorRouteId(meta);
  const normalized = {
    ...meta,
    routeId,
  };
  editorRouteRequests.set(routeId, normalized);
  lastEditorOpenRequest = normalized;
  return normalized;
}

function getEditorRequestForRoute(routeId) {
  if (!routeId) {
    return lastEditorOpenRequest;
  }

  return editorRouteRequests.get(routeId) || lastEditorOpenRequest;
}

async function openImageEditor(meta, { syncHash = true } = {}) {
  if (!meta?.imageUrl) {
    setStatus("No image available for editing.");
    return;
  }

  const request = rememberEditorRequest(meta);
  activeEditorRouteId = request.routeId;

  editorSettingsWasOpen = !settingsPanel.classList.contains("hidden");
  closeSettingsPanel({ syncHash: false });
  enterEditorMode();

  try {
    await imageEditor.open(request);
    setStatus("Editor ready.");
    if (syncHash) {
      syncHashWithUi();
    }
  } catch {
    activeEditorRouteId = null;
    leaveEditorMode();
    setStatus("Could not open this image in the editor.");
  }
}

function closeImageEditor({ restoreSettings = true, syncHash = true } = {}) {
  imageEditor.close();
  leaveEditorMode();
  activeEditorRouteId = null;

  if (restoreSettings && editorSettingsWasOpen) {
    openSettingsPanel({ syncHash: false });
  }
  editorSettingsWasOpen = false;

  if (syncHash) {
    syncHashWithUi();
  }
}

function openFinderEditor() {
  if (!selectedImage) {
    setStatus("Select an image first.");
    return;
  }

  const editKey = buildImageEditKey(selectedImage, "finder");
  const existingEdit = getImageEditState(editKey);

  void openImageEditor({
    imageUrl: selectedImage.imageUrl,
    startImageUrl: existingEdit?.previewUrl || selectedImage.imageUrl,
    title: selectedImage.title,
    fileName: getImageFileName(selectedImage),
    thumbnailUrl: selectedImage.thumbnailUrl,
    pageId: selectedImage.pageId,
    editKey,
    history: Array.isArray(existingEdit?.history) ? existingEdit.history : [],
    operations: Array.isArray(existingEdit?.operations)
      ? existingEdit.operations
      : [],
  });
}

function openHistoryGalleryEditor() {
  const context = getActiveHistoryGalleryContext();
  if (!context?.item) {
    setStatus("Select a gallery image first.");
    return;
  }

  const item = context.item;
  const editKey = buildImageEditKey(item, `gallery:${context.entry.id}`);
  const existingEdit = getImageEditState(editKey);

  void openImageEditor({
    imageUrl: item.imageUrl || item.thumbnailUrl,
    startImageUrl:
      existingEdit?.previewUrl || item.imageUrl || item.thumbnailUrl,
    title: item.title || "Gallery image",
    fileName: getImageFileName(item),
    editKey,
    history: Array.isArray(existingEdit?.history) ? existingEdit.history : [],
    operations: Array.isArray(existingEdit?.operations)
      ? existingEdit.operations
      : [],
  });
}

async function openSingleVaultEditor(entryId) {
  const entry = historyEntries.find((item) => item.id === entryId);
  if (!entry || entry.type === "gallery") {
    setStatus("Select a single asset first.");
    return;
  }

  const rawImageUrl = entry.imageUrl || entry.thumbnailUrl || "";
  const rawThumbnailUrl = entry.thumbnailUrl || "";
  const imageUrl = await resolvePersistedImageUrl(rawImageUrl);
  if (!imageUrl) {
    setStatus("No image available for editing.");
    return;
  }

  const resolvedThumbnailUrl =
    rawThumbnailUrl && rawThumbnailUrl !== rawImageUrl
      ? await resolvePersistedImageUrl(rawThumbnailUrl)
      : imageUrl;

  const editSource = {
    pageId: entry.pageId,
    imageUrl: entry.imageUrl,
    thumbnailUrl: entry.thumbnailUrl,
    fileName: entry.fileName,
    title: entry.title,
  };
  const finderEditKey = buildImageEditKey(editSource, "finder");
  const editKey =
    entry.isSplitScreen && typeof entry.splitEditKey === "string" && entry.splitEditKey
      ? entry.splitEditKey
      : finderEditKey;
  const existingEdit = getImageEditState(editKey);

  void openImageEditor({
    imageUrl,
    startImageUrl: existingEdit?.previewUrl || imageUrl,
    title: entry.title || "Vault image",
    fileName: entry.fileName || getImageFileName(entry),
    thumbnailUrl: resolvedThumbnailUrl || imageUrl,
    pageId: Number.isInteger(entry.pageId) ? entry.pageId : null,
    editKey,
    isSplitScreen: Boolean(entry.isSplitScreen),
    splitLayout: Number.isInteger(entry.splitLayout) ? entry.splitLayout : null,
    splitImages: Array.isArray(entry.splitImages) ? entry.splitImages : [],
    canvasWidth: Number.isFinite(Number(entry.canvasWidth))
      ? Number(entry.canvasWidth)
      : null,
    canvasHeight: Number.isFinite(Number(entry.canvasHeight))
      ? Number(entry.canvasHeight)
      : null,
    history: Array.isArray(existingEdit?.history) ? existingEdit.history : [],
    operations: Array.isArray(existingEdit?.operations)
      ? existingEdit.operations
      : [],
  });
}

function setStatus(message) {
  statusEl.textContent = message;
}

function setButtonIconLabel(button, iconClass, label) {
  if (!button) {
    return;
  }

  button.innerHTML = "";
  const icon = document.createElement("i");
  icon.className = iconClass;
  icon.setAttribute("aria-hidden", "true");
  button.append(icon);

  if (label) {
    const text = document.createElement("span");
    text.textContent = label;
    button.append(text);
  }
}

function getHistoryGalleryTitleWithCount(entry) {
  if (!entry || entry.type !== "gallery") {
    return "";
  }

  const itemsCount = getGalleryItems(entry).length;
  const galleryTitle = entry.galleryTitle || entry.title || "Gallery";
  return `${galleryTitle} • ${itemsCount} image${itemsCount === 1 ? "" : "s"}`;
}

function getHistoryGalleryDescriptionText(entry) {
  if (!entry || entry.type !== "gallery") {
    return "";
  }

  return (entry.galleryDescription || "").trim();
}

function getActiveHistoryGalleryEntry() {
  if (!activeHistoryGalleryId) {
    return null;
  }

  const entry = historyEntries.find(
    (item) => item.id === activeHistoryGalleryId,
  );
  if (!entry || entry.type !== "gallery") {
    return null;
  }

  return entry;
}

function applyHistoryGalleryHeaderText(entry) {
  historyHeaderTitle.textContent = getHistoryGalleryTitleWithCount(entry);
  historyHeaderSubtitle.textContent =
    getHistoryGalleryDescriptionText(entry) || "No description.";
  historyGalleryMeta.textContent = "";
}

function resetHistoryHeaderDefaultText() {
  historyHeaderTitle.textContent = "Content Vault";
  historyHeaderSubtitle.textContent =
    "Saved assets and shortcodes for quick reuse.";
}

function selectAllContent(el) {
  const selection = window.getSelection();
  if (!selection) {
    return;
  }

  const range = document.createRange();
  range.selectNodeContents(el);
  selection.removeAllRanges();
  selection.addRange(range);
}

function clearHistoryHeaderEditableState(el) {
  if (!el) {
    return;
  }

  el.removeAttribute("contenteditable");
  el.removeAttribute("data-inline-editing");
}

function commitInlineHistoryHeaderEdit(field) {
  const entry = getActiveHistoryGalleryEntry();
  if (!entry || entry.type !== "gallery") {
    clearHistoryHeaderEditableState(historyHeaderTitle);
    clearHistoryHeaderEditableState(historyHeaderSubtitle);
    return;
  }

  if (field === "title") {
    const editedTitle = (historyHeaderTitle.textContent || "").trim();
    const nextTitle = editedTitle || entry.title || "Gallery";
    updateHistoryEntryFields(entry.id, {
      galleryTitle: editedTitle,
      title: nextTitle,
    });
    const refreshed = getActiveHistoryGalleryEntry();
    if (refreshed) {
      applyHistoryGalleryHeaderText(refreshed);
    }
    clearHistoryHeaderEditableState(historyHeaderTitle);
    setStatus("Gallery title updated.");
    return;
  }

  const editedDescription = (historyHeaderSubtitle.textContent || "").trim();
  updateHistoryEntryFields(entry.id, {
    galleryDescription: editedDescription,
  });
  const refreshed = getActiveHistoryGalleryEntry();
  if (refreshed) {
    applyHistoryGalleryHeaderText(refreshed);
  }
  clearHistoryHeaderEditableState(historyHeaderSubtitle);
  setStatus("Gallery description updated.");
}

function startInlineHistoryHeaderEdit(field) {
  const entry = getActiveHistoryGalleryEntry();
  if (!entry || entry.type !== "gallery") {
    setStatus("Open a gallery first.");
    return;
  }

  const targetEl =
    field === "title" ? historyHeaderTitle : historyHeaderSubtitle;
  const initialValue =
    field === "title"
      ? entry.galleryTitle || entry.title || "Gallery"
      : getHistoryGalleryDescriptionText(entry);

  targetEl.textContent = initialValue;
  targetEl.setAttribute("contenteditable", "true");
  targetEl.dataset.inlineEditing = field;
  targetEl.focus();
  selectAllContent(targetEl);

  const onBlur = () => {
    targetEl.removeEventListener("blur", onBlur);
    targetEl.removeEventListener("keydown", onKeyDown);
    commitInlineHistoryHeaderEdit(field);
  };

  const onKeyDown = (event) => {
    if (event.key === "Enter" && field === "title") {
      event.preventDefault();
      targetEl.blur();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      targetEl.removeEventListener("blur", onBlur);
      targetEl.removeEventListener("keydown", onKeyDown);
      clearHistoryHeaderEditableState(targetEl);
      applyHistoryGalleryHeaderText(entry);
      return;
    }

    if (event.key === "Enter" && field === "description" && !event.shiftKey) {
      event.preventDefault();
      targetEl.blur();
    }
  };

  targetEl.addEventListener("blur", onBlur);
  targetEl.addEventListener("keydown", onKeyDown);
}

function updateHistoryGalleryExportAllButtonLabel() {
  if (!historyGalleryExportAllBtn) {
    return;
  }

  if (exportingHistoryGalleryImages) {
    setButtonIconLabel(
      historyGalleryExportAllBtn,
      "fa-solid fa-spinner",
      "Downloading...",
    );
    return;
  }

  setButtonIconLabel(
    historyGalleryExportAllBtn,
    "fa-solid fa-download",
    "Download",
  );
}

function normalizeRouteView(value) {
  return value === ROUTE_VAULT || value === "history" ? "history" : "finder";
}

function parseHashRoute() {
  const rawHash = (window.location.hash || "").replace(/^#/, "").trim();
  if (!rawHash) {
    return {
      viewName: "finder",
      galleryId: null,
      settingsOpen: false,
      editorOpen: false,
      editorId: null,
    };
  }

  const [rawPath = "", rawQuery = ""] = rawHash.split("?");
  const segments = rawPath
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  const firstSegment = (segments[0] || ROUTE_FINDER).toLowerCase();
  const viewName = normalizeRouteView(firstSegment);
  const query = new URLSearchParams(rawQuery);
  const settingsOpen = query.get("settings") === "1";
  const editorOpen = query.get("editor") === "1";
  const editorId = query.get("editorId") || null;

  let galleryId = null;
  if (
    viewName === "history" &&
    segments[1] === "gallery" &&
    typeof segments[2] === "string" &&
    segments[2]
  ) {
    try {
      galleryId = decodeURIComponent(segments[2]);
    } catch {
      galleryId = segments[2];
    }
  }

  return {
    viewName,
    galleryId,
    settingsOpen,
    editorOpen,
    editorId,
  };
}

function buildHashRoute({
  viewName,
  galleryId,
  settingsOpen,
  editorOpen,
  editorId,
}) {
  const routeView = viewName === "history" ? ROUTE_VAULT : ROUTE_FINDER;
  let hashPath = routeView;

  if (routeView === ROUTE_VAULT && galleryId) {
    hashPath += `/gallery/${encodeURIComponent(galleryId)}`;
  }

  const query = new URLSearchParams();
  if (settingsOpen) {
    query.set("settings", "1");
  }
  if (editorOpen) {
    query.set("editor", "1");
    if (editorId) {
      query.set("editorId", editorId);
    }
  }

  const queryText = query.toString();
  if (queryText) {
    hashPath += `?${queryText}`;
  }

  return `#${hashPath}`;
}

function syncHashWithUi({ replace = false } = {}) {
  if (isApplyingHashRoute) {
    return;
  }

  const nextHash = buildHashRoute({
    viewName: activeViewName,
    galleryId: activeViewName === "history" ? activeHistoryGalleryId : null,
    settingsOpen: !settingsPanel.classList.contains("hidden"),
    editorOpen: imageEditor.isOpen(),
    editorId: activeEditorRouteId,
  });

  if (window.location.hash === nextHash) {
    return;
  }

  if (replace) {
    window.history.replaceState(null, "", nextHash);
  } else {
    window.location.hash = nextHash;
  }
}

function applyRouteFromHash() {
  const route = parseHashRoute();
  isApplyingHashRoute = true;
  try {
    setActiveView(route.viewName, { syncHash: false });

    if (route.viewName === "history") {
      if (route.galleryId) {
        const opened = openHistoryGalleryInspector(route.galleryId, {
          syncHash: false,
        });
        if (!opened) {
          closeHistoryGalleryInspector({ syncHash: false });
        }
      } else {
        closeHistoryGalleryInspector({ syncHash: false });
      }
    } else {
      closeHistoryGalleryInspector({ syncHash: false });
    }

    if (route.settingsOpen) {
      openSettingsPanel({ syncHash: false });
    } else {
      closeSettingsPanel({ syncHash: false });
    }

    if (route.editorOpen) {
      const request = getEditorRequestForRoute(route.editorId);
      const isSameEditorRoute =
        imageEditor.isOpen() &&
        activeEditorRouteId &&
        route.editorId &&
        activeEditorRouteId === route.editorId;

      if (!isSameEditorRoute) {
        if (imageEditor.isOpen()) {
          closeImageEditor({ restoreSettings: false, syncHash: false });
        }

        if (request?.imageUrl) {
          activeEditorRouteId = request.routeId;
          void openImageEditor(request, { syncHash: false });
        }
      }
    } else if (imageEditor.isOpen()) {
      closeImageEditor({ restoreSettings: false, syncHash: false });
    }
  } finally {
    isApplyingHashRoute = false;
  }

  syncHashWithUi({ replace: true });
}

function setActiveView(viewName, { syncHash = true } = {}) {
  activeViewName = viewName;
  const isFinder = viewName === "finder";
  finderView.classList.toggle("hidden", !isFinder);
  historyView.classList.toggle("hidden", isFinder);
  updateTopTabIndicators();

  if (!isFinder) {
    renderHistory();
  }

  if (syncHash) {
    syncHashWithUi();
  }
}

function openSettingsPanel({ syncHash = true } = {}) {
  settingsPanel.classList.remove("hidden");
  settingsBackdrop.classList.remove("hidden");
  settingsPanel.setAttribute("aria-hidden", "false");
  applySettingsToUI();
  updateTopTabIndicators();

  if (syncHash) {
    syncHashWithUi();
  }
}

function closeSettingsPanel({ syncHash = true } = {}) {
  settingsPanel.classList.add("hidden");
  settingsBackdrop.classList.add("hidden");
  settingsPanel.setAttribute("aria-hidden", "true");
  updateTopTabIndicators();

  if (syncHash) {
    syncHashWithUi();
  }
}

function updateTopTabIndicators() {
  showFinderViewBtn.classList.toggle("active-tab", activeViewName === "finder");
  showHistoryViewBtn.classList.toggle(
    "active-tab",
    activeViewName === "history",
  );
  const settingsOpen = !settingsPanel.classList.contains("hidden");
  openSettingsBtn.classList.toggle("active-tab", settingsOpen);
}

function setProgressOverlay(overlayEl, message) {
  if (!(overlayEl instanceof HTMLElement)) {
    return;
  }

  const label =
    typeof message === "string" && message.trim()
      ? message.trim()
      : "Processing…";

  const textNode = overlayEl.querySelector("span");
  if (textNode) {
    textNode.textContent = label;
  }

  overlayEl.classList.remove("hidden");
}

function clearProgressOverlay(overlayEl) {
  if (!(overlayEl instanceof HTMLElement)) {
    return;
  }

  overlayEl.classList.add("hidden");
}

function createThrottledProgressUpdater({
  overlayEl = null,
  minIntervalMs = 180,
} = {}) {
  let lastAt = 0;

  return (message) => {
    if (!message) {
      return;
    }

    const now = performance.now();
    if (now - lastAt < minIntervalMs) {
      return;
    }

    lastAt = now;
    setStatus(message);
    if (overlayEl) {
      setProgressOverlay(overlayEl, message);
    }
  };
}

function showProgressNotice(message) {
  if (!(progressNotice instanceof HTMLElement)) {
    return;
  }

  progressNoticeDepth += 1;
  progressNotice.textContent =
    typeof message === "string" && message.trim()
      ? message.trim()
      : "Processing…";
  progressNotice.classList.remove("hidden");
}

function updateProgressNotice(message) {
  if (!(progressNotice instanceof HTMLElement) || progressNoticeDepth <= 0) {
    return;
  }

  if (typeof message === "string" && message.trim()) {
    progressNotice.textContent = message.trim();
  }
}

function hideProgressNotice() {
  if (!(progressNotice instanceof HTMLElement)) {
    return;
  }

  progressNoticeDepth = Math.max(0, progressNoticeDepth - 1);
  if (progressNoticeDepth > 0) {
    return;
  }

  progressNotice.classList.add("hidden");
  progressNotice.textContent = "";
}

function cachePreviewObjectUrl(key, blob) {
  if (!key || !(blob instanceof Blob)) {
    return "";
  }

  const previous = previewBlobUrls.get(key);
  if (previous) {
    URL.revokeObjectURL(previous);
  }

  const nextUrl = URL.createObjectURL(blob);
  previewBlobUrls.set(key, nextUrl);
  return nextUrl;
}

async function savePreviewBlobToCache(key, blob) {
  if (!key || !(blob instanceof Blob)) {
    return;
  }

  try {
    const db = await openDirectoryDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(PREVIEW_CACHE_STORE_NAME, "readwrite");
      tx.objectStore(PREVIEW_CACHE_STORE_NAME).put(
        {
          blob,
          updatedAt: Date.now(),
        },
        key,
      );
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error(error);
  }
}

async function loadPreviewBlobFromCache(key) {
  if (!key) {
    return null;
  }

  try {
    const db = await openDirectoryDb();
    const value = await new Promise((resolve, reject) => {
      const tx = db.transaction(PREVIEW_CACHE_STORE_NAME, "readonly");
      const req = tx.objectStore(PREVIEW_CACHE_STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    return value?.blob instanceof Blob ? value.blob : null;
  } catch {
    return null;
  }
}

async function deletePreviewBlobFromCache(key) {
  if (!key) {
    return;
  }

  const existingUrl = previewBlobUrls.get(key);
  if (existingUrl) {
    URL.revokeObjectURL(existingUrl);
    previewBlobUrls.delete(key);
  }

  try {
    const db = await openDirectoryDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(PREVIEW_CACHE_STORE_NAME, "readwrite");
      tx.objectStore(PREVIEW_CACHE_STORE_NAME).delete(key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error(error);
  }
}

function showActionToast(message) {
  if (!message) {
    return;
  }

  actionToast.textContent = message;
  actionToast.classList.add("show");

  if (actionToastTimer) {
    clearTimeout(actionToastTimer);
  }

  actionToastTimer = window.setTimeout(() => {
    actionToast.classList.remove("show");
    actionToastTimer = null;
  }, 2400);
}

function applySettingsToUI() {
  gridColumnsSelect.value = String(settings.gridColumns);
  exportPathInput.value = settings.exportPathLabel || "";
  photoScanPagesSelect.value = String(settings.photoScanPages);
  galleryModeCheckbox.checked = parseGalleryMode(settings.galleryMode);
  splitModeCheckbox.checked = parseSplitMode(settings.splitMode);
  exportMaxWidthInput.value = String(settings.exportMaxWidth);
  exportTargetKbInput.value = String(settings.exportTargetKb);
  exportFormatSelect.value = parseExportFormat(settings.exportFormat);
}

function parseGridColumns(value) {
  const parsed = Number.parseInt(value, 10);
  if (parsed === 2 || parsed === 3 || parsed === 4) {
    return parsed;
  }
  return DEFAULT_SETTINGS.gridColumns;
}

function parsePhotoScanPages(value) {
  const parsed = Number.parseInt(value, 10);
  if ([2, 4, 6, 8, 10].includes(parsed)) {
    return parsed;
  }
  return DEFAULT_SETTINGS.photoScanPages;
}

function parseGalleryMode(value) {
  return value === true;
}

function parseSplitMode(value) {
  return value === true;
}

function parseExportMaxWidth(value) {
  const parsed = Number.parseInt(value, 10);
  if (
    Number.isFinite(parsed) &&
    parsed >= EXPORT_WIDTH_MIN &&
    parsed <= EXPORT_WIDTH_MAX
  ) {
    return parsed;
  }
  return DEFAULT_SETTINGS.exportMaxWidth;
}

function parseExportTargetKb(value) {
  const parsed = Number.parseInt(value, 10);
  if (
    Number.isFinite(parsed) &&
    parsed >= EXPORT_TARGET_KB_MIN &&
    parsed <= EXPORT_TARGET_KB_MAX
  ) {
    return parsed;
  }
  return DEFAULT_SETTINGS.exportTargetKb;
}

function parseExportFormat(value) {
  const normalized =
    typeof value === "string" ? value.trim().toLowerCase() : "";
  if (EXPORT_FORMATS.includes(normalized)) {
    return normalized;
  }
  return DEFAULT_SETTINGS.exportFormat;
}

function getExportMimeType(format) {
  const normalized = parseExportFormat(format);
  if (normalized === "jpg") {
    return "image/jpeg";
  }
  if (normalized === "png") {
    return "image/png";
  }
  return "image/webp";
}

function getExportExtension(format) {
  const normalized = parseExportFormat(format);
  if (normalized === "jpg") {
    return "jpg";
  }
  if (normalized === "png") {
    return "png";
  }
  return "webp";
}

function getActiveExportFormat() {
  return parseExportFormat(settings.exportFormat);
}

function isGalleryMode() {
  return parseGalleryMode(settings.galleryMode);
}

function isSplitMode() {
  return parseSplitMode(settings.splitMode);
}

function applyGridColumns() {
  document.documentElement.style.setProperty(
    "--finder-grid-columns",
    String(settings.gridColumns),
  );
}

function applyGalleryModeUI() {
  if (isGalleryMode()) {
    selectedImage = null;
    splitDetails.classList.add("hidden");
    galleryDetails.classList.remove("hidden");
    detailsEl.classList.add("hidden");
    emptyState.classList.add("hidden");
    updateGallerySelectionList();
    updateDownloadButtonState();
    return;
  }

  galleryDetails.classList.add("hidden");
  selectedGalleryItems.clear();
  currentGalleryHistoryId = null;
  resetGalleryDoneButtonState();
  updateGallerySelectionList();

  if (isSplitMode()) {
    applySplitModeUI();
    return;
  }

  if (selectedImage) {
    showDetails();
  } else {
    detailsEl.classList.add("hidden");
    emptyState.classList.remove("hidden");
  }

  updateDownloadButtonState();
}

function applySplitModeUI() {
  if (isSplitMode()) {
    selectedImage = null;
    galleryDetails.classList.add("hidden");
    splitDetails.classList.remove("hidden");
    detailsEl.classList.add("hidden");
    emptyState.classList.add("hidden");
    updateSplitSelectionList();
    updateDownloadButtonState();
    return;
  }

  splitDetails.classList.add("hidden");
  selectedSplitItems.clear();
  updateSplitSelectionList();

  if (selectedImage) {
    showDetails();
  } else {
    detailsEl.classList.add("hidden");
    emptyState.classList.remove("hidden");
  }

  updateDownloadButtonState();
}

function toggleSplitSelection(pageId, options = {}) {
  const { additive = false, forceChecked = null } = options;
  const selectedItem = currentResults.find((item) => item.pageId === pageId);
  if (!selectedItem) {
    return;
  }

  const maxSplitCount = splitLayoutSelect.value === "3" ? 3 : 2;

  if (!additive && forceChecked === null) {
    selectedSplitItems.clear();
  }

  const isSelected = selectedSplitItems.has(pageId);
  const shouldSelect =
    forceChecked === null ? !isSelected : Boolean(forceChecked);

  if (shouldSelect) {
    // Check if we've reached the limit
    if (selectedSplitItems.size >= maxSplitCount) {
      // Remove the first item to make room
      const firstKey = selectedSplitItems.keys().next().value;
      selectedSplitItems.delete(firstKey);
    }
    selectedSplitItems.set(pageId, selectedItem);
  } else {
    selectedSplitItems.delete(pageId);
  }

  showDetails();
  updateSplitSelectionList();
  syncSplitResultSelectionUi();
  updateSplitCombineButtonState();

  if (isSmallScreen()) {
    setMobileDetailsCollapsed(false);
  }
}

function updateSplitSelectionList() {
  if (!splitSelectionList || !splitSelectionEmpty) {
    return;
  }

  splitSelectionList.innerHTML = "";
  const selectedItems = [...selectedSplitItems.values()];
  const maxSplitCount = splitLayoutSelect.value === "3" ? 3 : 2;
  splitSelectionEmpty.classList.toggle("hidden", selectedItems.length > 0);

  selectedItems.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "gallery-item";

    const preview = document.createElement("img");
    preview.src = item.thumbnailUrl;
    preview.alt = item.title;
    preview.loading = "lazy";

    const title = document.createElement("div");
    title.className = "gallery-item-title";
    title.textContent = `${index + 1}. ${item.title}`;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    setButtonIconLabel(removeBtn, "fa-solid fa-xmark", "Remove");
    removeBtn.addEventListener("click", () => {
      selectedSplitItems.delete(item.pageId);
      updateSplitSelectionList();
      syncSplitResultSelectionUi();
      updateSplitCombineButtonState();
      regenerateSplitOutputs();
    });

    row.appendChild(preview);
    row.appendChild(title);
    row.appendChild(removeBtn);
    splitSelectionList.appendChild(row);
  });

  // Update the selection count hint
  splitSelectionCount.textContent = String(maxSplitCount);
  updateSplitCombineButtonState();
  regenerateSplitOutputs();
}

function syncSplitResultSelectionUi() {
  [...resultsEl.children].forEach((node, index) => {
    const item = currentResults[index];
    if (!item) {
      return;
    }

    const isSelected = selectedSplitItems.has(item.pageId);
    node.classList.toggle("active", isSelected);

    const checkbox = node.querySelector(".result-select");
    if (checkbox instanceof HTMLInputElement) {
      checkbox.checked = isSelected;
    }
  });
}

function updateSplitCombineButtonState() {
  if (!splitCombineBtn) {
    return;
  }

  const maxSplitCount = splitLayoutSelect.value === "3" ? 3 : 2;
  const hasEnoughImages = selectedSplitItems.size === maxSplitCount;
  splitCombineBtn.disabled = !hasEnoughImages;
}

function updateSplitWidthVisibility() {
  if (!splitWidthRow || !splitOutputLayoutSelect) {
    return;
  }
  splitWidthRow.classList.toggle("hidden", splitOutputLayoutSelect.value !== "custom");
}

function buildSplitFileName(images) {
  if (!images || images.length === 0) {
    return `split-${Date.now()}`;
  }

  // Extract clean names from each image
  const names = images.map(img => {
    const title = img.title || img.fileName || "image";
    // Remove "File:" prefix if present
    const cleaned = title.replace(/^File:/i, "").trim();
    // Slugify and take first 20 chars
    return slugifyFileName(removeCommonImageExtension(cleaned)).slice(0, 20);
  });

  // Join with underscore
  return names.join("_") || `split-${Date.now()}`;
}

function buildSplitAttribution(images) {
  if (!images || images.length === 0) {
    return "";
  }

  const positionLabels =
    images.length === 2 ? ["Left", "Right"] : ["Left", "Center", "Right"];
  const attributions = [];

  images.forEach((image, index) => {
    const position = positionLabels[index] || `Image ${index + 1}`;
    const author = normalizeAuthor(image.author || "");
    const hasKnownAuthor = Boolean(author);
    const license =
      image.licenseShort && image.licenseShort !== "Unknown"
        ? image.licenseShort.trim()
        : "Unknown license";

    const attribution = hasKnownAuthor
      ? `${position}: Photo by ${author} © ${license}`
      : `${position}: © ${license}`;
    
    attributions.push(attribution);
  });

  return attributions.join(". ");
}

function buildSplitCaption(rawCaption, images) {
  const baseCaption = (rawCaption || "").trim().replace(/[.\s]+$/, "");
  const suffix = buildSplitAttribution(images);

  if (!suffix) {
    return baseCaption;
  }

  return baseCaption ? `${baseCaption}. ${suffix}` : suffix;
}

function regenerateSplitOutputs() {
  if (!splitShortcodeOutput) {
    return;
  }

  const selectedItems = [...selectedSplitItems.values()];
  if (selectedItems.length === 0) {
    splitShortcodeOutput.value = "";
    return;
  }

  const layout = splitOutputLayoutSelect?.value || "normal";
  const customWidth = splitCustomWidth?.value || "600";
  const rawCaption = splitCaptionInput?.value || "";
  
  // Build proper caption with attribution
  const caption = buildSplitCaption(rawCaption, selectedItems);
  
  // Generate stable filename based on source images
  const baseFileName = buildSplitFileName(selectedItems);
  const fileName = `${baseFileName}.${getActiveExportFormat()}`;
  const relativePath = fileName;
  const localImagePath = `/images/${relativePath}`;
  const escapedUrl = escapeShortcodeValue(localImagePath);
  const escapedCaption = escapeShortcodeValue(caption);

  let shortcode = "";
  const widthValue = Number.parseInt(customWidth, 10);
  const safeWidth = Number.isFinite(widthValue) && widthValue > 0 ? widthValue : 600;

  switch (layout) {
    case "large":
      shortcode = `{{< photo-large src="${escapedUrl}" caption="${escapedCaption}" >}}`;
      break;
    case "xlarge":
      shortcode = `{{< photo-xlarge src="${escapedUrl}" caption="${escapedCaption}" >}}`;
      break;
    case "custom":
      shortcode = `{{< photo-custom src="${escapedUrl}" width="${safeWidth}" caption="${escapedCaption}" >}}`;
      break;
    case "cover":
      shortcode = `image: "/images/${escapeShortcodeValue(relativePath)}"\nimageCaption: "${escapedCaption}"`;
      break;
    default:
      shortcode = `{{< photo-normal src="${escapedUrl}" caption="${escapedCaption}" >}}`;
      break;
  }

  splitShortcodeOutput.value = shortcode;
}

async function handleSplitCombine() {
  const selectedItems = [...selectedSplitItems.values()];
  const maxSplitCount = splitLayoutSelect.value === "3" ? 3 : 2;

  if (selectedItems.length !== maxSplitCount) {
    setStatus(`Please select exactly ${maxSplitCount} images.`);
    return;
  }

  const selectedCanvasSize = getSplitCanvasSizeFromPreset();
  const canvasWidth = selectedCanvasSize.width;
  const canvasHeight = selectedCanvasSize.height;
  const rawCaption = splitCaptionInput.value.trim();

  setStatus("Creating split screen canvas...");
  showProgressNotice("Loading images...");
  
  try {
    // Create a combined canvas with proper cropping
    const combinedCanvas = await createSplitCanvas(
      selectedItems,
      canvasWidth,
      canvasHeight,
      maxSplitCount
    );

    const timestamp = Date.now();
    const editKey = `split:${timestamp}`;
    const persistedSplitUrl = buildSplitCacheImageUrl(editKey);

    // Generate stable filename based on source images
    const exportFormat = getActiveExportFormat();
    const exportExt = exportFormat === "jpg" ? "jpg" : exportFormat === "png" ? "png" : "webp";
    const baseFileName = buildSplitFileName(selectedItems);
    const fileName = `${baseFileName}.${exportExt}`;

    // Build proper caption with attribution
    const caption = buildSplitCaption(rawCaption, selectedItems);

    // Open editor immediately from in-memory canvas for a faster transition
    const splitMeta = {
      imageUrl: persistedSplitUrl,
      startImageUrl: "",
      sourceCanvas: combinedCanvas,
      title: `Split Screen (${maxSplitCount} images)`,
      fileName,
      editKey,
      history: [],
      operations: [],
      isSplitScreen: true,
      splitImages: selectedItems.map((item, index) => ({
        pageId: item.pageId,
        imageUrl: item.imageUrl || item.thumbnailUrl,
        thumbnailUrl: item.thumbnailUrl,
        title: item.title,
        index,
      })),
      splitLayout: maxSplitCount,
      canvasWidth,
      canvasHeight,
      caption,
    };

    const openEditorPromise = openImageEditor(splitMeta);
    updateProgressNotice("Saving split image...");

    // Get export format from settings
    const exportMimeType = exportFormat === "jpg" ? "image/jpeg" : 
                          exportFormat === "png" ? "image/png" : "image/webp";
    const exportQuality = exportFormat === "jpg" ? 0.92 : 0.90;

    // Convert canvas to blob with proper format
    const blob = await new Promise((resolve, reject) => {
      combinedCanvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error("Failed to create canvas blob"));
      }, exportMimeType, exportQuality);
    });

    await savePreviewBlobToCache(editKey, blob);

    // Save to vault/history
    saveToHistory({
      pageId: null,
      title: splitMeta.title,
      thumbnailUrl: persistedSplitUrl,
      imageUrl: persistedSplitUrl,
      fileName,
      copiedText: splitShortcodeOutput?.value || "",
      caption,
      layout: splitOutputLayoutSelect?.value || "normal",
      isSplitScreen: true,
      splitLayout: maxSplitCount,
      splitImages: splitMeta.splitImages,
      canvasWidth,
      canvasHeight,
      splitEditKey: editKey,
    });

    await openEditorPromise;
    hideProgressNotice();
    setStatus("Split canvas created. Adjust framing in editor.");
  } catch (error) {
    console.error(error);
    hideProgressNotice();
    setStatus("Failed to create split canvas. Please try again.");
  }
}

async function createSplitCanvas(images, canvasWidth, canvasHeight, splitCount) {
  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas context unavailable");
  }

  // Fill with white background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Calculate exact dimensions for each section
  const sectionWidth = canvasWidth / splitCount;

  // Load images in parallel for better performance
  const loadedImages = await Promise.all(
    images.map(image => loadImageElement(image.imageUrl || image.thumbnailUrl))
  );

  // Draw each image in its section with proper cropping
  for (let i = 0; i < loadedImages.length; i++) {
    const img = loadedImages[i];
    const sectionX = i * sectionWidth;

    // Calculate how to crop the image to fit the section perfectly
    const targetAspect = sectionWidth / canvasHeight;
    const imgAspect = img.width / img.height;

    let srcX = 0, srcY = 0, srcWidth = img.width, srcHeight = img.height;

    if (imgAspect > targetAspect) {
      // Image is wider - crop sides (center crop horizontally)
      srcWidth = img.height * targetAspect;
      srcX = (img.width - srcWidth) / 2;
    } else {
      // Image is taller - crop top/bottom (center crop vertically)
      srcHeight = img.width / targetAspect;
      srcY = (img.height - srcHeight) / 2;
    }

    // Draw cropped image to fill the exact section
    ctx.drawImage(
      img,
      srcX, srcY, srcWidth, srcHeight,
      sectionX, 0, sectionWidth, canvasHeight
    );
  }

  return canvas;
}

function loadImageElement(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

function toggleGallerySelection(pageId, options = {}) {
  const { additive = false, forceChecked = null } = options;
  const selectedItem = currentResults.find((item) => item.pageId === pageId);
  if (!selectedItem) {
    return;
  }

  resetGalleryDoneButtonState();

  if (!additive && forceChecked === null) {
    selectedGalleryItems.clear();
  }

  const isSelected = selectedGalleryItems.has(pageId);
  const shouldSelect =
    forceChecked === null ? !isSelected : Boolean(forceChecked);

  if (shouldSelect) {
    selectedGalleryItems.set(pageId, selectedItem);
  } else {
    selectedGalleryItems.delete(pageId);
  }

  showDetails();
  updateGallerySelectionList();
  syncGalleryResultSelectionUi();

  if (isSmallScreen()) {
    setMobileDetailsCollapsed(false);
  }

  scheduleGalleryAutoSave();
}

function syncGalleryResultSelectionUi() {
  const resultItems = resultsEl.querySelectorAll(".result-item");
  resultItems.forEach((itemEl) => {
    const pageId = Number.parseInt(itemEl.dataset.pageId || "", 10);
    if (!Number.isInteger(pageId)) {
      return;
    }

    const isSelected = selectedGalleryItems.has(pageId);
    itemEl.classList.toggle("active", isSelected);
    const checkbox = itemEl.querySelector(".result-select");
    if (checkbox instanceof HTMLInputElement) {
      checkbox.checked = isSelected;
    }
  });
}

function updateGallerySelectionList() {
  if (!gallerySelectionList || !gallerySelectionEmpty) {
    return;
  }

  gallerySelectionList.innerHTML = "";
  const selectedItems = [...selectedGalleryItems.values()];
  gallerySelectionEmpty.classList.toggle("hidden", selectedItems.length > 0);

  selectedItems.forEach((item) => {
    const row = document.createElement("div");
    row.className = "gallery-item";

    const preview = document.createElement("img");
    preview.src = item.thumbnailUrl;
    preview.alt = item.title;
    preview.loading = "lazy";

    const title = document.createElement("div");
    title.className = "gallery-item-title";
    title.textContent = item.title;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    setButtonIconLabel(removeBtn, "fa-solid fa-xmark", "Remove");
    removeBtn.addEventListener("click", () => {
      selectedGalleryItems.delete(item.pageId);
      updateGallerySelectionList();
      syncGalleryResultSelectionUi();
      scheduleGalleryAutoSave();
    });

    row.appendChild(preview);
    row.appendChild(title);
    row.appendChild(removeBtn);
    gallerySelectionList.appendChild(row);
  });
}

function scheduleGalleryAutoSave() {
  if (!isGalleryMode()) {
    return;
  }

  if (gallerySaveTimer) {
    clearTimeout(gallerySaveTimer);
  }

  gallerySaveTimer = window.setTimeout(() => {
    gallerySaveTimer = null;
    saveGalleryDraftToHistory();
  }, 450);
}

function saveGalleryDraftToHistory() {
  if (!isGalleryMode()) {
    return;
  }

  const items = [...selectedGalleryItems.values()];
  if (!items.length) {
    return;
  }

  const titleValue = (galleryTitleInput.value || "").trim();
  const descriptionValue = (galleryDescriptionInput.value || "").trim();
  const nowIso = new Date().toISOString();
  const entryId = currentGalleryHistoryId || crypto.randomUUID();

  const entry = {
    id: entryId,
    type: "gallery",
    title: titleValue || `Gallery ${new Date().toLocaleDateString()}`,
    galleryTitle: titleValue,
    galleryDescription: descriptionValue,
    galleryItems: items.map((item) => ({
      pageId: item.pageId,
      title: item.title,
      thumbnailUrl: item.thumbnailUrl,
      imageUrl: item.imageUrl,
      fileName: getImageFileName(item),
      relativePath: getImageRelativePath(item),
      author: item.author || "",
      licenseShort: item.licenseShort || "",
      description: item.description || "",
    })),
    copiedText: "",
    downloaded: false,
    copiedAt: nowIso,
  };

  upsertHistoryEntry(entry);
  currentGalleryHistoryId = entryId;
}

function finishCurrentGallery() {
  if (!isGalleryMode()) {
    return;
  }

  if (gallerySaveTimer) {
    clearTimeout(gallerySaveTimer);
    gallerySaveTimer = null;
  }

  const hadSelection = selectedGalleryItems.size > 0;
  if (hadSelection) {
    saveGalleryDraftToHistory();
  }

  const savedEntryId = hadSelection ? currentGalleryHistoryId : null;

  selectedGalleryItems.clear();
  currentGalleryHistoryId = null;
  galleryTitleInput.value = "";
  galleryDescriptionInput.value = "";

  updateGallerySelectionList();
  syncGalleryResultSelectionUi();
  showDetails();

  if (savedEntryId) {
    flashGalleryDoneButton(savedEntryId);
    setStatus("Gallery saved to Vault. Click Done again to open it.");
  } else {
    resetGalleryDoneButtonState();
    setStatus("Gallery reset. Ready to start a new gallery.");
  }
}

function flashGalleryDoneButton(entryId) {
  resetGalleryDoneButtonState();

  if (!entryId) {
    return;
  }

  galleryDoneLinkEntryId = entryId;
  setButtonIconLabel(galleryDoneBtn, "fa-solid fa-circle-check", "Open Vault");
  galleryDoneBtn.title = "Open this saved gallery in Vault";

  galleryDoneButtonTimer = window.setTimeout(() => {
    resetGalleryDoneButtonState();
  }, 3200);
}

function resetGalleryDoneButtonState() {
  if (galleryDoneButtonTimer) {
    clearTimeout(galleryDoneButtonTimer);
    galleryDoneButtonTimer = null;
  }

  galleryDoneLinkEntryId = null;
  setButtonIconLabel(galleryDoneBtn, "fa-solid fa-check", "Done");
  galleryDoneBtn.removeAttribute("title");
}

function openSavedGalleryFromDoneButton() {
  if (!galleryDoneLinkEntryId) {
    return false;
  }

  const targetEntryId = galleryDoneLinkEntryId;
  resetGalleryDoneButtonState();
  setActiveView("history");
  const opened = openHistoryGalleryInspector(targetEntryId);
  if (!opened) {
    setStatus("Saved gallery could not be opened. It may have been removed.");
    return true;
  }

  setStatus("Opened saved gallery in Vault.");
  return true;
}

function upsertHistoryEntry(entry) {
  const filtered = historyEntries.filter((item) => item.id !== entry.id);
  historyEntries = [entry, ...filtered];
  persistHistory();
  renderHistory();
}

function saveToHistory({
  pageId,
  title,
  thumbnailUrl,
  imageUrl,
  fileName,
  copiedText,
  layout,
  caption = "",
  isSplitScreen = false,
  splitLayout = null,
  splitImages = [],
  canvasWidth = null,
  canvasHeight = null,
  splitEditKey = "",
  downloaded = false,
}) {
  const nowIso = new Date().toISOString();
  const existingIndex = historyEntries.findIndex((item) => {
    if (item?.type === "gallery") {
      return false;
    }

    if (imageUrl && item?.imageUrl === imageUrl) {
      return true;
    }

    if (
      fileName &&
      item?.fileName === fileName &&
      title &&
      item?.title === title
    ) {
      return true;
    }

    return false;
  });

  if (existingIndex >= 0) {
    const existingEntry = historyEntries[existingIndex];
    const mergedEntry = {
      ...existingEntry,
      pageId: Number.isInteger(pageId) ? pageId : existingEntry.pageId,
      title: title || existingEntry.title,
      thumbnailUrl: thumbnailUrl || existingEntry.thumbnailUrl,
      imageUrl: imageUrl || existingEntry.imageUrl,
      fileName: fileName || existingEntry.fileName,
      copiedText: copiedText || existingEntry.copiedText || "",
      layout: layout || existingEntry.layout || "",
      caption:
        typeof caption === "string" && caption.trim()
          ? caption
          : existingEntry.caption || "",
      isSplitScreen: Boolean(isSplitScreen || existingEntry.isSplitScreen),
      splitLayout: Number.isInteger(splitLayout)
        ? splitLayout
        : Number.isInteger(existingEntry.splitLayout)
          ? existingEntry.splitLayout
          : null,
      splitImages:
        Array.isArray(splitImages) && splitImages.length > 0
          ? splitImages
          : Array.isArray(existingEntry.splitImages)
            ? existingEntry.splitImages
            : [],
      canvasWidth: Number.isFinite(Number(canvasWidth))
        ? Number(canvasWidth)
        : Number.isFinite(Number(existingEntry.canvasWidth))
          ? Number(existingEntry.canvasWidth)
          : null,
      canvasHeight: Number.isFinite(Number(canvasHeight))
        ? Number(canvasHeight)
        : Number.isFinite(Number(existingEntry.canvasHeight))
          ? Number(existingEntry.canvasHeight)
          : null,
      splitEditKey:
        typeof splitEditKey === "string" && splitEditKey.trim()
          ? splitEditKey.trim()
          : existingEntry.splitEditKey || "",
      downloaded: Boolean(downloaded || existingEntry.downloaded),
      copiedAt: nowIso,
    };

    historyEntries = [
      mergedEntry,
      ...historyEntries.filter((_, index) => index !== existingIndex),
    ];
  } else {
    const entry = {
      id: crypto.randomUUID(),
      pageId: Number.isInteger(pageId) ? pageId : null,
      title,
      thumbnailUrl,
      imageUrl,
      fileName,
      copiedText,
      layout,
      caption: typeof caption === "string" ? caption : "",
      isSplitScreen: Boolean(isSplitScreen),
      splitLayout: Number.isInteger(splitLayout) ? splitLayout : null,
      splitImages: Array.isArray(splitImages) ? splitImages : [],
      canvasWidth: Number.isFinite(Number(canvasWidth))
        ? Number(canvasWidth)
        : null,
      canvasHeight: Number.isFinite(Number(canvasHeight))
        ? Number(canvasHeight)
        : null,
      splitEditKey:
        typeof splitEditKey === "string" ? splitEditKey.trim() : "",
      downloaded: Boolean(downloaded),
      copiedAt: nowIso,
    };

    historyEntries = [entry, ...historyEntries];
  }

  persistHistory();
  renderHistory();
}

function renderHistory() {
  historyGalleryList.innerHTML = "";
  historySingleList.innerHTML = "";
  historyList.classList.toggle("hidden", Boolean(activeHistoryGalleryId));
  historyHeader.classList.toggle(
    "history-header--gallery",
    Boolean(activeHistoryGalleryId),
  );
  historyGalleryHeaderBar.classList.toggle("hidden", !activeHistoryGalleryId);
  historyHeaderTitleEditBtn.classList.toggle("hidden", !activeHistoryGalleryId);
  historyHeaderSubtitleEditBtn.classList.toggle(
    "hidden",
    !activeHistoryGalleryId,
  );
  if (historySectionToggle) {
    historySectionToggle.classList.toggle(
      "hidden",
      Boolean(activeHistoryGalleryId),
    );
  }
  if (activeHistoryGalleryId) {
    historyEmpty.classList.add("hidden");
  }

  historyEntries.forEach((entry) => {
    const isGalleryEntry = entry?.type === "gallery";
    const item = document.createElement("article");
    item.className = "history-item";
    if (isGalleryEntry) {
      item.classList.add("history-gallery-entry");
    } else {
      item.dataset.singleEditKey = buildImageEditKey(entry, "finder");
    }

    const galleryItems = getGalleryItems(entry);
    let preview = null;
    let previewNode = null;
    if (isGalleryEntry) {
      const stack = document.createElement("div");
      stack.className = "history-gallery-preview-stack";
      const stackItems = galleryItems.slice(0, 4);
      const rotations = [0, -10, 10, -10];

      stackItems.forEach((galleryItem, index) => {
        const layer = document.createElement("img");
        layer.className = "history-gallery-preview-layer";
        layer.src = galleryItem.thumbnailUrl || "";
        layer.alt =
          galleryItem.title ||
          entry.galleryTitle ||
          entry.title ||
          "Gallery preview";
        layer.loading = "lazy";
        layer.decoding = "async";
        layer.style.setProperty("--stack-offset", `${index * 8}px`);
        layer.style.setProperty(
          "--stack-rotate",
          `${rotations[index] || 0}deg`,
        );
        layer.style.zIndex = String(stackItems.length - index);
        stack.appendChild(layer);
      });

      previewNode = stack;
    } else {
      preview = document.createElement("img");
      const rawPreviewUrl = getDisplayImageUrl(entry, "finder");
      preview.src = parseSplitCacheImageUrl(rawPreviewUrl) ? "" : rawPreviewUrl;
      preview.alt = entry.title || "History image";
      preview.loading = "lazy";
      previewNode = preview;

      if (parseSplitCacheImageUrl(rawPreviewUrl)) {
        void resolvePersistedImageUrl(rawPreviewUrl).then((resolvedUrl) => {
          if (resolvedUrl && preview) {
            preview.src = resolvedUrl;
          }
        });
      }
    }

    const meta = document.createElement("div");
    meta.className = "history-meta";

    const infoEl = document.createElement("p");
    if (isGalleryEntry) {
      infoEl.textContent = `${galleryItems.length} image${galleryItems.length === 1 ? "" : "s"}`;
    }

    if (isGalleryEntry) {
      const titleEl = document.createElement("h3");
      titleEl.textContent = entry.galleryTitle || entry.title || "Gallery";

      meta.appendChild(titleEl);
      meta.appendChild(infoEl);
    } else {
      const titleEl = document.createElement("h3");
      titleEl.textContent = entry.title || "Untitled";

      const layoutField = document.createElement("div");
      layoutField.className = "field-row";
      const layoutLabel = document.createElement("label");
      layoutLabel.textContent = "Layout";
      const layoutInput = document.createElement("select");
      layoutInput.innerHTML = `
        <option value="normal">Normal image</option>
        <option value="large">Large image</option>
        <option value="xlarge">Extra large image</option>
        <option value="custom">Custom width image</option>
        <option value="cover">Cover</option>
      `;
      layoutInput.value = entry.layout || "normal";
      layoutField.appendChild(layoutLabel);
      layoutField.appendChild(layoutInput);

      const widthField = document.createElement("div");
      widthField.className = "field-row";
      const widthLabel = document.createElement("label");
      widthLabel.textContent = "Custom width (px)";
      const widthInput = document.createElement("input");
      widthInput.type = "number";
      widthInput.min = "50";
      widthInput.step = "10";
      widthInput.value = "600";
      widthField.appendChild(widthLabel);
      widthField.appendChild(widthInput);

      const textEl = document.createElement("textarea");
      textEl.rows = 4;
      textEl.readOnly = true;

      const refreshSingleVaultShortcode = () => {
        const nextLayout = layoutInput.value || "normal";
        const generated = buildShortcodeForImage(entry, {
          layout: nextLayout,
          customWidth: widthInput.value,
          caption: entry.caption || "",
        });

        widthField.classList.toggle("hidden", nextLayout !== "custom");
        textEl.value = generated || "";
        updateHistoryEntryFields(entry.id, {
          layout: nextLayout,
          copiedText: textEl.value,
        });
      };

      layoutInput.addEventListener("change", refreshSingleVaultShortcode);
      widthInput.addEventListener("input", refreshSingleVaultShortcode);
      refreshSingleVaultShortcode();

      meta.appendChild(titleEl);
      meta.appendChild(infoEl);
      meta.appendChild(layoutField);
      meta.appendChild(widthField);
      meta.appendChild(textEl);
    }

    const actions = document.createElement("div");
    actions.className = "button-row";

    if (isGalleryEntry) {
      const openBtn = document.createElement("button");
      openBtn.type = "button";
      setButtonIconLabel(openBtn, "fa-solid fa-folder-open", "Open gallery");
      openBtn.dataset.openGalleryHistoryId = entry.id;
      actions.appendChild(openBtn);
    } else {
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      setButtonIconLabel(editBtn, "fa-solid fa-pen", "Edit");
      editBtn.dataset.editHistoryId = entry.id;

      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      setButtonIconLabel(copyBtn, "fa-solid fa-copy", "Copy");
      copyBtn.dataset.copyHistoryId = entry.id;

      const redownloadBtn = document.createElement("button");
      redownloadBtn.type = "button";
      setButtonIconLabel(redownloadBtn, "fa-solid fa-rotate", "Re-download");
      redownloadBtn.dataset.redownloadHistoryId = entry.id;
      if (!entry.imageUrl) {
        redownloadBtn.disabled = true;
        redownloadBtn.title = "Unavailable for older history items";
      }

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      setButtonIconLabel(removeBtn, "fa-solid fa-trash", "Remove");
      removeBtn.dataset.removeHistoryId = entry.id;

      const actionMenu = document.createElement("div");
      actionMenu.className = "history-gallery-export-menu";

      const actionMenuButton = document.createElement("button");
      actionMenuButton.type = "button";
      setButtonIconLabel(actionMenuButton, "fa-solid fa-ellipsis", "Actions");

      const actionMenuPopover = document.createElement("div");
      actionMenuPopover.className = "history-gallery-export-menu-popover";
      actionMenuPopover.appendChild(editBtn);
      actionMenuPopover.appendChild(copyBtn);
      actionMenuPopover.appendChild(redownloadBtn);
      actionMenuPopover.appendChild(removeBtn);

      actionMenu.appendChild(actionMenuButton);
      actionMenu.appendChild(actionMenuPopover);
      actions.appendChild(actionMenu);

      ensurePreviewForImage(
        entry,
        "finder",
        (nextPreviewUrl) => {
          preview.src = nextPreviewUrl;
        },
        { allowForegroundRebuild: false },
      );
    }

    if (isGalleryEntry) {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      setButtonIconLabel(removeBtn, "fa-solid fa-trash", "Delete");
      removeBtn.dataset.removeHistoryId = entry.id;
      actions.appendChild(removeBtn);
    }
    meta.appendChild(actions);
    item.appendChild(previewNode);
    item.appendChild(meta);

    if (isGalleryEntry) {
      historyGalleryList.appendChild(item);
    } else {
      historySingleList.appendChild(item);
    }
  });

  const galleryCount = historyGalleryList.childElementCount;
  const singleCount = historySingleList.childElementCount;
  const hasAnyEntries = galleryCount + singleCount > 0;
  const showsGallerySection = historySectionMode === "gallery";
  const hasEntriesForActiveMode = showsGallerySection
    ? galleryCount > 0
    : singleCount > 0;

  if (historyGallerySection) {
    historyGallerySection.classList.toggle("hidden", !showsGallerySection);
  }
  if (historySingleSection) {
    historySingleSection.classList.toggle("hidden", showsGallerySection);
  }

  historyList.classList.toggle(
    "hidden",
    Boolean(activeHistoryGalleryId) || !hasEntriesForActiveMode,
  );
  historyEmpty.classList.toggle(
    "hidden",
    Boolean(activeHistoryGalleryId) || hasEntriesForActiveMode,
  );

  if (!hasAnyEntries) {
    historyEmpty.textContent =
      "Your vault is empty. Copy or download an item to save it here.";
  } else if (showsGallerySection) {
    historyEmpty.textContent =
      "No galleries yet. Save a gallery from Finder to see it here.";
  } else {
    historyEmpty.textContent =
      "No previously used items yet. Copy or download an item to save it here.";
  }

  updateHistorySectionToggleUi();

  historyList.querySelectorAll("[data-edit-history-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const entryId = button.getAttribute("data-edit-history-id");
      openSingleVaultEditor(entryId);
    });
  });

  historyList
    .querySelectorAll("[data-open-gallery-history-id]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const entryId = button.getAttribute("data-open-gallery-history-id");
        openHistoryGalleryInspector(entryId);
      });
    });

  historyList.querySelectorAll("[data-copy-history-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const entryId = button.getAttribute("data-copy-history-id");
      const entry = historyEntries.find((item) => item.id === entryId);
      if (!entry) {
        return;
      }

      if (entry.type === "gallery") {
        const text = buildAllGalleryShortcodes(entry);
        if (!text) {
          setStatus("This gallery has no images to export.");
          return;
        }

        updateHistoryEntry(entry.id, { copiedText: text });
        await copyToClipboard(text, "Gallery export copied.");
        return;
      }

      await copyToClipboard(entry.copiedText, "Vault item copied.");
    });
  });

  historyList
    .querySelectorAll("[data-redownload-history-id]")
    .forEach((button) => {
      button.addEventListener("click", async () => {
        const entryId = button.getAttribute("data-redownload-history-id");
        const entry = historyEntries.find((item) => item.id === entryId);
        if (!entry?.imageUrl || downloadingHistoryId) {
          return;
        }

        downloadingHistoryId = entryId;
        button.disabled = true;
        setButtonIconLabel(button, "fa-solid fa-spinner", "Preparing...");
        setStatus("Preparing optimized image download from history...");

        try {
          const { sourceUrl, isEdited } =
            await resolveDownloadSourceUrlForImage(entry, "finder");
          if (!sourceUrl) {
            throw new Error(
              "No downloadable source URL available for history entry.",
            );
          }

          const { blob, width } = await optimizeImageForDownload(sourceUrl);
          const fileName = normalizeFileNameForExport(
            entry.fileName || "wikimedia-image",
          );
          const savedToFolder = await exportBlob(blob, fileName);
          markHistoryEntryDownloaded(entryId);
          const kb = Math.round(blob.size / 1024);
          const widthLabel = isEdited ? "edited" : `${width}px`;
          const message = savedToFolder
            ? `Saved ${fileName} to ${exportDirectoryName} (${widthLabel}, ${kb}KB).`
            : `Downloaded ${fileName} (${widthLabel}, ${kb}KB).`;
          showActionToast(message);
          setStatus(message);
        } catch (error) {
          console.error(error);
          setStatus("History re-download failed. Try another item.");
        } finally {
          downloadingHistoryId = null;
          renderHistory();
        }
      });
    });

  historyList.querySelectorAll("[data-remove-history-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const entryId = button.getAttribute("data-remove-history-id");
      removeHistoryEntry(entryId);
    });
  });

  if (activeHistoryGalleryId) {
    const activeEntry = historyEntries.find(
      (item) => item.id === activeHistoryGalleryId,
    );
    if (activeEntry?.type === "gallery") {
      renderHistoryGalleryInspector(activeEntry);
    } else {
      closeHistoryGalleryInspector();
    }
  }
}

function getGalleryItems(entry) {
  if (!entry || !Array.isArray(entry.galleryItems)) {
    return [];
  }

  return entry.galleryItems
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      pageId: item.pageId,
      title: typeof item.title === "string" ? item.title : "",
      thumbnailUrl:
        typeof item.thumbnailUrl === "string" ? item.thumbnailUrl : "",
      imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : "",
      fileName: typeof item.fileName === "string" ? item.fileName : "",
      relativePath:
        typeof item.relativePath === "string" ? item.relativePath : "",
      author: typeof item.author === "string" ? item.author : "",
      licenseShort:
        typeof item.licenseShort === "string" ? item.licenseShort : "",
      description: typeof item.description === "string" ? item.description : "",
      draftCaption:
        typeof item.draftCaption === "string" ? item.draftCaption : "",
      draftLayout: typeof item.draftLayout === "string" ? item.draftLayout : "",
      draftCustomWidth: Number.parseInt(item.draftCustomWidth, 10),
    }));
}

function historyGalleryDraftKey(entryId, pageId, index) {
  const pageToken =
    pageId !== undefined && pageId !== null ? String(pageId) : `index-${index}`;
  return `${entryId}:${pageToken}`;
}

function getHistoryGalleryDraft(entry, item, index) {
  const key = historyGalleryDraftKey(entry.id, item.pageId, index);
  const existing = historyGalleryDrafts.get(key);
  if (existing) {
    return existing;
  }

  const draft = {
    caption: typeof item.draftCaption === "string" ? item.draftCaption : "",
    layout: ["normal", "large", "xlarge", "custom", "cover"].includes(
      item.draftLayout,
    )
      ? item.draftLayout
      : "normal",
    customWidth:
      Number.isFinite(item.draftCustomWidth) && item.draftCustomWidth > 0
        ? item.draftCustomWidth
        : 600,
  };
  historyGalleryDrafts.set(key, draft);
  return draft;
}

function persistHistoryGalleryDraft(entryId, item, index, draft) {
  if (!entryId || !item || !draft) {
    return;
  }

  let changed = false;
  historyEntries = historyEntries.map((entry) => {
    if (
      entry.id !== entryId ||
      entry.type !== "gallery" ||
      !Array.isArray(entry.galleryItems)
    ) {
      return entry;
    }

    const nextGalleryItems = entry.galleryItems.map(
      (galleryItem, galleryIndex) => {
        const samePage =
          item.pageId !== undefined && item.pageId !== null
            ? galleryItem.pageId === item.pageId
            : false;
        const sameIndex =
          item.pageId === undefined || item.pageId === null
            ? galleryIndex === index
            : false;

        if (!samePage && !sameIndex) {
          return galleryItem;
        }

        const nextCaption =
          typeof draft.caption === "string" ? draft.caption : "";
        const nextLayout = [
          "normal",
          "large",
          "xlarge",
          "custom",
          "cover",
        ].includes(draft.layout)
          ? draft.layout
          : "normal";
        const parsedWidth = Number.parseInt(draft.customWidth, 10);
        const nextWidth =
          Number.isFinite(parsedWidth) && parsedWidth > 0 ? parsedWidth : 600;

        if (
          galleryItem.draftCaption === nextCaption &&
          galleryItem.draftLayout === nextLayout &&
          Number.parseInt(galleryItem.draftCustomWidth, 10) === nextWidth
        ) {
          return galleryItem;
        }

        changed = true;
        return {
          ...galleryItem,
          draftCaption: nextCaption,
          draftLayout: nextLayout,
          draftCustomWidth: nextWidth,
        };
      },
    );

    return changed
      ? {
          ...entry,
          galleryItems: nextGalleryItems,
        }
      : entry;
  });

  if (changed) {
    persistHistory();
  }
}

function buildHistoryGalleryItemShortcode(item, draft) {
  const caption = buildCaption(draft.caption, item);
  const context = getActiveHistoryGalleryContext();
  const entryForPath =
    context?.entry?.type === "gallery" ? context.entry : null;
  const relativePath = getGalleryRelativePathForShortcode(entryForPath, item);
  return buildShortcodeForImage(item, {
    layout: draft.layout,
    customWidth: draft.customWidth,
    caption,
    relativePath,
  });
}

function buildAllGalleryShortcodes(entry) {
  const items = getGalleryItems(entry);
  if (!items.length) {
    return "";
  }

  return items
    .map((item, index) => {
      const draft = getHistoryGalleryDraft(entry, item, index);
      return buildHistoryGalleryItemShortcode(item, draft);
    })
    .join("\n");
}

function buildAllGalleryCaptions(entry) {
  const items = getGalleryItems(entry);
  if (!items.length) {
    return "";
  }

  return items
    .map((item, index) => {
      const draft = getHistoryGalleryDraft(entry, item, index);
      const shortcode = buildHistoryGalleryItemShortcode(item, draft);
      return shortcode.replace(/\s*\n\s*/g, " ").trim();
    })
    .join("\n\n");
}

function openHistoryGalleryInspector(entryId, { syncHash = true } = {}) {
  const entry = historyEntries.find((item) => item.id === entryId);
  if (!entry || entry.type !== "gallery") {
    return false;
  }

  historySectionMode = "gallery";
  activeHistoryGalleryId = entry.id;
  activeViewName = "history";
  historyList.classList.add("hidden");
  historyEmpty.classList.add("hidden");
  if (historySectionToggle) {
    historySectionToggle.classList.add("hidden");
  }
  historyHeader.classList.add("history-header--gallery");
  historyGalleryHeaderBar.classList.remove("hidden");
  historyHeaderTitleEditBtn.classList.remove("hidden");
  historyHeaderSubtitleEditBtn.classList.remove("hidden");
  if (typeof activeHistoryGalleryItemIndex !== "number") {
    activeHistoryGalleryItemIndex = 0;
  }
  renderHistoryGalleryInspector(entry);
  updateTopTabIndicators();

  if (syncHash) {
    syncHashWithUi();
  }

  return true;
}

function closeHistoryGalleryInspector({ syncHash = true } = {}) {
  activeHistoryGalleryId = null;
  activeHistoryGalleryItemIndex = null;
  draggedHistoryGalleryIndex = null;
  historyGalleryInspector.classList.add("hidden");
  resetHistoryHeaderDefaultText();
  historyGalleryItems.innerHTML = "";
  historyGalleryMeta.textContent = "";
  historyGalleryDetails.classList.add("hidden");
  historyGalleryDetailsEmpty.classList.remove("hidden");
  historyGalleryPreview.removeAttribute("src");
  historyGalleryItemTitle.textContent = "";
  historyGalleryCaptionInput.value = "";
  historyGalleryShortcodeOutput.value = "";
  historyGalleryLayoutSelect.value = "normal";
  historyGalleryWidthInput.value = "600";
  historyGalleryWidthRow.classList.add("hidden");
  clearHistoryHeaderEditableState(historyHeaderTitle);
  clearHistoryHeaderEditableState(historyHeaderSubtitle);
  setHistoryGalleryExportingState(false);
  renderHistory();

  if (syncHash) {
    syncHashWithUi();
  }
}

function setHistorySectionMode(mode) {
  const nextMode = mode === "gallery" ? "gallery" : "single";
  if (historySectionMode === nextMode) {
    updateHistorySectionToggleUi();
    return;
  }

  historySectionMode = nextMode;
  renderHistory();
}

function updateHistorySectionToggleUi() {
  const showsGallerySection = historySectionMode === "gallery";

  historyShowGalleriesBtn.classList.toggle("active-tab", showsGallerySection);
  historyShowSingleBtn.classList.toggle("active-tab", !showsGallerySection);
  historyShowGalleriesBtn.setAttribute(
    "aria-pressed",
    String(showsGallerySection),
  );
  historyShowSingleBtn.setAttribute(
    "aria-pressed",
    String(!showsGallerySection),
  );
}

function renderHistoryGalleryInspector(entry) {
  const items = getGalleryItems(entry);
  historyGalleryInspector.classList.remove("hidden");
  applyHistoryGalleryHeaderText(entry);
  historyGalleryItems.innerHTML = "";

  if (!items.length) {
    activeHistoryGalleryItemIndex = null;
    historyGalleryDetails.classList.add("hidden");
    historyGalleryDetailsEmpty.classList.remove("hidden");
    historyGalleryExportAllBtn.disabled = true;
    historyGalleryCopyAllCaptionsBtn.disabled = true;
    stopHistoryGalleryAutoScroll();
    return;
  }

  historyGalleryCopyAllCaptionsBtn.disabled = false;
  setHistoryGalleryExportingState(exportingHistoryGalleryImages);
  updateHistoryGalleryExportAllButtonLabel();
  const selectedIndex = Number.isInteger(activeHistoryGalleryItemIndex)
    ? Math.max(0, Math.min(activeHistoryGalleryItemIndex, items.length - 1))
    : 0;
  activeHistoryGalleryItemIndex = selectedIndex;

  items.forEach((item, index) => {
    const thumb = document.createElement("li");
    thumb.className = "history-gallery-thumb";
    thumb.dataset.galleryIndex = String(index);
    thumb.tabIndex = 0;
    thumb.draggable = true;
    let pendingLongPressTimer = null;
    let touchStartPoint = null;
    let touchDragActive = false;
    thumb.classList.toggle("active", index === selectedIndex);

    const dragHandle = document.createElement("span");
    dragHandle.className = "history-gallery-drag-handle";
    dragHandle.title = "Drag to reorder";
    dragHandle.setAttribute("aria-hidden", "true");
    dragHandle.textContent = "⋮⋮";

    const preview = document.createElement("img");
    preview.src = item.thumbnailUrl || "";
    preview.alt = item.title || "Gallery image";
    preview.loading = "lazy";

    const title = document.createElement("p");
    title.textContent = item.title || "Untitled";

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "history-gallery-thumb-remove";
    removeBtn.textContent = "×";
    removeBtn.title = "Remove image from gallery";

    thumb.appendChild(dragHandle);
    thumb.appendChild(preview);
    thumb.appendChild(title);
    thumb.appendChild(removeBtn);

    thumb.addEventListener("click", () => {
      selectHistoryGalleryItem(entry.id, index);
    });

    thumb.addEventListener("keydown", (event) => {
      if (
        event.altKey &&
        (event.key === "ArrowUp" || event.key === "ArrowDown")
      ) {
        event.preventDefault();
        const delta = event.key === "ArrowUp" ? -1 : 1;
        moveHistoryGalleryItem(entry.id, index, index + delta);
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectHistoryGalleryItem(entry.id, index);
      }
    });

    thumb.addEventListener("touchstart", (event) => {
      if (event.target.closest(".history-gallery-thumb-remove")) {
        return;
      }

      const touch = event.touches?.[0];
      touchStartPoint = touch ? { x: touch.clientX, y: touch.clientY } : null;

      if (pendingLongPressTimer) {
        window.clearTimeout(pendingLongPressTimer);
      }

      pendingLongPressTimer = window.setTimeout(() => {
        touchDragActive = true;
        startTouchHistoryGalleryDrag(event, entry.id, index);
      }, MOBILE_DRAG_LONG_PRESS_MS);
    });

    thumb.addEventListener("touchmove", (event) => {
      const touch = event.touches?.[0];
      if (!touch) {
        return;
      }

      if (!touchDragActive && touchStartPoint) {
        const distance = Math.hypot(
          touch.clientX - touchStartPoint.x,
          touch.clientY - touchStartPoint.y,
        );
        if (distance > MOBILE_DRAG_CANCEL_MOVE_PX && pendingLongPressTimer) {
          window.clearTimeout(pendingLongPressTimer);
          pendingLongPressTimer = null;
        }
      }

      if (touchDragActive) {
        event.preventDefault();
        updateHistoryGalleryAutoScroll(touch.clientY);
        updateTouchHistoryGalleryDrag(event);
      }
    });

    thumb.addEventListener("touchend", () => {
      if (pendingLongPressTimer) {
        window.clearTimeout(pendingLongPressTimer);
        pendingLongPressTimer = null;
      }

      if (touchDragActive) {
        finishTouchHistoryGalleryDrag(entry.id);
      }

      stopHistoryGalleryAutoScroll();
      touchDragActive = false;
      touchStartPoint = null;
    });

    thumb.addEventListener("touchcancel", () => {
      if (pendingLongPressTimer) {
        window.clearTimeout(pendingLongPressTimer);
        pendingLongPressTimer = null;
      }
      touchDragActive = false;
      touchStartPoint = null;
      stopHistoryGalleryAutoScroll();
      cancelTouchHistoryGalleryDrag();
    });

    removeBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      removeImageFromHistoryGallery(entry.id, index);
    });

    thumb.addEventListener("dragstart", (event) => {
      if (event.target.closest(".history-gallery-thumb-remove")) {
        event.preventDefault();
        return;
      }

      draggedHistoryGalleryIndex = index;
      thumb.classList.add("dragging");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(index));
      }
    });

    thumb.addEventListener("dragend", () => {
      if (pendingLongPressTimer) {
        window.clearTimeout(pendingLongPressTimer);
        pendingLongPressTimer = null;
      }
      touchDragActive = false;
      touchStartPoint = null;
      draggedHistoryGalleryIndex = null;
      stopHistoryGalleryAutoScroll();
      historyGalleryItems
        .querySelectorAll(".history-gallery-thumb")
        .forEach((node) => {
          node.classList.remove(
            "dragging",
            "drag-over",
            "drag-over-before",
            "drag-over-after",
          );
        });
    });

    thumb.addEventListener("dragover", (event) => {
      if (!Number.isInteger(draggedHistoryGalleryIndex)) {
        return;
      }

      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
      updateHistoryGalleryAutoScroll(event.clientY);
      updateHistoryGalleryDropIndicator(thumb, event.clientY);
    });

    thumb.addEventListener("dragleave", (event) => {
      if (!thumb.contains(event.relatedTarget)) {
        thumb.classList.remove(
          "drag-over",
          "drag-over-before",
          "drag-over-after",
        );
      }
    });

    thumb.addEventListener("drop", (event) => {
      event.preventDefault();
      updateHistoryGalleryDropIndicator(thumb, event.clientY);

      const fromData = Number.parseInt(
        event.dataTransfer?.getData("text/plain"),
        10,
      );
      const fromIndex = Number.isInteger(fromData)
        ? fromData
        : draggedHistoryGalleryIndex;

      const dropTarget = getHistoryGalleryDropTarget();
      const toIndex = Number.isInteger(dropTarget?.overIndex)
        ? computeHistoryGalleryDropIndex(
            fromIndex,
            dropTarget.overIndex,
            dropTarget.placeAfter,
          )
        : index;

      if (
        !Number.isInteger(fromIndex) ||
        !Number.isInteger(toIndex) ||
        fromIndex === toIndex
      ) {
        stopHistoryGalleryAutoScroll();
        return;
      }

      moveHistoryGalleryItem(entry.id, fromIndex, toIndex);
      stopHistoryGalleryAutoScroll();
    });

    historyGalleryItems.appendChild(thumb);
  });

  renderHistoryGalleryDetails(entry, selectedIndex);
}

function selectHistoryGalleryItem(entryId, index) {
  const entry = historyEntries.find((item) => item.id === entryId);
  if (!entry || entry.type !== "gallery") {
    return;
  }

  const items = getGalleryItems(entry);
  if (!items.length || index < 0 || index >= items.length) {
    return;
  }

  activeHistoryGalleryItemIndex = index;

  historyGalleryItems
    .querySelectorAll(".history-gallery-thumb")
    .forEach((thumbEl) => {
      const thumbIndex = Number.parseInt(
        thumbEl.dataset.galleryIndex || "",
        10,
      );
      thumbEl.classList.toggle("active", thumbIndex === index);
    });

  renderHistoryGalleryDetails(entry, index);
}

function getActiveHistoryGalleryContext() {
  if (
    !activeHistoryGalleryId ||
    !Number.isInteger(activeHistoryGalleryItemIndex)
  ) {
    return null;
  }

  const entry = historyEntries.find(
    (item) => item.id === activeHistoryGalleryId,
  );
  if (!entry || entry.type !== "gallery") {
    return null;
  }

  const items = getGalleryItems(entry);
  if (!items.length) {
    return null;
  }

  const index = Math.max(
    0,
    Math.min(activeHistoryGalleryItemIndex, items.length - 1),
  );
  const item = items[index];
  const draft = getHistoryGalleryDraft(entry, item, index);

  return {
    entry,
    item,
    index,
    draft,
  };
}

function renderHistoryGalleryDetails(entry, index) {
  const items = getGalleryItems(entry);
  if (!items.length || index < 0 || index >= items.length) {
    historyGalleryDetails.classList.add("hidden");
    historyGalleryDetailsEmpty.classList.remove("hidden");
    return;
  }

  const item = items[index];
  const draft = getHistoryGalleryDraft(entry, item, index);

  historyGalleryDetailsEmpty.classList.add("hidden");
  historyGalleryDetails.classList.remove("hidden");
  historyGalleryPreview.src = getDisplayImageUrl(item, `gallery:${entry.id}`);
  historyGalleryItemTitle.textContent = item.title || "Untitled";
  historyGalleryCaptionInput.value = draft.caption || "";
  historyGalleryLayoutSelect.value = draft.layout || "normal";
  historyGalleryWidthInput.value = String(draft.customWidth || 600);

  const selectedGalleryKey = buildImageEditKey(item, `gallery:${entry.id}`);
  ensurePreviewForImage(
    item,
    `gallery:${entry.id}`,
    (previewUrl) => {
      const context = getActiveHistoryGalleryContext();
      if (!context?.item || !context?.entry) {
        return;
      }

      const activeKey = buildImageEditKey(
        context.item,
        `gallery:${context.entry.id}`,
      );
      if (activeKey !== selectedGalleryKey) {
        return;
      }

      historyGalleryPreview.src = previewUrl;
    },
    { allowForegroundRebuild: true },
  );

  refreshActiveHistoryGalleryShortcode();
}

function refreshActiveHistoryGalleryShortcode() {
  const context = getActiveHistoryGalleryContext();
  if (!context) {
    historyGalleryShortcodeOutput.value = "";
    historyGalleryWidthRow.classList.add("hidden");
    return;
  }

  const { entry, item, index, draft } = context;
  draft.caption = historyGalleryCaptionInput.value || "";
  draft.layout = historyGalleryLayoutSelect.value || "normal";
  const parsedWidth = Number.parseInt(historyGalleryWidthInput.value, 10);
  draft.customWidth =
    Number.isFinite(parsedWidth) && parsedWidth > 0 ? parsedWidth : 600;

  persistHistoryGalleryDraft(entry.id, item, index, draft);

  historyGalleryWidthRow.classList.toggle("hidden", draft.layout !== "custom");
  historyGalleryShortcodeOutput.value = buildHistoryGalleryItemShortcode(
    item,
    draft,
  );
}

async function copyActiveHistoryGalleryShortcode() {
  refreshActiveHistoryGalleryShortcode();
  await copyToClipboard(historyGalleryShortcodeOutput.value, "Copied.");
}

function removeImageFromHistoryGallery(entryId, removeIndex) {
  const entry = historyEntries.find((item) => item.id === entryId);
  if (
    !entry ||
    entry.type !== "gallery" ||
    !Array.isArray(entry.galleryItems)
  ) {
    return;
  }

  if (removeIndex < 0 || removeIndex >= entry.galleryItems.length) {
    return;
  }

  const nextGalleryItems = entry.galleryItems.filter(
    (_, index) => index !== removeIndex,
  );
  updateHistoryEntryFields(entryId, { galleryItems: nextGalleryItems });

  const previousIndex = Number.isInteger(activeHistoryGalleryItemIndex)
    ? activeHistoryGalleryItemIndex
    : 0;

  if (nextGalleryItems.length === 0) {
    activeHistoryGalleryItemIndex = null;
    renderHistory();
    setStatus("Image removed from gallery.");
    return;
  }

  if (previousIndex > removeIndex) {
    activeHistoryGalleryItemIndex = previousIndex - 1;
  } else if (previousIndex >= nextGalleryItems.length) {
    activeHistoryGalleryItemIndex = nextGalleryItems.length - 1;
  } else {
    activeHistoryGalleryItemIndex = previousIndex;
  }

  renderHistory();
  setStatus("Image removed from gallery.");
}

function moveHistoryGalleryItem(entryId, fromIndex, toIndex) {
  const entry = historyEntries.find((item) => item.id === entryId);
  if (
    !entry ||
    entry.type !== "gallery" ||
    !Array.isArray(entry.galleryItems) ||
    !entry.galleryItems.length
  ) {
    return;
  }

  const maxIndex = entry.galleryItems.length - 1;
  const sourceIndex = Math.max(0, Math.min(fromIndex, maxIndex));
  const targetIndex = Math.max(0, Math.min(toIndex, maxIndex));
  if (sourceIndex === targetIndex) {
    return;
  }

  const nextGalleryItems = [...entry.galleryItems];
  const [movedItem] = nextGalleryItems.splice(sourceIndex, 1);
  nextGalleryItems.splice(targetIndex, 0, movedItem);

  updateHistoryEntryFields(entryId, { galleryItems: nextGalleryItems });
  activeHistoryGalleryItemIndex = targetIndex;
  renderHistory();
  setStatus("Gallery item order updated.");
}

function findHistoryGalleryThumbFromTouch(touch) {
  if (!touch) {
    return null;
  }

  const node = document.elementFromPoint(touch.clientX, touch.clientY);
  if (!node) {
    return null;
  }

  return node.closest(".history-gallery-thumb");
}

function getHistoryGalleryScrollContainer() {
  return historyGalleryItems.closest(".history-gallery-browser");
}

function runHistoryGalleryAutoScroll() {
  if (!historyGalleryAutoScrollStep) {
    historyGalleryAutoScrollRaf = null;
    return;
  }

  const container = getHistoryGalleryScrollContainer();
  if (!container) {
    stopHistoryGalleryAutoScroll();
    return;
  }

  container.scrollTop += historyGalleryAutoScrollStep;
  historyGalleryAutoScrollRaf = window.requestAnimationFrame(
    runHistoryGalleryAutoScroll,
  );
}

function updateHistoryGalleryAutoScroll(clientY) {
  const container = getHistoryGalleryScrollContainer();
  if (!container || !Number.isFinite(clientY)) {
    stopHistoryGalleryAutoScroll();
    return;
  }

  const rect = container.getBoundingClientRect();
  const topDistance = clientY - rect.top;
  const bottomDistance = rect.bottom - clientY;
  let nextStep = 0;

  if (topDistance < HISTORY_GALLERY_AUTOSCROLL_EDGE_PX) {
    const ratio =
      (HISTORY_GALLERY_AUTOSCROLL_EDGE_PX - Math.max(0, topDistance)) /
      HISTORY_GALLERY_AUTOSCROLL_EDGE_PX;
    nextStep = -Math.max(
      1,
      Math.round(ratio * HISTORY_GALLERY_AUTOSCROLL_MAX_STEP),
    );
  } else if (bottomDistance < HISTORY_GALLERY_AUTOSCROLL_EDGE_PX) {
    const ratio =
      (HISTORY_GALLERY_AUTOSCROLL_EDGE_PX - Math.max(0, bottomDistance)) /
      HISTORY_GALLERY_AUTOSCROLL_EDGE_PX;
    nextStep = Math.max(
      1,
      Math.round(ratio * HISTORY_GALLERY_AUTOSCROLL_MAX_STEP),
    );
  }

  historyGalleryAutoScrollStep = nextStep;

  if (!historyGalleryAutoScrollStep) {
    if (historyGalleryAutoScrollRaf !== null) {
      window.cancelAnimationFrame(historyGalleryAutoScrollRaf);
      historyGalleryAutoScrollRaf = null;
    }
    return;
  }

  if (historyGalleryAutoScrollRaf === null) {
    historyGalleryAutoScrollRaf = window.requestAnimationFrame(
      runHistoryGalleryAutoScroll,
    );
  }
}

function stopHistoryGalleryAutoScroll() {
  historyGalleryAutoScrollStep = 0;
  if (historyGalleryAutoScrollRaf !== null) {
    window.cancelAnimationFrame(historyGalleryAutoScrollRaf);
    historyGalleryAutoScrollRaf = null;
  }
}

function clearHistoryGalleryDropIndicators() {
  historyGalleryItems
    .querySelectorAll(".history-gallery-thumb")
    .forEach((node) => {
      node.classList.remove("drag-over", "drag-over-before", "drag-over-after");
    });
}

function updateHistoryGalleryDropIndicator(targetThumb, clientY) {
  if (!targetThumb || !Number.isInteger(draggedHistoryGalleryIndex)) {
    clearHistoryGalleryDropIndicators();
    return;
  }

  const overIndex = Number.parseInt(targetThumb.dataset.galleryIndex, 10);
  if (
    !Number.isInteger(overIndex) ||
    overIndex === draggedHistoryGalleryIndex
  ) {
    clearHistoryGalleryDropIndicators();
    return;
  }

  clearHistoryGalleryDropIndicators();

  const rect = targetThumb.getBoundingClientRect();
  const midpoint = rect.top + rect.height / 2;
  const placeAfter = clientY >= midpoint;

  if (!placeAfter) {
    targetThumb.classList.add("drag-over", "drag-over-before");
    return;
  }

  const nextThumb = targetThumb.nextElementSibling;
  if (nextThumb?.classList.contains("history-gallery-thumb")) {
    nextThumb.classList.add("drag-over", "drag-over-before");
    return;
  }

  targetThumb.classList.add("drag-over", "drag-over-after");
}

function getHistoryGalleryDropTarget() {
  const targetThumb = historyGalleryItems.querySelector(
    ".history-gallery-thumb.drag-over-before, .history-gallery-thumb.drag-over-after",
  );
  if (!targetThumb) {
    return null;
  }

  const overIndex = Number.parseInt(targetThumb.dataset.galleryIndex, 10);
  if (!Number.isInteger(overIndex)) {
    return null;
  }

  return {
    overIndex,
    placeAfter: targetThumb.classList.contains("drag-over-after"),
  };
}

function computeHistoryGalleryDropIndex(sourceIndex, overIndex, placeAfter) {
  if (!Number.isInteger(sourceIndex) || !Number.isInteger(overIndex)) {
    return null;
  }

  if (placeAfter) {
    return sourceIndex < overIndex ? overIndex : overIndex + 1;
  }

  return sourceIndex < overIndex ? overIndex - 1 : overIndex;
}

function startTouchHistoryGalleryDrag(event, entryId, fromIndex) {
  if (!entryId || !Number.isInteger(fromIndex)) {
    return;
  }

  draggedHistoryGalleryIndex = fromIndex;
  historyGalleryItems
    .querySelectorAll(".history-gallery-thumb")
    .forEach((node) => {
      const index = Number.parseInt(node.dataset.galleryIndex, 10);
      node.classList.toggle("dragging", index === fromIndex);
      node.classList.remove("drag-over", "drag-over-before", "drag-over-after");
    });

  updateTouchHistoryGalleryDrag(event);
}

function updateTouchHistoryGalleryDrag(event) {
  if (!Number.isInteger(draggedHistoryGalleryIndex)) {
    return;
  }

  const touch = event.touches?.[0] || event.changedTouches?.[0];
  const overThumb = findHistoryGalleryThumbFromTouch(touch);
  if (!touch || !overThumb) {
    clearHistoryGalleryDropIndicators();
    return;
  }

  updateHistoryGalleryDropIndicator(overThumb, touch.clientY);
}

function finishTouchHistoryGalleryDrag(entryId) {
  if (!entryId || !Number.isInteger(draggedHistoryGalleryIndex)) {
    cancelTouchHistoryGalleryDrag();
    return;
  }

  const draggingIndex = draggedHistoryGalleryIndex;
  const dropTarget = getHistoryGalleryDropTarget();
  const targetIndex = Number.isInteger(dropTarget?.overIndex)
    ? computeHistoryGalleryDropIndex(
        draggingIndex,
        dropTarget.overIndex,
        dropTarget.placeAfter,
      )
    : null;

  cancelTouchHistoryGalleryDrag();
  stopHistoryGalleryAutoScroll();

  if (!Number.isInteger(targetIndex) || targetIndex === draggingIndex) {
    return;
  }

  moveHistoryGalleryItem(entryId, draggingIndex, targetIndex);
}

function cancelTouchHistoryGalleryDrag() {
  draggedHistoryGalleryIndex = null;
  stopHistoryGalleryAutoScroll();
  historyGalleryItems
    .querySelectorAll(".history-gallery-thumb")
    .forEach((node) => {
      node.classList.remove(
        "dragging",
        "drag-over",
        "drag-over-before",
        "drag-over-after",
      );
    });
}

function handleHistoryGalleryReorderHotkeys(event) {
  if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) {
    return;
  }

  if (activeViewName !== "history" || !activeHistoryGalleryId) {
    return;
  }

  const target = event.target;
  if (
    target instanceof HTMLElement &&
    (target.matches("input, textarea, select") || target.isContentEditable)
  ) {
    return;
  }

  const currentIndex = Number.isInteger(activeHistoryGalleryItemIndex)
    ? activeHistoryGalleryItemIndex
    : 0;
  const delta = event.key === "ArrowUp" ? -1 : 1;

  event.preventDefault();
  moveHistoryGalleryItem(
    activeHistoryGalleryId,
    currentIndex,
    currentIndex + delta,
  );
}

function fillActiveHistoryGalleryDefaultCaption() {
  const context = getActiveHistoryGalleryContext();
  if (!context) {
    setStatus("Select a gallery image first.");
    return;
  }

  const defaultCaption = getDefaultCaptionText(context.item);
  if (!defaultCaption) {
    setStatus("No default caption available for this image.");
    return;
  }

  historyGalleryCaptionInput.value = defaultCaption;
  refreshActiveHistoryGalleryShortcode();
  setStatus("Default caption inserted.");
}

function updateHistoryEntryFields(entryId, updates) {
  if (!entryId || !updates || typeof updates !== "object") {
    return;
  }

  let changed = false;
  historyEntries = historyEntries.map((item) => {
    if (item.id !== entryId) {
      return item;
    }

    const nextItem = {
      ...item,
      ...updates,
    };

    const updateKeys = Object.keys(updates);
    const hasActualUpdate = updateKeys.some(
      (key) => nextItem[key] !== item[key],
    );
    if (!hasActualUpdate) {
      return item;
    }

    changed = true;
    return nextItem;
  });

  if (!changed) {
    return;
  }

  persistHistory();

  if (entryId === activeHistoryGalleryId) {
    const currentEntry = historyEntries.find(
      (item) => item.id === activeHistoryGalleryId,
    );
    if (currentEntry?.type === "gallery") {
      applyHistoryGalleryHeaderText(currentEntry);
    }
  }
}

function setHistoryGalleryExportingState(isExporting) {
  exportingHistoryGalleryImages = isExporting;
  historyGalleryExportAllBtn.disabled = isExporting;
  historyGalleryAddMoreBtn.disabled = isExporting;
  historyGalleryPrefixExportCheckbox.disabled = isExporting;
  historyHeaderTitleEditBtn.disabled = isExporting;
  historyHeaderSubtitleEditBtn.disabled = isExporting;
  updateHistoryGalleryExportAllButtonLabel();
}

function addMoreImagesToHistoryGallery() {
  if (!activeHistoryGalleryId) {
    setStatus("Open a gallery from history first.");
    return;
  }

  const entry = historyEntries.find(
    (item) => item.id === activeHistoryGalleryId,
  );
  if (!entry || entry.type !== "gallery") {
    setStatus("Gallery not found.");
    closeHistoryGalleryInspector();
    return;
  }

  if (!isGalleryMode()) {
    settings = {
      ...settings,
      galleryMode: true,
    };
    saveSettings();
    applyGalleryModeUI();
    galleryModeCheckbox.checked = true;
  }

  const galleryItems = getGalleryItems(entry);
  selectedGalleryItems = new Map(
    galleryItems.map((item) => [
      item.pageId,
      {
        pageId: item.pageId,
        title: item.title,
        thumbnailUrl: item.thumbnailUrl,
        imageUrl: item.imageUrl,
        description: item.description || "",
        author: item.author || "",
        licenseShort: item.licenseShort || "",
      },
    ]),
  );

  currentGalleryHistoryId = entry.id;
  galleryTitleInput.value = entry.galleryTitle || entry.title || "";
  galleryDescriptionInput.value = getHistoryGalleryDescriptionText(entry);
  resetGalleryDoneButtonState();
  updateGallerySelectionList();
  renderResults(currentResults, { append: false });
  showDetails();
  setActiveView("finder");
  setStatus(
    `Finder opened. Gallery loaded with ${galleryItems.length} image${galleryItems.length === 1 ? "" : "s"}; select more images to append.`,
  );
}

function getGallerySlug(entry) {
  const gallerySource = (
    entry?.galleryTitle ||
    entry?.title ||
    "gallery"
  ).trim();
  return slugifyFileName(gallerySource);
}

function getGalleryBaseFileName(item) {
  const fromStored =
    typeof item?.fileName === "string" && item.fileName.trim()
      ? item.fileName.trim()
      : "";
  if (fromStored) {
    return normalizeFileNameForExport(fromStored);
  }

  const originalBase = removeCommonImageExtension(item?.title || "");
  return normalizeFileNameForExport(slugifyFileName(originalBase));
}

function getGalleryRelativePathForShortcode(entry, item) {
  const baseFileName = getGalleryBaseFileName(item);
  const useGalleryFolder = Boolean(historyGalleryPrefixExportCheckbox.checked);
  if (!useGalleryFolder || !entry) {
    return baseFileName;
  }

  const gallerySlug = getGallerySlug(entry);
  return gallerySlug ? `${gallerySlug}/${baseFileName}` : baseFileName;
}

function persistGalleryExportFileNames(entryId, fileNameByIndex) {
  if (
    !entryId ||
    !(fileNameByIndex instanceof Map) ||
    fileNameByIndex.size === 0
  ) {
    return;
  }

  let changed = false;
  historyEntries = historyEntries.map((entry) => {
    if (
      entry.id !== entryId ||
      entry.type !== "gallery" ||
      !Array.isArray(entry.galleryItems)
    ) {
      return entry;
    }

    const nextGalleryItems = entry.galleryItems.map(
      (galleryItem, galleryIndex) => {
        if (!fileNameByIndex.has(galleryIndex)) {
          return galleryItem;
        }

        const nextFileData = fileNameByIndex.get(galleryIndex);
        const nextFileName = nextFileData?.fileName;
        const nextRelativePath = nextFileData?.relativePath;
        if (!nextFileName) {
          return galleryItem;
        }

        if (
          galleryItem.fileName === nextFileName &&
          (galleryItem.relativePath || "") === (nextRelativePath || "")
        ) {
          return galleryItem;
        }

        changed = true;
        return {
          ...galleryItem,
          fileName: nextFileName,
          relativePath:
            typeof nextRelativePath === "string"
              ? nextRelativePath
              : nextFileName,
        };
      },
    );

    if (!changed) {
      return entry;
    }

    return {
      ...entry,
      galleryItems: nextGalleryItems,
    };
  });

  if (changed) {
    persistHistory();
  }
}

async function exportAllHistoryGalleryImages() {
  if (!activeHistoryGalleryId) {
    setStatus("Open a gallery from history first.");
    return;
  }

  const entry = historyEntries.find(
    (item) => item.id === activeHistoryGalleryId,
  );
  if (!entry || entry.type !== "gallery") {
    setStatus("Gallery not found.");
    closeHistoryGalleryInspector();
    return;
  }

  if (exportingHistoryGalleryImages) {
    return;
  }

  const allItems = getGalleryItems(entry);
  const exportItems = allItems
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.imageUrl);

  if (!exportItems.length) {
    setStatus("This gallery has no downloadable images.");
    return;
  }

  const useGalleryPrefix = Boolean(historyGalleryPrefixExportCheckbox.checked);
  const gallerySlug = getGallerySlug(entry);
  const updatedFileNames = new Map();

  setHistoryGalleryExportingState(true);
  setProgressOverlay(
    historyGalleryProgressOverlay,
    "Preparing gallery export…",
  );

  let successCount = 0;
  let failedCount = 0;

  try {
    for (let index = 0; index < exportItems.length; index += 1) {
      const { item, index: originalIndex } = exportItems[index];
      const baseFileName = getGalleryBaseFileName(item);
      const targetRelativePath =
        useGalleryPrefix && gallerySlug
          ? `${gallerySlug}/${baseFileName}`
          : baseFileName;
      const progressMessage = `Exporting image ${index + 1}/${exportItems.length}...`;
      setStatus(progressMessage);
      setProgressOverlay(historyGalleryProgressOverlay, progressMessage);

      try {
        const { sourceUrl } = await resolveDownloadSourceUrlForImage(
          item,
          `gallery:${entry.id}`,
        );
        const exportSourceUrl = sourceUrl || item.imageUrl;
        const { blob } = await optimizeImageForDownload(exportSourceUrl);
        let savedToFolder = false;

        if (useGalleryPrefix && gallerySlug && exportDirectoryHandle) {
          try {
            const hasPermission = await ensureDirectoryPermission(
              exportDirectoryHandle,
            );
            if (hasPermission) {
              const galleryDirHandle =
                await exportDirectoryHandle.getDirectoryHandle(gallerySlug, {
                  create: true,
                });
              const fileHandle = await galleryDirHandle.getFileHandle(
                baseFileName,
                {
                  create: true,
                },
              );
              const writable = await fileHandle.createWritable();
              await writable.write(blob);
              await writable.close();
              savedToFolder = true;
            }
          } catch (error) {
            console.error(error);
          }
        }

        if (!savedToFolder) {
          await exportBlob(blob, baseFileName);
        }

        updatedFileNames.set(originalIndex, {
          fileName: baseFileName,
          relativePath: targetRelativePath,
        });
        successCount += 1;
      } catch (error) {
        console.error(error);
        failedCount += 1;
      }
    }

    persistGalleryExportFileNames(entry.id, updatedFileNames);
    if (updatedFileNames.size > 0) {
      renderHistory();
    }

    const statusText = failedCount
      ? `Exported ${successCount} image${successCount === 1 ? "" : "s"}; ${failedCount} failed.`
      : `Exported ${successCount} image${successCount === 1 ? "" : "s"}.`;

    setStatus(statusText);
    showActionToast(statusText);
  } finally {
    clearProgressOverlay(historyGalleryProgressOverlay);
    setHistoryGalleryExportingState(false);
  }
}

async function copyAllHistoryGalleryCaptions() {
  if (!activeHistoryGalleryId) {
    setStatus("Open a gallery from history first.");
    return;
  }

  const entry = historyEntries.find(
    (item) => item.id === activeHistoryGalleryId,
  );
  if (!entry || entry.type !== "gallery") {
    setStatus("Gallery not found.");
    closeHistoryGalleryInspector();
    return;
  }

  const text = buildAllGalleryCaptions(entry);
  if (!text) {
    setStatus("This gallery has no shortcodes to copy.");
    return;
  }

  updateHistoryEntry(entry.id, { copiedText: text });
  await copyToClipboard(text, "Gallery shortcodes copied.");
}

function updateHistoryEntry(entryId, updates) {
  let changed = false;

  historyEntries = historyEntries.map((item) => {
    if (item.id !== entryId) {
      return item;
    }

    changed = true;
    return {
      ...item,
      ...updates,
    };
  });

  if (!changed) {
    return;
  }

  persistHistory();
  renderHistory();
}

function removeHistoryEntry(entryId) {
  if (!entryId) {
    return;
  }

  const nextEntries = historyEntries.filter((item) => item.id !== entryId);
  if (nextEntries.length === historyEntries.length) {
    return;
  }

  historyEntries = nextEntries;
  if (currentGalleryHistoryId === entryId) {
    currentGalleryHistoryId = null;
  }
  if (activeHistoryGalleryId === entryId) {
    closeHistoryGalleryInspector();
  }
  persistHistory();
  renderHistory();
  setStatus("History item removed.");
}

function markHistoryEntryDownloaded(entryId) {
  if (!entryId) {
    return;
  }

  let changed = false;
  historyEntries = historyEntries.map((item) => {
    if (item.id !== entryId) {
      return item;
    }
    changed = true;
    return {
      ...item,
      downloaded: true,
    };
  });

  if (changed) {
    persistHistory();
  }
}

function loadHistory() {
  return loadHistoryFromLocalStorage();
}

function sanitizeHistoryEntries(parsed) {
  if (!Array.isArray(parsed)) {
    return [];
  }

  const normalizePageId = (value) => {
    const parsedId = Number.parseInt(value, 10);
    return Number.isInteger(parsedId) ? parsedId : null;
  };

  return parsed
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      ...item,
      type: item.type === "gallery" ? "gallery" : "image",
      pageId: normalizePageId(item.pageId),
      title: typeof item.title === "string" ? item.title : "",
      thumbnailUrl:
        typeof item.thumbnailUrl === "string" ? item.thumbnailUrl : "",
      imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : "",
      fileName: typeof item.fileName === "string" ? item.fileName : "",
      layout: typeof item.layout === "string" ? item.layout : "",
      caption: typeof item.caption === "string" ? item.caption : "",
      isSplitScreen: Boolean(item.isSplitScreen),
      splitLayout: Number.isInteger(Number(item.splitLayout))
        ? Number(item.splitLayout)
        : null,
      splitImages: Array.isArray(item.splitImages)
        ? item.splitImages
            .filter((splitItem) => splitItem && typeof splitItem === "object")
            .map((splitItem, splitIndex) => ({
              pageId: normalizePageId(splitItem.pageId),
              title:
                typeof splitItem.title === "string" ? splitItem.title : "",
              thumbnailUrl:
                typeof splitItem.thumbnailUrl === "string"
                  ? splitItem.thumbnailUrl
                  : "",
              imageUrl:
                typeof splitItem.imageUrl === "string" ? splitItem.imageUrl : "",
              index: Number.isInteger(Number(splitItem.index))
                ? Number(splitItem.index)
                : splitIndex,
            }))
        : [],
      canvasWidth: Number.isFinite(Number(item.canvasWidth))
        ? Number(item.canvasWidth)
        : null,
      canvasHeight: Number.isFinite(Number(item.canvasHeight))
        ? Number(item.canvasHeight)
        : null,
      splitEditKey:
        typeof item.splitEditKey === "string" ? item.splitEditKey : "",
      galleryTitle:
        typeof item.galleryTitle === "string" ? item.galleryTitle : "",
      galleryDescription:
        typeof item.galleryDescription === "string"
          ? item.galleryDescription
          : "",
      galleryItems: Array.isArray(item.galleryItems)
        ? item.galleryItems
            .filter(
              (galleryItem) => galleryItem && typeof galleryItem === "object",
            )
            .map((galleryItem) => ({
              pageId: normalizePageId(galleryItem.pageId),
              title:
                typeof galleryItem.title === "string" ? galleryItem.title : "",
              thumbnailUrl:
                typeof galleryItem.thumbnailUrl === "string"
                  ? galleryItem.thumbnailUrl
                  : "",
              imageUrl:
                typeof galleryItem.imageUrl === "string"
                  ? galleryItem.imageUrl
                  : "",
              fileName:
                typeof galleryItem.fileName === "string"
                  ? galleryItem.fileName
                  : "",
              relativePath:
                typeof galleryItem.relativePath === "string"
                  ? galleryItem.relativePath
                  : "",
              author:
                typeof galleryItem.author === "string"
                  ? galleryItem.author
                  : "",
              licenseShort:
                typeof galleryItem.licenseShort === "string"
                  ? galleryItem.licenseShort
                  : "",
              description:
                typeof galleryItem.description === "string"
                  ? galleryItem.description
                  : "",
              draftCaption:
                typeof galleryItem.draftCaption === "string"
                  ? galleryItem.draftCaption
                  : "",
              draftLayout:
                typeof galleryItem.draftLayout === "string"
                  ? galleryItem.draftLayout
                  : "",
              draftCustomWidth: Number.parseInt(
                galleryItem.draftCustomWidth,
                10,
              ),
            }))
        : [],
      copiedText: typeof item.copiedText === "string" ? item.copiedText : "",
      downloaded: Boolean(item.downloaded),
    }));
}

function loadHistoryFromLocalStorage() {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return sanitizeHistoryEntries(parsed);
  } catch {
    return [];
  }
}

async function loadHistoryFromFastStorage() {
  try {
    const db = await openDirectoryDb();
    const value = await new Promise((resolve, reject) => {
      const tx = db.transaction(DIRECTORY_STORE_NAME, "readonly");
      const req = tx
        .objectStore(DIRECTORY_STORE_NAME)
        .get(HISTORY_INDEXED_DB_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    return sanitizeHistoryEntries(value);
  } catch {
    return [];
  }
}

async function saveHistoryToFastStorage(entries) {
  try {
    const db = await openDirectoryDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DIRECTORY_STORE_NAME, "readwrite");
      tx.objectStore(DIRECTORY_STORE_NAME).put(entries, HISTORY_INDEXED_DB_KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error(error);
  }
}

async function initHistoryStorageSync() {
  const fastEntries = await loadHistoryFromFastStorage();
  if (fastEntries.length > 0) {
    historyEntries = fastEntries;
    renderHistory();
    return;
  }

  if (historyEntries.length > 0) {
    await saveHistoryToFastStorage(historyEntries);
  }
}

function persistHistory() {
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(historyEntries));
  void saveHistoryToFastStorage(historyEntries);
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_SETTINGS };
    }

    const parsed = JSON.parse(raw);
    return {
      gridColumns: parseGridColumns(parsed?.gridColumns),
      exportPathLabel:
        typeof parsed?.exportPathLabel === "string"
          ? parsed.exportPathLabel.trim()
          : "",
      photoScanPages: parsePhotoScanPages(parsed?.photoScanPages),
      galleryMode: parseGalleryMode(parsed?.galleryMode),
      splitMode: parseSplitMode(parsed?.splitMode),
      exportMaxWidth: parseExportMaxWidth(parsed?.exportMaxWidth),
      exportTargetKb: parseExportTargetKb(parsed?.exportTargetKb),
      exportFormat: parseExportFormat(parsed?.exportFormat),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

function loadImageEdits() {
  try {
    const raw = localStorage.getItem(IMAGE_EDITS_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const sanitized = {};
    Object.entries(parsed).forEach(([key, value]) => {
      if (!value || typeof value !== "object") {
        return;
      }

      if (typeof value.previewDataUrl === "string" && value.previewDataUrl) {
        imageEditsNeedsCompaction = true;
      }

      const history = Array.isArray(value.history)
        ? value.history
            .map((step) => ({
              x: Number(step?.x),
              y: Number(step?.y),
              width: Number(step?.width),
              height: Number(step?.height),
            }))
            .filter(
              (step) =>
                Number.isFinite(step.x) &&
                Number.isFinite(step.y) &&
                Number.isFinite(step.width) &&
                Number.isFinite(step.height) &&
                step.width > 0 &&
                step.height > 0,
            )
        : [];

      const operations = normalizeEditOperations(
        Array.isArray(value.operations)
          ? value.operations
          : history.map((step) => ({ type: "crop", ...step })),
      );

      if (!operations.length && !history.length) {
        return;
      }

      sanitized[key] = {
        fileName:
          typeof value.fileName === "string" && value.fileName.trim()
            ? value.fileName.trim()
            : "",
        history,
        operations,
        updatedAt: Number.isFinite(Number(value.updatedAt))
          ? Number(value.updatedAt)
          : Date.now(),
      };
    });

    return sanitized;
  } catch {
    return {};
  }
}

function saveImageEdits() {
  try {
    localStorage.setItem(
      IMAGE_EDITS_STORAGE_KEY,
      JSON.stringify(persistedImageEdits),
    );
  } catch {
    setStatus("Could not persist image edits. Storage may be full.");
  }
}

function isDirectoryExportSupported() {
  return typeof window.showDirectoryPicker === "function";
}

async function chooseExportDirectory() {
  if (!isDirectoryExportSupported()) {
    setStatus("Direct folder export is not supported in this browser.");
    return;
  }

  try {
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    const hasPermission = await ensureDirectoryPermission(handle);
    if (!hasPermission) {
      setStatus("Folder access was not granted.");
      return;
    }

    exportDirectoryHandle = handle;
    exportDirectoryName = handle.name || "Selected folder";
    await saveDirectoryHandle(handle);
    updateExportDirectoryUI();
    setStatus(`Export folder set to ${exportDirectoryName}.`);
  } catch (error) {
    if (error?.name === "AbortError") {
      return;
    }
    console.error(error);
    setStatus("Could not set export folder.");
  }
}

async function clearExportDirectory() {
  exportDirectoryHandle = null;
  exportDirectoryName = "";
  await clearDirectoryHandle();
  updateExportDirectoryUI();
  setStatus("Export folder cleared.");
}

function isUnusableFileSystemObjectError(error) {
  return (
    error instanceof DOMException &&
    /not, or is no longer, usable/i.test(error.message || "")
  );
}

function invalidateExportDirectoryHandle() {
  exportDirectoryHandle = null;
  exportDirectoryName = "";
  updateExportDirectoryUI();
  void clearDirectoryHandle();
}

async function exportBlob(blob, fileName) {
  if (!exportDirectoryHandle) {
    triggerDownload(blob, fileName);
    return false;
  }

  try {
    const hasPermission = await ensureDirectoryPermission(
      exportDirectoryHandle,
    );
    if (!hasPermission) {
      triggerDownload(blob, fileName);
      return false;
    }

    const fileHandle = await exportDirectoryHandle.getFileHandle(fileName, {
      create: true,
    });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  } catch (error) {
    console.error(error);
    if (isUnusableFileSystemObjectError(error)) {
      invalidateExportDirectoryHandle();
      setStatus(
        "Export folder handle expired. Falling back to browser download.",
      );
    }
    triggerDownload(blob, fileName);
    return false;
  }
}

async function ensureDirectoryPermission(handle) {
  const query = await handle.queryPermission({ mode: "readwrite" });
  if (query === "granted") {
    return true;
  }

  const requested = await handle.requestPermission({ mode: "readwrite" });
  return requested === "granted";
}

function updateExportDirectoryUI() {
  const pathLabel = settings.exportPathLabel || "";

  if (!isDirectoryExportSupported()) {
    exportFolderSection.classList.add("unsupported");
    exportSupportText.textContent =
      "Direct folder export requires Chrome or Edge. Files will download normally.";
    selectExportDirBtn.disabled = true;
    clearExportDirBtn.disabled = true;
    return;
  }

  exportFolderSection.classList.remove("unsupported");
  exportSupportText.textContent = "";

  if (exportDirectoryHandle && exportDirectoryName) {
    exportDirStatus.textContent = pathLabel
      ? `${exportDirectoryName} • ${pathLabel}`
      : exportDirectoryName;
    clearExportDirBtn.disabled = false;
  } else {
    exportDirStatus.textContent = pathLabel || "No folder set";
    clearExportDirBtn.disabled = true;
  }

  selectExportDirBtn.disabled = false;
}

async function openDirectoryDb() {
  if (directoryDbPromise) {
    return directoryDbPromise;
  }

  directoryDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DIRECTORY_DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DIRECTORY_STORE_NAME)) {
        db.createObjectStore(DIRECTORY_STORE_NAME);
      }
      if (!db.objectStoreNames.contains(PREVIEW_CACHE_STORE_NAME)) {
        db.createObjectStore(PREVIEW_CACHE_STORE_NAME);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        directoryDbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      directoryDbPromise = null;
      reject(request.error);
    };
  });

  return directoryDbPromise;
}

async function saveDirectoryHandle(handle) {
  if (!isDirectoryExportSupported()) {
    return;
  }

  try {
    const db = await openDirectoryDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DIRECTORY_STORE_NAME, "readwrite");
      tx.objectStore(DIRECTORY_STORE_NAME).put(handle, DIRECTORY_HANDLE_KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error(error);
  }
}

async function loadDirectoryHandle() {
  if (!isDirectoryExportSupported()) {
    return null;
  }

  try {
    const db = await openDirectoryDb();
    const value = await new Promise((resolve, reject) => {
      const tx = db.transaction(DIRECTORY_STORE_NAME, "readonly");
      const req = tx
        .objectStore(DIRECTORY_STORE_NAME)
        .get(DIRECTORY_HANDLE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    return value;
  } catch {
    return null;
  }
}

async function clearDirectoryHandle() {
  if (!isDirectoryExportSupported()) {
    return;
  }

  try {
    const db = await openDirectoryDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DIRECTORY_STORE_NAME, "readwrite");
      tx.objectStore(DIRECTORY_STORE_NAME).delete(DIRECTORY_HANDLE_KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error(error);
  }
}

async function initExportDirectory() {
  updateExportDirectoryUI();
  if (!isDirectoryExportSupported()) {
    return;
  }

  const storedHandle = await loadDirectoryHandle();
  if (!storedHandle) {
    return;
  }

  try {
    const permission = await storedHandle.queryPermission({
      mode: "readwrite",
    });
    if (permission === "denied") {
      await clearDirectoryHandle();
      return;
    }

    exportDirectoryHandle = storedHandle;
    exportDirectoryName = storedHandle.name || "Selected folder";
    updateExportDirectoryUI();
  } catch {
    await clearDirectoryHandle();
    exportDirectoryHandle = null;
    exportDirectoryName = "";
    updateExportDirectoryUI();
  }
}

function updateDownloadButtonState() {
  if (downloadingImage) {
    downloadImageBtn.disabled = true;
    setButtonIconLabel(downloadImageBtn, "fa-solid fa-spinner", "Preparing...");
    return;
  }

  if (!selectedImage) {
    downloadImageBtn.disabled = true;
    setButtonIconLabel(
      downloadImageBtn,
      "fa-solid fa-download",
      "Download photo",
    );
    return;
  }

  downloadImageBtn.disabled = false;
  setButtonIconLabel(
    downloadImageBtn,
    "fa-solid fa-download",
    "Download photo",
  );
}

function isSmallScreen() {
  return window.matchMedia("(max-width: 680px)").matches;
}

function setMobileDetailsCollapsed(collapsed) {
  isMobileDetailsCollapsed = collapsed;
  detailsPanel.classList.toggle("mobile-collapsed", collapsed);
  detailsToggleBtn.setAttribute("aria-expanded", String(!collapsed));
  detailsToggleBtn.textContent = collapsed
    ? "Show details panel"
    : "Hide details panel";
}

function syncMobileDetailsState() {
  if (isSmallScreen()) {
    if (isMobileDetailsCollapsed === false && selectedImage) {
      setMobileDetailsCollapsed(false);
      return;
    }

    setMobileDetailsCollapsed(true);
    return;
  }

  detailsPanel.classList.remove("mobile-collapsed");
  detailsToggleBtn.setAttribute("aria-expanded", "true");
  detailsToggleBtn.textContent = "Hide details panel";
}

function loadImageForCanvas(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("Image decode failed for optimization source."));
    image.src = url;
  });
}

async function decodeBlobForCanvas(sourceBlob) {
  if (!(sourceBlob instanceof Blob) || sourceBlob.size === 0) {
    throw new Error("Image source blob is empty.");
  }

  try {
    const bitmap = await createImageBitmap(sourceBlob);
    return {
      drawable: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close(),
    };
  } catch (bitmapError) {
    const blobUrl = URL.createObjectURL(sourceBlob);
    try {
      const image = await loadImageForCanvas(blobUrl);
      return {
        drawable: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        cleanup: () => URL.revokeObjectURL(blobUrl),
      };
    } catch {
      URL.revokeObjectURL(blobUrl);
      throw bitmapError;
    }
  }
}

function yieldToUi() {
  return new Promise((resolve) => {
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => resolve());
      return;
    }

    window.setTimeout(resolve, 0);
  });
}

async function optimizeImageForDownload(imageUrl, options = {}) {
  const onProgress =
    typeof options?.onProgress === "function" ? options.onProgress : null;

  if (onProgress) {
    onProgress("Fetching image for download…");
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Image fetch failed with status ${response.status}`);
  }

  const sourceBlob = await response.blob();
  if (onProgress) {
    onProgress("Decoding image…");
  }
  const source = await decodeBlobForCanvas(sourceBlob);

  try {
    const maxWidth = parseExportMaxWidth(settings.exportMaxWidth);
    const targetBytes = parseExportTargetKb(settings.exportTargetKb) * 1024;
    const exportFormat = getActiveExportFormat();
    const mimeType = getExportMimeType(exportFormat);

    const sourceType = (sourceBlob.type || "").toLowerCase();
    const canPassThrough =
      source.width <= maxWidth &&
      sourceBlob.size <= targetBytes &&
      ((mimeType === "image/png" && sourceType === "image/png") ||
        (mimeType === "image/jpeg" && sourceType === "image/jpeg") ||
        (mimeType === "image/webp" && sourceType === "image/webp"));

    if (canPassThrough) {
      return { blob: sourceBlob, width: source.width };
    }

    let targetWidth = Math.min(source.width, maxWidth);
    let targetHeight = Math.max(
      1,
      Math.round((source.height / source.width) * targetWidth),
    );

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas context unavailable");
    }

    let bestBlob = null;
    let bestWidth = targetWidth;

    const minExportWidth = Math.max(1, Math.min(320, targetWidth));
    const adaptiveQualitySteps = [0.86, 0.72, 0.58];

    while (targetWidth >= minExportWidth) {
      if (onProgress) {
        onProgress(`Optimizing image… ${targetWidth}px`);
      }
      await yieldToUi();

      canvas.width = targetWidth;
      canvas.height = targetHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "medium";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(source.drawable, 0, 0, canvas.width, canvas.height);

      let lastEncodedSize = 0;

      if (mimeType === "image/png") {
        const pngBlob = await canvasToImageBlob(canvas, mimeType);
        lastEncodedSize = pngBlob.size;
        if (!bestBlob || pngBlob.size < bestBlob.size) {
          bestBlob = pngBlob;
          bestWidth = targetWidth;
        }

        if (pngBlob.size <= targetBytes) {
          return { blob: pngBlob, width: targetWidth };
        }
      } else {
        for (const quality of adaptiveQualitySteps) {
          await yieldToUi();
          const encodedBlob = await canvasToImageBlob(
            canvas,
            mimeType,
            quality,
          );
          lastEncodedSize = encodedBlob.size;
          if (!bestBlob || encodedBlob.size < bestBlob.size) {
            bestBlob = encodedBlob;
            bestWidth = targetWidth;
          }

          if (encodedBlob.size <= targetBytes) {
            return { blob: encodedBlob, width: targetWidth };
          }
        }
      }

      const suggestedScale = Math.max(
        0.65,
        Math.min(
          0.9,
          Math.sqrt(targetBytes / Math.max(lastEncodedSize, 1)) * 0.95,
        ),
      );
      const fallbackScale = 0.82;
      const nextWidth = Math.floor(targetWidth * suggestedScale);
      targetWidth =
        Number.isFinite(nextWidth) && nextWidth < targetWidth
          ? nextWidth
          : Math.floor(targetWidth * fallbackScale);
      targetHeight = Math.max(
        1,
        Math.round((source.height / source.width) * targetWidth),
      );
    }

    if (!bestBlob) {
      throw new Error("Could not generate export image output");
    }

    return { blob: bestBlob, width: bestWidth };
  } finally {
    source.cleanup();
  }
}

function canvasToImageBlob(canvas, mimeType, quality = undefined) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to create encoded image blob"));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality,
    );
  });
}

function getImageFileName(image) {
  if (typeof image?.fileName === "string" && image.fileName.trim()) {
    return normalizeFileNameForExport(image.fileName.trim());
  }

  const baseName = removeCommonImageExtension(image?.title || "");
  return normalizeFileNameForExport(slugifyFileName(baseName));
}

function normalizeFileNameForExport(value = "") {
  const cleanBase =
    removeCommonImageExtension((value || "").trim()) || "wikimedia-image";
  const extension = getExportExtension(getActiveExportFormat());
  return `${cleanBase}.${extension}`;
}

function getImageRelativePath(image) {
  if (typeof image?.relativePath === "string" && image.relativePath.trim()) {
    return image.relativePath.trim().replace(/^\/+/, "");
  }

  return getImageFileName(image);
}

function updateShowMoreVisibility() {
  const hasResults = currentResults.length > 0;
  const activeMode = getActiveSortMode();
  const usingPhotoMode = isPhotoDateSortMode(activeMode);

  showMoreBtn.classList.toggle("hidden", !hasResults || usingPhotoMode);
  scanMorePhotoBtn.classList.toggle("hidden", !hasResults || !usingPhotoMode);

  if (!hasResults) {
    showMoreBtn.disabled = true;
    setButtonIconLabel(showMoreBtn, "fa-solid fa-chevron-down", "Show more");
    scanMorePhotoBtn.disabled = true;
    setButtonIconLabel(
      scanMorePhotoBtn,
      "fa-solid fa-arrows-rotate",
      "Scan more",
    );
    return;
  }

  if (scanningPhotoDate) {
    if (usingPhotoMode) {
      scanMorePhotoBtn.disabled = true;
      setButtonIconLabel(
        scanMorePhotoBtn,
        "fa-solid fa-spinner",
        "Scanning...",
      );
    } else {
      showMoreBtn.disabled = true;
      setButtonIconLabel(showMoreBtn, "fa-solid fa-spinner", "Loading...");
    }
    return;
  }

  if (usingPhotoMode) {
    scanMorePhotoBtn.disabled = !nextContinue;
    setButtonIconLabel(
      scanMorePhotoBtn,
      nextContinue ? "fa-solid fa-arrows-rotate" : "fa-solid fa-ban",
      nextContinue ? "Scan more" : "No more to scan",
    );
    return;
  }

  if (loadingMore) {
    showMoreBtn.disabled = true;
    setButtonIconLabel(showMoreBtn, "fa-solid fa-spinner", "Loading...");
    return;
  }

  if (nextContinue) {
    showMoreBtn.disabled = false;
    setButtonIconLabel(showMoreBtn, "fa-solid fa-chevron-down", "Show more");
    return;
  }

  showMoreBtn.disabled = true;
  setButtonIconLabel(showMoreBtn, "fa-solid fa-ban", "No more results");
}

function setPhotoDateScanningState(isScanning) {
  scanningPhotoDate = isScanning;

  if (searchSubmitBtn) {
    searchSubmitBtn.disabled = isScanning;
    setButtonIconLabel(
      searchSubmitBtn,
      isScanning ? "fa-solid fa-spinner" : "fa-solid fa-search",
      isScanning ? "Scanning..." : "Search",
    );
  }

  sortSelect.disabled = isScanning;
  photoDateSortSelect.disabled = isScanning;
  updateShowMoreVisibility();
}

async function copyToClipboard(value, successMessage) {
  if (!value) {
    setStatus("Nothing to copy yet.");
    return false;
  }

  try {
    await navigator.clipboard.writeText(value);
    setStatus(successMessage);
    showActionToast(successMessage);
    return true;
  } catch {
    setStatus("Copy failed. Your browser may block clipboard access.");
    return false;
  }
}

updateWidthVisibility();
updateSplitWidthVisibility();
updateDownloadButtonState();
syncMobileDetailsState();
initializeEditorBackgroundPicker();
settings = loadSettings();
persistedImageEdits = loadImageEdits();
if (imageEditsNeedsCompaction) {
  saveImageEdits();
}
applySettingsToUI();
applyGridColumns();
applyGalleryModeUI();
applySplitModeUI();
historyEntries = loadHistory();
renderHistory();
void initHistoryStorageSync();
window.addEventListener("hashchange", applyRouteFromHash);
applyRouteFromHash();
initExportDirectory();
setStatus("Ready. Search Wikimedia Commons to begin.");
