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

const API_BASE = "https://commons.wikimedia.org/w/api.php";
const SEARCH_LIMIT = 50;
const PHOTO_DATE_SCAN_PAGES_DEFAULT = 6;
const DOWNLOAD_MAX_WIDTH = 1920;
const DOWNLOAD_MAX_BYTES = 150 * 1024;
const EXPORT_WIDTH_MIN = 320;
const EXPORT_WIDTH_MAX = 6000;
const EXPORT_TARGET_KB_MIN = 40;
const EXPORT_TARGET_KB_MAX = 5000;
const EXPORT_FORMATS = ["webp", "jpg", "png"];
const HISTORY_STORAGE_KEY = "wikimediaTool.history.v1";
const SETTINGS_STORAGE_KEY = "wikimediaTool.settings.v1";
const DIRECTORY_DB_NAME = "wikimediaTool.storage";
const DIRECTORY_STORE_NAME = "kv";
const DIRECTORY_HANDLE_KEY = "exportDirectoryHandle";
const DEFAULT_SETTINGS = {
  gridColumns: 3,
  exportPathLabel: "",
  photoScanPages: PHOTO_DATE_SCAN_PAGES_DEFAULT,
  galleryMode: false,
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
const historyList = document.getElementById("historyList");
const historyGalleryList = document.getElementById("historyGalleryList");
const historySingleList = document.getElementById("historySingleList");
const historyEmpty = document.getElementById("historyEmpty");
const historyHeaderSubtitle = document.getElementById("historyHeaderSubtitle");
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
const historyGalleryCloseBtn = document.getElementById(
  "historyGalleryCloseBtn",
);
const historyGalleryDetails = document.getElementById("historyGalleryDetails");
const historyGalleryDetailsEmpty = document.getElementById(
  "historyGalleryDetailsEmpty",
);
const historyGalleryPreview = document.getElementById("historyGalleryPreview");
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
const actionToast = document.getElementById("actionToast");

const emptyState = document.getElementById("emptyState");
const detailsEl = document.getElementById("details");
const detailsPanel = document.querySelector(".details-panel");
const detailsToggleBtn = document.getElementById("detailsToggleBtn");
const detailPreview = document.getElementById("detailPreview");
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
let scanningPhotoDate = false;
let selectedGalleryItems = new Map();
let currentGalleryHistoryId = null;
let gallerySaveTimer = null;
let activeHistoryGalleryId = null;
let activeHistoryGalleryItemIndex = null;
const historyGalleryDrafts = new Map();
let exportingHistoryGalleryImages = false;

detailsToggleBtn.addEventListener("click", () => {
  if (!isSmallScreen()) {
    return;
  }

  setMobileDetailsCollapsed(!isMobileDetailsCollapsed);
});

window.addEventListener("resize", syncMobileDetailsState);

showFinderViewBtn.addEventListener("click", () => setActiveView("finder"));
showHistoryViewBtn.addEventListener("click", () => setActiveView("history"));
historyGalleryCloseBtn.addEventListener("click", closeHistoryGalleryInspector);
historyGalleryExportAllBtn.addEventListener(
  "click",
  exportAllHistoryGalleryImages,
);
historyGalleryCopyAllCaptionsBtn.addEventListener(
  "click",
  copyAllHistoryGalleryCaptions,
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

openSettingsBtn.addEventListener("click", openSettingsPanel);
closeSettingsBtn.addEventListener("click", closeSettingsPanel);
settingsBackdrop.addEventListener("click", closeSettingsPanel);
saveSettingsBtn.addEventListener("click", () => {
  settings = {
    gridColumns: parseGridColumns(gridColumnsSelect.value),
    exportPathLabel: (exportPathInput.value || "").trim(),
    photoScanPages: parsePhotoScanPages(photoScanPagesSelect.value),
    galleryMode: parseGalleryMode(settings.galleryMode),
    exportMaxWidth: parseExportMaxWidth(exportMaxWidthInput.value),
    exportTargetKb: parseExportTargetKb(exportTargetKbInput.value),
    exportFormat: parseExportFormat(exportFormatSelect.value),
  };
  gridColumnsSelect.value = String(settings.gridColumns);
  exportPathInput.value = settings.exportPathLabel;
  photoScanPagesSelect.value = String(settings.photoScanPages);
  galleryModeCheckbox.checked = parseGalleryMode(settings.galleryMode);
  exportMaxWidthInput.value = String(settings.exportMaxWidth);
  exportTargetKbInput.value = String(settings.exportTargetKb);
  exportFormatSelect.value = settings.exportFormat;
  saveSettings();
  applyGridColumns();
  applyGalleryModeUI();
  renderResults(currentResults, { append: false });
  updateExportDirectoryUI();
  setStatus("Settings saved.");
});

galleryModeCheckbox.addEventListener("change", () => {
  const enabled = Boolean(galleryModeCheckbox.checked);
  settings = {
    ...settings,
    galleryMode: enabled,
  };
  saveSettings();
  applyGalleryModeUI();
  renderResults(currentResults, { append: false });
  setStatus(enabled ? "Gallery mode enabled." : "Gallery mode disabled.");
});

selectExportDirBtn.addEventListener("click", chooseExportDirectory);
clearExportDirBtn.addEventListener("click", clearExportDirectory);

galleryTitleInput.addEventListener("input", scheduleGalleryAutoSave);
galleryDescriptionInput.addEventListener("input", scheduleGalleryAutoSave);
galleryDoneBtn.addEventListener("click", finishCurrentGallery);

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

sortSelect.addEventListener("change", () => {
  if (!currentQuery) {
    return;
  }

  clearResults();
  hideDetails();
  setStatus("Applying filters...");

  runSearch({ append: false }).catch((error) => {
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

  try {
    const { blob, width } = await optimizeImageForDownload(
      selectedImage.imageUrl,
    );
    const fileName = getImageFileName(selectedImage);
    const savedToFolder = await exportBlob(blob, fileName);
    const kb = Math.round(blob.size / 1024);
    saveToHistory({
      title: selectedImage.title,
      thumbnailUrl: selectedImage.thumbnailUrl,
      imageUrl: selectedImage.imageUrl,
      fileName,
      copiedText: shortcodeOutput.value || "",
      layout: layoutSelect.value,
      downloaded: true,
    });
    const message = savedToFolder
      ? `Saved ${fileName} to ${exportDirectoryName} (${width}px, ${kb}KB).`
      : `Downloaded ${fileName} (${width}px, ${kb}KB).`;
    showActionToast(message);
    setStatus(message);
  } catch (error) {
    console.error(error);
    setStatus("Download failed. Try another image.");
  } finally {
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
    iiurlwidth: "320",
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

async function runSearch({ append }) {
  const activeSortMode = getActiveSortMode();

  if (isPhotoDateSortMode(activeSortMode)) {
    await runPhotoDateScanSearch({ append });
    return;
  }

  const batch = await fetchSearchBatch(append ? nextContinue : null);
  const parsedResults = batch.results;
  if (Number.isFinite(batch.totalHits)) {
    currentTotalAvailable = batch.totalHits;
  }

  if (!append) {
    currentResults = parsedResults;
    currentResults = sortResultsBySelectedMode(currentResults, activeSortMode);
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
    currentResults = sortResultsBySelectedMode(currentResults, activeSortMode);
    renderResults(currentResults, { append: false });
  }

  nextContinue = batch.continueData;

  updateShowMoreVisibility();
  setSearchStatus();
}

async function runPhotoDateScanSearch({ append }) {
  setPhotoDateScanningState(true);

  const baseResults = append ? [...currentResults] : [];
  const seenIds = new Set(baseResults.map((item) => item.pageId));
  let continueData = append ? nextContinue : null;
  let collected = [];
  let pagesFetched = 0;

  try {
    const scanPages = parsePhotoScanPages(settings.photoScanPages);

    while (pagesFetched < scanPages) {
      const batch = await fetchSearchBatch(continueData);
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

async function fetchSearchBatch(continueData) {
  const response = await fetch(buildSearchUrl(currentQuery, continueData));
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

  if (!append) {
    resultsEl.innerHTML = "";
  }

  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "result-item";
    li.tabIndex = 0;

    if (galleryMode) {
      li.innerHTML = `
        <div class="result-head">
          <input class="result-select" type="checkbox" ${selectedGalleryItems.has(item.pageId) ? "checked" : ""} />
        </div>
        <img src="${escapeAttribute(item.thumbnailUrl)}" alt="${escapeAttribute(item.title)}" loading="lazy" />
        <div class="result-text">
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.licenseShort)}</p>
        </div>
      `;
      li.classList.toggle("active", selectedGalleryItems.has(item.pageId));
    } else {
      li.innerHTML = `
        <img src="${escapeAttribute(item.thumbnailUrl)}" alt="${escapeAttribute(item.title)}" loading="lazy" />
        <div class="result-text">
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.licenseShort)}</p>
        </div>
      `;
    }

    li.addEventListener("click", (event) => {
      if (galleryMode) {
        if (
          event.target instanceof HTMLInputElement &&
          event.target.classList.contains("result-select")
        ) {
          toggleGallerySelection(item.pageId, {
            additive: true,
            forceChecked: event.target.checked,
          });
          event.stopPropagation();
          return;
        }

        const additive = Boolean(event.metaKey || event.ctrlKey);
        toggleGallerySelection(item.pageId, { additive, forceChecked: null });
        return;
      }

      selectImage(item.pageId);
    });

    li.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (galleryMode) {
          toggleGallerySelection(item.pageId, {
            additive: true,
            forceChecked: null,
          });
          return;
        }
        selectImage(item.pageId);
      }
    });

    resultsEl.appendChild(li);
  });
}

function selectImage(pageId) {
  if (isGalleryMode()) {
    toggleGallerySelection(pageId, { additive: false });
    return;
  }

  selectedImage = currentResults.find((item) => item.pageId === pageId) || null;
  if (!selectedImage) return;

  [...resultsEl.children].forEach((node, index) => {
    node.classList.toggle("active", currentResults[index]?.pageId === pageId);
  });

  detailPreview.src = selectedImage.imageUrl;
  detailTitle.textContent = selectedImage.title;
  detailAuthor.textContent = selectedImage.author;
  detailLicense.textContent = selectedImage.licenseShort;
  detailDescription.textContent = selectedImage.description;

  detailImageUrl.href = selectedImage.imageUrl;
  detailImageUrl.textContent = selectedImage.imageUrl;

  detailFilePage.href = selectedImage.pageUrl;
  detailFilePage.textContent = selectedImage.pageUrl;

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
    galleryDetails.classList.remove("hidden");
    updateGallerySelectionList();
  } else {
    galleryDetails.classList.add("hidden");
    emptyState.classList.remove("hidden");
  }
  updateDownloadButtonState();
}

function showDetails() {
  if (isGalleryMode()) {
    emptyState.classList.add("hidden");
    detailsEl.classList.add("hidden");
    galleryDetails.classList.remove("hidden");
    updateGallerySelectionList();
    return;
  }

  galleryDetails.classList.add("hidden");
  emptyState.classList.add("hidden");
  detailsEl.classList.remove("hidden");
}

function setStatus(message) {
  statusEl.textContent = message;
}

function setActiveView(viewName) {
  activeViewName = viewName;
  const isFinder = viewName === "finder";
  finderView.classList.toggle("hidden", !isFinder);
  historyView.classList.toggle("hidden", isFinder);
  updateTopTabIndicators();

  if (!isFinder) {
    renderHistory();
  }
}

function openSettingsPanel() {
  settingsPanel.classList.remove("hidden");
  settingsBackdrop.classList.remove("hidden");
  settingsPanel.setAttribute("aria-hidden", "false");
  applySettingsToUI();
  updateTopTabIndicators();
}

function closeSettingsPanel() {
  settingsPanel.classList.add("hidden");
  settingsBackdrop.classList.add("hidden");
  settingsPanel.setAttribute("aria-hidden", "true");
  updateTopTabIndicators();
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

function applyGridColumns() {
  document.documentElement.style.setProperty(
    "--finder-grid-columns",
    String(settings.gridColumns),
  );
}

function applyGalleryModeUI() {
  if (isGalleryMode()) {
    selectedImage = null;
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
  updateGallerySelectionList();

  if (selectedImage) {
    showDetails();
  } else {
    detailsEl.classList.add("hidden");
    emptyState.classList.remove("hidden");
  }

  updateDownloadButtonState();
}

function toggleGallerySelection(pageId, options = {}) {
  const { additive = false, forceChecked = null } = options;
  const selectedItem = currentResults.find((item) => item.pageId === pageId);
  if (!selectedItem) {
    return;
  }

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
  renderResults(currentResults, { append: false });

  if (isSmallScreen()) {
    setMobileDetailsCollapsed(false);
  }

  scheduleGalleryAutoSave();
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
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => {
      selectedGalleryItems.delete(item.pageId);
      updateGallerySelectionList();
      renderResults(currentResults, { append: false });
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

  selectedGalleryItems.clear();
  currentGalleryHistoryId = null;
  galleryTitleInput.value = "";
  galleryDescriptionInput.value = "";

  updateGallerySelectionList();
  renderResults(currentResults, { append: false });
  showDetails();

  setStatus(
    hadSelection
      ? "Gallery saved. Ready to start a new gallery."
      : "Gallery reset. Ready to start a new gallery.",
  );
}

function upsertHistoryEntry(entry) {
  const filtered = historyEntries.filter((item) => item.id !== entry.id);
  historyEntries = [entry, ...filtered];
  persistHistory();
  renderHistory();
}

function saveToHistory({
  title,
  thumbnailUrl,
  imageUrl,
  fileName,
  copiedText,
  layout,
  downloaded = false,
}) {
  const entry = {
    id: crypto.randomUUID(),
    title,
    thumbnailUrl,
    imageUrl,
    fileName,
    copiedText,
    layout,
    downloaded: Boolean(downloaded),
    copiedAt: new Date().toISOString(),
  };

  historyEntries = [entry, ...historyEntries];
  persistHistory();
  renderHistory();
}

function renderHistory() {
  historyGalleryList.innerHTML = "";
  historySingleList.innerHTML = "";
  historyEmpty.classList.toggle("hidden", historyEntries.length > 0);
  historyList.classList.toggle("hidden", Boolean(activeHistoryGalleryId));
  historyHeaderSubtitle.classList.toggle(
    "hidden",
    Boolean(activeHistoryGalleryId),
  );
  historyGalleryHeaderBar.classList.toggle("hidden", !activeHistoryGalleryId);
  if (activeHistoryGalleryId) {
    historyEmpty.classList.add("hidden");
  }

  historyEntries.forEach((entry) => {
    const isGalleryEntry = entry?.type === "gallery";
    const item = document.createElement("article");
    item.className = "history-item";
    if (isGalleryEntry) {
      item.classList.add("history-gallery-entry");
    }

    const preview = document.createElement("img");
    const galleryItems = getGalleryItems(entry);
    const previewUrl = isGalleryEntry
      ? galleryItems[0]?.thumbnailUrl || ""
      : entry.thumbnailUrl || "";
    preview.src = previewUrl;
    preview.alt =
      entry.title || (isGalleryEntry ? "Gallery preview" : "History image");
    preview.loading = "lazy";

    const meta = document.createElement("div");
    meta.className = "history-meta";

    const infoEl = document.createElement("p");
    const infoParts = [];
    if (isGalleryEntry) {
      infoParts.push(
        `${galleryItems.length} image${galleryItems.length === 1 ? "" : "s"}`,
      );
      if (entry.galleryDescription) {
        infoParts.push("has description");
      }
    } else {
      if (entry.fileName) {
        infoParts.push(entry.fileName);
      }
      if (entry.layout) {
        infoParts.push(entry.layout);
      }
      if (entry.downloaded) {
        infoParts.push("downloaded");
      }
    }
    infoEl.textContent = infoParts.join(" • ");

    if (isGalleryEntry) {
      const titleField = document.createElement("div");
      titleField.className = "field-row";
      const titleLabel = document.createElement("label");
      titleLabel.textContent = "Gallery title";
      const titleInput = document.createElement("input");
      titleInput.type = "text";
      titleInput.value = entry.galleryTitle || entry.title || "";
      titleInput.placeholder = "Gallery title";
      titleField.appendChild(titleLabel);
      titleField.appendChild(titleInput);

      const descField = document.createElement("div");
      descField.className = "field-row";
      const descLabel = document.createElement("label");
      descLabel.textContent = "Gallery description";
      const descInput = document.createElement("textarea");
      descInput.rows = 3;
      descInput.value = entry.galleryDescription || "";
      descInput.placeholder = "Gallery description";
      descField.appendChild(descLabel);
      descField.appendChild(descInput);

      const persistCardEdits = () => {
        const nextGalleryTitle = (titleInput.value || "").trim();
        const nextGalleryDescription = (descInput.value || "").trim();
        updateHistoryEntryFields(entry.id, {
          galleryTitle: nextGalleryTitle,
          galleryDescription: nextGalleryDescription,
          title: nextGalleryTitle || "Gallery",
        });
      };

      titleInput.addEventListener("change", persistCardEdits);
      descInput.addEventListener("change", persistCardEdits);

      meta.appendChild(titleField);
      meta.appendChild(infoEl);
      meta.appendChild(descField);
    } else {
      const titleEl = document.createElement("h3");
      titleEl.textContent = entry.title || "Untitled";

      const textEl = document.createElement("textarea");
      textEl.rows = 4;
      textEl.readOnly = true;
      textEl.value = entry.copiedText || "";

      meta.appendChild(titleEl);
      meta.appendChild(infoEl);
      meta.appendChild(textEl);
    }

    const actions = document.createElement("div");
    actions.className = "button-row";

    if (isGalleryEntry) {
      const openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.textContent = "Open gallery";
      openBtn.dataset.openGalleryHistoryId = entry.id;
      actions.appendChild(openBtn);
    } else {
      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.textContent = "Copy";
      copyBtn.dataset.copyHistoryId = entry.id;
      if (!entry.copiedText) {
        copyBtn.disabled = true;
        copyBtn.title = "No copied text in this item";
      }

      const redownloadBtn = document.createElement("button");
      redownloadBtn.type = "button";
      redownloadBtn.textContent = "Re-download";
      redownloadBtn.dataset.redownloadHistoryId = entry.id;
      if (!entry.imageUrl) {
        redownloadBtn.disabled = true;
        redownloadBtn.title = "Unavailable for older history items";
      }

      actions.appendChild(copyBtn);
      actions.appendChild(redownloadBtn);
    }

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "Remove";
    removeBtn.dataset.removeHistoryId = entry.id;

    actions.appendChild(removeBtn);
    meta.appendChild(actions);
    item.appendChild(preview);
    item.appendChild(meta);

    if (isGalleryEntry) {
      historyGalleryList.appendChild(item);
    } else {
      historySingleList.appendChild(item);
    }
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

      await copyToClipboard(entry.copiedText, "History copied.");
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
        button.textContent = "Preparing...";
        setStatus("Preparing optimized image download from history...");

        try {
          const { blob, width } = await optimizeImageForDownload(
            entry.imageUrl,
          );
          const fileName = normalizeFileNameForExport(
            entry.fileName || "wikimedia-image",
          );
          const savedToFolder = await exportBlob(blob, fileName);
          markHistoryEntryDownloaded(entryId);
          const kb = Math.round(blob.size / 1024);
          const message = savedToFolder
            ? `Saved ${fileName} to ${exportDirectoryName} (${width}px, ${kb}KB).`
            : `Downloaded ${fileName} (${width}px, ${kb}KB).`;
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

function openHistoryGalleryInspector(entryId) {
  const entry = historyEntries.find((item) => item.id === entryId);
  if (!entry || entry.type !== "gallery") {
    return;
  }

  activeHistoryGalleryId = entry.id;
  historyList.classList.add("hidden");
  historyEmpty.classList.add("hidden");
  historyHeaderSubtitle.classList.add("hidden");
  historyGalleryHeaderBar.classList.remove("hidden");
  if (typeof activeHistoryGalleryItemIndex !== "number") {
    activeHistoryGalleryItemIndex = 0;
  }
  renderHistoryGalleryInspector(entry);
}

function closeHistoryGalleryInspector() {
  activeHistoryGalleryId = null;
  activeHistoryGalleryItemIndex = null;
  historyGalleryInspector.classList.add("hidden");
  historyList.classList.remove("hidden");
  historyEmpty.classList.toggle("hidden", historyEntries.length > 0);
  historyHeaderSubtitle.classList.remove("hidden");
  historyGalleryHeaderBar.classList.add("hidden");
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
  setHistoryGalleryExportingState(false);
}

function renderHistoryGalleryInspector(entry) {
  const items = getGalleryItems(entry);
  historyGalleryInspector.classList.remove("hidden");
  const galleryTitle = entry.galleryTitle || entry.title || "Gallery";
  historyGalleryMeta.textContent = `${galleryTitle} • ${items.length} image${items.length === 1 ? "" : "s"}`;
  historyGalleryItems.innerHTML = "";

  if (!items.length) {
    activeHistoryGalleryItemIndex = null;
    historyGalleryDetails.classList.add("hidden");
    historyGalleryDetailsEmpty.classList.remove("hidden");
    historyGalleryExportAllBtn.disabled = true;
    historyGalleryCopyAllCaptionsBtn.disabled = true;
    return;
  }

  historyGalleryCopyAllCaptionsBtn.disabled = false;
  setHistoryGalleryExportingState(exportingHistoryGalleryImages);
  const selectedIndex = Number.isInteger(activeHistoryGalleryItemIndex)
    ? Math.max(0, Math.min(activeHistoryGalleryItemIndex, items.length - 1))
    : 0;
  activeHistoryGalleryItemIndex = selectedIndex;

  items.forEach((item, index) => {
    const thumb = document.createElement("li");
    thumb.className = "history-gallery-thumb";
    thumb.tabIndex = 0;
    thumb.classList.toggle("active", index === selectedIndex);

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

    thumb.appendChild(preview);
    thumb.appendChild(title);
    thumb.appendChild(removeBtn);

    thumb.addEventListener("click", () => {
      selectHistoryGalleryItem(entry.id, index);
    });

    thumb.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectHistoryGalleryItem(entry.id, index);
      }
    });

    removeBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      removeImageFromHistoryGallery(entry.id, index);
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
  renderHistoryGalleryInspector(entry);
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
  historyGalleryPreview.src = item.imageUrl || item.thumbnailUrl || "";
  historyGalleryItemTitle.textContent = item.title || "Untitled";
  historyGalleryCaptionInput.value = draft.caption || "";
  historyGalleryLayoutSelect.value = draft.layout || "normal";
  historyGalleryWidthInput.value = String(draft.customWidth || 600);
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

    if (JSON.stringify(nextItem) === JSON.stringify(item)) {
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
      const itemsCount = getGalleryItems(currentEntry).length;
      const galleryTitle =
        currentEntry.galleryTitle || currentEntry.title || "Gallery";
      historyGalleryMeta.textContent = `${galleryTitle} • ${itemsCount} image${itemsCount === 1 ? "" : "s"}`;
    }
  }
}

function setHistoryGalleryExportingState(isExporting) {
  exportingHistoryGalleryImages = isExporting;
  historyGalleryExportAllBtn.disabled = isExporting;
  historyGalleryPrefixExportCheckbox.disabled = isExporting;
  historyGalleryExportAllBtn.textContent = isExporting
    ? "Exporting..."
    : "Export all";
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
      setStatus(`Exporting image ${index + 1}/${exportItems.length}...`);

      try {
        const { blob } = await optimizeImageForDownload(item.imageUrl);
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
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        ...item,
        type: item.type === "gallery" ? "gallery" : "image",
        title: typeof item.title === "string" ? item.title : "",
        thumbnailUrl:
          typeof item.thumbnailUrl === "string" ? item.thumbnailUrl : "",
        imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : "",
        fileName: typeof item.fileName === "string" ? item.fileName : "",
        layout: typeof item.layout === "string" ? item.layout : "",
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
                pageId: galleryItem.pageId,
                title:
                  typeof galleryItem.title === "string"
                    ? galleryItem.title
                    : "",
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
  } catch {
    return [];
  }
}

function persistHistory() {
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(historyEntries));
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
    exportSupportText.textContent =
      "This browser does not support direct folder export. Files will download normally.";
    exportDirStatus.textContent = pathLabel
      ? `Saved export path: ${pathLabel}`
      : "No export path set.";
    selectExportDirBtn.disabled = true;
    clearExportDirBtn.disabled = true;
    return;
  }

  exportSupportText.textContent =
    "Browser security hides absolute folder paths from websites. Use “Export path (manual)” to store the exact path text.";

  if (exportDirectoryHandle && exportDirectoryName) {
    exportDirStatus.textContent = pathLabel
      ? `Current folder: ${exportDirectoryName} • Saved path: ${pathLabel}`
      : `Current folder: ${exportDirectoryName}`;
    clearExportDirBtn.disabled = false;
  } else {
    exportDirStatus.textContent = pathLabel
      ? `No folder handle set • Saved path: ${pathLabel}`
      : "No export folder set.";
    clearExportDirBtn.disabled = true;
  }

  selectExportDirBtn.disabled = false;
}

async function openDirectoryDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DIRECTORY_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DIRECTORY_STORE_NAME)) {
        db.createObjectStore(DIRECTORY_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
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
    db.close();
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
    db.close();
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
    db.close();
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
    downloadImageBtn.textContent = "Preparing...";
    return;
  }

  if (!selectedImage) {
    downloadImageBtn.disabled = true;
    downloadImageBtn.textContent = "Download photo";
    return;
  }

  downloadImageBtn.disabled = false;
  downloadImageBtn.textContent = "Download photo";
}

function isSmallScreen() {
  return window.matchMedia("(max-width: 980px)").matches;
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

async function optimizeImageForDownload(imageUrl) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Image fetch failed with status ${response.status}`);
  }

  const sourceBlob = await response.blob();
  const sourceBitmap = await createImageBitmap(sourceBlob);

  try {
    const maxWidth = parseExportMaxWidth(settings.exportMaxWidth);
    const targetBytes = parseExportTargetKb(settings.exportTargetKb) * 1024;
    const exportFormat = getActiveExportFormat();
    const mimeType = getExportMimeType(exportFormat);

    let targetWidth = Math.min(sourceBitmap.width, maxWidth);
    let targetHeight = Math.max(
      1,
      Math.round((sourceBitmap.height / sourceBitmap.width) * targetWidth),
    );

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas context unavailable");
    }

    let bestBlob = null;
    let bestWidth = targetWidth;

    while (targetWidth >= 320) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(sourceBitmap, 0, 0, canvas.width, canvas.height);

      if (mimeType === "image/png") {
        const pngBlob = await canvasToImageBlob(canvas, mimeType);
        if (!bestBlob || pngBlob.size < bestBlob.size) {
          bestBlob = pngBlob;
          bestWidth = targetWidth;
        }

        if (pngBlob.size <= targetBytes) {
          return { blob: pngBlob, width: targetWidth };
        }
      } else {
        const qualitySteps = [
          0.92, 0.85, 0.78, 0.7, 0.62, 0.54, 0.46, 0.38, 0.3,
        ];
        for (const quality of qualitySteps) {
          const encodedBlob = await canvasToImageBlob(
            canvas,
            mimeType,
            quality,
          );
          if (!bestBlob || encodedBlob.size < bestBlob.size) {
            bestBlob = encodedBlob;
            bestWidth = targetWidth;
          }

          if (encodedBlob.size <= targetBytes) {
            return { blob: encodedBlob, width: targetWidth };
          }
        }
      }

      targetWidth = Math.floor(targetWidth * 0.9);
      targetHeight = Math.max(
        1,
        Math.round((sourceBitmap.height / sourceBitmap.width) * targetWidth),
      );
    }

    if (!bestBlob) {
      throw new Error("Could not generate export image output");
    }

    return { blob: bestBlob, width: bestWidth };
  } finally {
    sourceBitmap.close();
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
    showMoreBtn.textContent = "Show more";
    scanMorePhotoBtn.disabled = true;
    scanMorePhotoBtn.textContent = "Scan more";
    return;
  }

  if (scanningPhotoDate) {
    if (usingPhotoMode) {
      scanMorePhotoBtn.disabled = true;
      scanMorePhotoBtn.textContent = "Scanning...";
    } else {
      showMoreBtn.disabled = true;
      showMoreBtn.textContent = "Loading...";
    }
    return;
  }

  if (usingPhotoMode) {
    scanMorePhotoBtn.disabled = !nextContinue;
    scanMorePhotoBtn.textContent = nextContinue
      ? "Scan more"
      : "No more to scan";
    return;
  }

  if (loadingMore) {
    showMoreBtn.disabled = true;
    showMoreBtn.textContent = "Loading...";
    return;
  }

  if (nextContinue) {
    showMoreBtn.disabled = false;
    showMoreBtn.textContent = "Show more";
    return;
  }

  showMoreBtn.disabled = true;
  showMoreBtn.textContent = "No more results";
}

function setPhotoDateScanningState(isScanning) {
  scanningPhotoDate = isScanning;

  if (searchSubmitBtn) {
    searchSubmitBtn.disabled = isScanning;
    searchSubmitBtn.textContent = isScanning ? "Scanning..." : "Search";
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
updateDownloadButtonState();
syncMobileDetailsState();
settings = loadSettings();
applySettingsToUI();
applyGridColumns();
applyGalleryModeUI();
historyEntries = loadHistory();
renderHistory();
setActiveView("finder");
initExportDirectory();
setStatus("Ready. Search Wikimedia Commons to begin.");
