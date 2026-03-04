import {
  applyEditOperationsToCanvas,
  extractCropHistory,
  normalizeEditOperations,
} from "./editPipeline.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const shouldUseCors = /^https?:\/\//i.test(String(url || ""));
    if (shouldUseCors) {
      image.crossOrigin = "anonymous";
    }
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("Could not load image for editing."));
    image.src = url;
  });
}

function createCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function cloneCanvas(sourceCanvas) {
  const nextCanvas = createCanvas(sourceCanvas.width, sourceCanvas.height);
  const nextContext = nextCanvas.getContext("2d");
  if (!nextContext) {
    throw new Error("Canvas context unavailable");
  }
  nextContext.drawImage(sourceCanvas, 0, 0);
  return nextCanvas;
}

function applySolidBackground(sourceCanvas, color) {
  const nextCanvas = createCanvas(sourceCanvas.width, sourceCanvas.height);
  const nextContext = nextCanvas.getContext("2d");
  if (!nextContext) {
    throw new Error("Canvas context unavailable");
  }

  nextContext.fillStyle = color;
  nextContext.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
  nextContext.drawImage(sourceCanvas, 0, 0);
  return nextCanvas;
}

function getEditorStrokeColor() {
  const cssColor = getComputedStyle(document.documentElement)
    .getPropertyValue("--text")
    .trim();
  return cssColor || "#1a1a1a";
}

function parseAspectRatio(value) {
  if (!value || value === "free") {
    return null;
  }

  const [left, right] = String(value)
    .split(":")
    .map((part) => Number.parseFloat(part));

  if (
    !Number.isFinite(left) ||
    !Number.isFinite(right) ||
    left <= 0 ||
    right <= 0
  ) {
    return null;
  }

  return left / right;
}

function inferExportDescriptor(fileName) {
  const rawName = typeof fileName === "string" ? fileName.trim() : "";
  const hasExtension = /\.[a-z0-9]+$/i.test(rawName);
  const ext = (rawName.match(/\.([a-z0-9]+)$/i)?.[1] || "").toLowerCase();

  if (ext === "jpg" || ext === "jpeg") {
    return {
      mimeType: "image/jpeg",
      fileName: rawName || "edited-image.jpg",
    };
  }

  if (ext === "webp") {
    return {
      mimeType: "image/webp",
      fileName: rawName || "edited-image.webp",
    };
  }

  if (ext === "png") {
    return {
      mimeType: "image/png",
      fileName: rawName || "edited-image.png",
    };
  }

  return {
    mimeType: "image/png",
    fileName: hasExtension ? rawName : `${rawName || "edited-image"}.png`,
  };
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

function buildPreviewCanvas(sourceCanvas, maxSide = 1600) {
  const maxDimension = Math.max(sourceCanvas.width, sourceCanvas.height);
  if (maxDimension <= maxSide) {
    return sourceCanvas;
  }

  const scale = maxSide / maxDimension;
  const width = Math.max(1, Math.round(sourceCanvas.width * scale));
  const height = Math.max(1, Math.round(sourceCanvas.height * scale));
  const previewCanvas = createCanvas(width, height);
  const previewContext = previewCanvas.getContext("2d");
  if (!previewContext) {
    return sourceCanvas;
  }

  previewContext.drawImage(sourceCanvas, 0, 0, width, height);
  return previewCanvas;
}

export function createImageEditorController({
  rootEl,
  stageEl,
  progressOverlayEl,
  canvasEl,
  overlayEl,
  backBtn,
  cropToggleBtn,
  removeBgBtn,
  backgroundBtn,
  colorAdjustBtn,
  eraserBtn,
  splitModeBtn,
  applyCropBtn,
  applyBackgroundBtn,
  applyColorAdjustBtn,
  colorAdjustContentEl,
  brightnessInput,
  brightnessValueEl,
  whiteBalanceInput,
  whiteBalanceValueEl,
  saturationInput,
  saturationValueEl,
  blackpointInput,
  blackpointValueEl,
  eraserContentEl,
  eraserSizeInput,
  eraserSizeValueEl,
  eraserOpacityInput,
  eraserOpacityValueEl,
  eraserUndoBtn,
  eraserRedoBtn,
  undoBtn,
  resetBtn,
  downloadBtn,
  titleEl,
  dimensionsEl,
  aspectRatioSelect,
  backgroundColorInput,
  aspectRatioRow,
  cropContentEl,
  backgroundContentEl,
  cropHintEl,
  historyInfoEl,
  splitReframeControlsEl,
  splitEditInFinderBtn,
  splitMoveUpBtn,
  splitMoveDownBtn,
  splitMoveLeftBtn,
  splitMoveRightBtn,
  splitZoomInBtn,
  splitZoomOutBtn,
  onBack,
  onRequestSplitAdd,
  onRequestSplitEdit,
  onStatus,
  onChange,
}) {
  const displayContext = canvasEl.getContext("2d");
  const overlayContext = overlayEl.getContext("2d");

  let originalCanvas = null;
  let workingCanvas = null;
  let currentMeta = null;
  let isOpen = false;
  let cropMode = false;
  let backgroundMode = false;
  let colorAdjustMode = false;
  let eraserMode = false;
  let renderBox = null;
  let currentSelection = null;
  let dragStart = null;
  let activeAspectRatio = null;
  let hasEdits = false;
  let operationHistory = [];
  let redoHistory = [];
  let snapshotBaseOperationCount = 0;
  let sessionSnapshots = [];
  let redoSnapshots = [];
  let pointerInteractionMode = null;
  let pointerStartPoint = null;
  let pointerStartSelection = null;
  const activeTouchPointers = new Map();
  let multiTouchGestureStart = null;
  let cutoutInProgress = false;
  let editTaskInProgress = false;
  let changeEmissionVersion = 0;
  let originalCanvasLoadPromise = null;
  let openSessionId = 0;
  let backgroundSourceCanvas = null;
  let eraserStrokeActive = false;
  let eraserStrokePoints = [];
  let eraserStrokePointerId = null;
  let eraserCursorPoint = null;
  let splitReframeEnabled = false;
  let splitToolMode = false;
  let splitSourceImages = [];
  let splitOffsets = [];
  let splitScales = [];
  let splitSelectedPanelIndex = -1;
  let splitHoverPanelIndex = -1;
  let splitDragPanelIndex = -1;
  let splitDragPointerId = null;
  let splitDragStartImagePoint = null;
  let splitDragStartOffset = null;
  const splitTouchPointers = new Map();
  let splitPinchStart = null;
  let colorAdjustPreviewRafId = null;
  let colorAdjustPreviewVersion = 0;
  let colorAdjustEmitTimer = null;
  let lastDimensionsText = "";
  let lastHistoryInfoText = "";
  const selectionMinSize = 24;
  const handleRadius = 8;
  const handleSize = 10;

  function setDisabledIfChanged(element, nextDisabled) {
    if (!element || element.disabled === nextDisabled) {
      return;
    }

    element.disabled = nextDisabled;
  }

  function toggleClassIfChanged(element, className, shouldHave) {
    if (!element) {
      return;
    }

    const hasClass = element.classList.contains(className);
    if (hasClass === shouldHave) {
      return;
    }

    element.classList.toggle(className, shouldHave);
  }

  function isTouchPointerEvent(event) {
    return event?.pointerType === "touch";
  }

  function getTouchHandleRadius() {
    return handleRadius * 2.5;
  }

  function updateTouchPointerPosition(event) {
    if (!isTouchPointerEvent(event) || !cropMode || !renderBox) {
      return;
    }

    activeTouchPointers.set(
      event.pointerId,
      clampPointToRenderBox(pointerToCanvasPoint(event)),
    );
  }

  function removeTouchPointer(event) {
    if (!isTouchPointerEvent(event)) {
      return;
    }

    activeTouchPointers.delete(event.pointerId);
    if (activeTouchPointers.size < 2) {
      multiTouchGestureStart = null;
      if (pointerInteractionMode === "pinch") {
        pointerInteractionMode = null;
      }
    }
  }

  function getTwoTouchPoints() {
    if (activeTouchPointers.size < 2) {
      return null;
    }

    const pointers = [...activeTouchPointers.values()];
    return [pointers[0], pointers[1]];
  }

  function beginMultiTouchGesture() {
    if (!cropMode || !renderBox) {
      return false;
    }

    const points = getTwoTouchPoints();
    if (!points) {
      return false;
    }

    if (!currentSelection) {
      if (activeAspectRatio) {
        ensureFixedSelection();
      }
      if (!currentSelection) {
        return false;
      }
    }

    const [firstPoint, secondPoint] = points;
    const distance = Math.hypot(
      secondPoint.x - firstPoint.x,
      secondPoint.y - firstPoint.y,
    );
    if (!Number.isFinite(distance) || distance < 1) {
      return false;
    }

    const selection = { ...currentSelection };
    multiTouchGestureStart = {
      distance,
      midpoint: {
        x: (firstPoint.x + secondPoint.x) / 2,
        y: (firstPoint.y + secondPoint.y) / 2,
      },
      selection,
      aspectRatio:
        activeAspectRatio || selection.width / Math.max(selection.height, 1),
    };
    pointerInteractionMode = "pinch";
    pointerStartPoint = null;
    pointerStartSelection = null;
    dragStart = null;
    return true;
  }

  function applyMultiTouchGesture() {
    if (!multiTouchGestureStart || !renderBox || !currentSelection) {
      return;
    }

    const points = getTwoTouchPoints();
    if (!points) {
      return;
    }

    const [firstPoint, secondPoint] = points;
    const distance = Math.hypot(
      secondPoint.x - firstPoint.x,
      secondPoint.y - firstPoint.y,
    );
    if (!Number.isFinite(distance) || distance < 1) {
      return;
    }

    const midpoint = {
      x: (firstPoint.x + secondPoint.x) / 2,
      y: (firstPoint.y + secondPoint.y) / 2,
    };
    const start = multiTouchGestureStart;
    const ratio = start.aspectRatio || 1;
    const scale = clamp(distance / Math.max(start.distance, 1), 0.35, 4);

    let width = Math.max(selectionMinSize, start.selection.width * scale);
    let height = Math.max(selectionMinSize, width / ratio);

    const maxWidthByBounds = Math.min(
      renderBox.drawWidth,
      renderBox.drawHeight * ratio,
    );
    width = Math.min(width, maxWidthByBounds);
    height = width / ratio;

    const startCenterX = start.selection.x + start.selection.width / 2;
    const startCenterY = start.selection.y + start.selection.height / 2;
    let centerX = startCenterX + (midpoint.x - start.midpoint.x);
    let centerY = startCenterY + (midpoint.y - start.midpoint.y);

    const halfWidth = width / 2;
    const halfHeight = height / 2;
    centerX = clamp(
      centerX,
      renderBox.x + halfWidth,
      renderBox.x + renderBox.drawWidth - halfWidth,
    );
    centerY = clamp(
      centerY,
      renderBox.y + halfHeight,
      renderBox.y + renderBox.drawHeight - halfHeight,
    );

    currentSelection = {
      x: centerX - halfWidth,
      y: centerY - halfHeight,
      width,
      height,
    };
  }

  function notify(message) {
    if (typeof onStatus === "function") {
      onStatus(message);
    }
  }

  function notifyTimed(message, startedAt) {
    const elapsedMs = Math.max(0, Math.round(performance.now() - startedAt));
    notify(`${message} (${elapsedMs}ms).`);
  }

  function setEditorProgressOverlay(visible, message = "Processing…") {
    if (!(progressOverlayEl instanceof HTMLElement)) {
      return;
    }

    const textNode = progressOverlayEl.querySelector("span");
    if (textNode && message) {
      textNode.textContent = message;
    }

    progressOverlayEl.classList.toggle("hidden", !visible);
  }

  function updateToolbarState() {
    const hasSelection = Boolean(currentSelection);
    const isBusy = cutoutInProgress || editTaskInProgress;
    toggleClassIfChanged(cropToggleBtn, "active-tab", cropMode);
    setDisabledIfChanged(cropToggleBtn, isBusy);
    if (backgroundBtn) {
      toggleClassIfChanged(backgroundBtn, "active-tab", backgroundMode);
      setDisabledIfChanged(backgroundBtn, isBusy);
    }
    if (colorAdjustBtn) {
      toggleClassIfChanged(colorAdjustBtn, "active-tab", colorAdjustMode);
      setDisabledIfChanged(colorAdjustBtn, isBusy);
    }
    if (eraserBtn) {
      toggleClassIfChanged(eraserBtn, "active-tab", eraserMode);
      setDisabledIfChanged(eraserBtn, isBusy);
    }
    if (splitModeBtn) {
      toggleClassIfChanged(splitModeBtn, "active-tab", splitToolMode);
      setDisabledIfChanged(splitModeBtn, isBusy);
      const splitButtonLabel = splitModeBtn.querySelector("span");
      if (splitButtonLabel) {
        splitButtonLabel.textContent = splitReframeEnabled
          ? "Split"
          : "Add split";
      }
    }

    setDisabledIfChanged(applyCropBtn, !hasSelection || isBusy);
    if (applyBackgroundBtn) {
      setDisabledIfChanged(applyBackgroundBtn, !workingCanvas || isBusy);
    }
    if (applyColorAdjustBtn) {
      setDisabledIfChanged(applyColorAdjustBtn, !workingCanvas || isBusy);
    }
    if (undoBtn) {
      setDisabledIfChanged(undoBtn, operationHistory.length === 0 || isBusy);
    }
    if (eraserUndoBtn) {
      setDisabledIfChanged(
        eraserUndoBtn,
        operationHistory.length === 0 || isBusy,
      );
    }
    if (eraserRedoBtn) {
      setDisabledIfChanged(eraserRedoBtn, redoHistory.length === 0 || isBusy);
    }
    if (removeBgBtn) {
      setDisabledIfChanged(removeBgBtn, !workingCanvas || isBusy);
    }
    setDisabledIfChanged(resetBtn, !workingCanvas || isBusy);
    setDisabledIfChanged(downloadBtn, !workingCanvas || isBusy);
    if (aspectRatioRow) {
      toggleClassIfChanged(aspectRatioRow, "hidden", !cropMode);
    }

    if (cropContentEl) {
      toggleClassIfChanged(cropContentEl, "hidden", !cropMode);
    }

    if (backgroundContentEl) {
      toggleClassIfChanged(backgroundContentEl, "hidden", !backgroundMode);
    }

    if (eraserContentEl) {
      toggleClassIfChanged(eraserContentEl, "hidden", !eraserMode);
    }

    if (colorAdjustContentEl) {
      toggleClassIfChanged(colorAdjustContentEl, "hidden", !colorAdjustMode);
    }

    if (cropHintEl) {
      toggleClassIfChanged(
        cropHintEl,
        "hidden",
        Boolean(cropMode || backgroundMode || colorAdjustMode || eraserMode),
      );
    }

    if (splitReframeControlsEl) {
      const showSplitControls =
        splitReframeEnabled &&
        splitToolMode &&
        !cropMode &&
        !backgroundMode &&
        !colorAdjustMode &&
        !eraserMode;
      toggleClassIfChanged(
        splitReframeControlsEl,
        "hidden",
        !showSplitControls,
      );
      const controlsDisabled = !showSplitControls || !canUseSplitReframe();
      [
        splitMoveUpBtn,
        splitMoveDownBtn,
        splitMoveLeftBtn,
        splitMoveRightBtn,
        splitZoomInBtn,
        splitZoomOutBtn,
        splitEditInFinderBtn,
      ].forEach((button) => {
        setDisabledIfChanged(button, controlsDisabled);
      });
    }

    if (
      splitReframeEnabled &&
      splitToolMode &&
      !cropMode &&
      !backgroundMode &&
      !colorAdjustMode &&
      !eraserMode
    ) {
      overlayEl.style.cursor = splitDragPanelIndex >= 0 ? "grabbing" : "grab";
    } else {
      overlayEl.style.cursor = "";
    }

    if (historyInfoEl) {
      const nextHistoryInfoText =
        operationHistory.length > 0
          ? `You have made ${operationHistory.length} edit${operationHistory.length === 1 ? "" : "s"}.`
          : "You have not made any edits yet.";
      if (lastHistoryInfoText !== nextHistoryInfoText) {
        historyInfoEl.textContent = nextHistoryInfoText;
        lastHistoryInfoText = nextHistoryInfoText;
      }
    }

    overlayEl.classList.remove(
      "crop-ready",
      "crop-move",
      "crop-resize-nwse",
      "crop-resize-senw",
    );

    if (!cropMode) {
      return;
    }

    if (!activeAspectRatio) {
      return;
    }

    overlayEl.classList.add("crop-ready");
  }

  function getEraserBrushSize() {
    const raw = Number.parseInt(eraserSizeInput?.value || "24", 10);
    return clamp(Number.isFinite(raw) ? raw : 24, 1, 300);
  }

  function getEraserOpacity() {
    const raw = Number.parseInt(eraserOpacityInput?.value || "100", 10);
    const percentage = clamp(Number.isFinite(raw) ? raw : 100, 5, 100);
    return percentage / 100;
  }

  function updateEraserSizeLabel() {
    if (!eraserSizeValueEl) {
      return;
    }

    eraserSizeValueEl.textContent = `${getEraserBrushSize()} px`;
  }

  function updateEraserOpacityLabel() {
    if (!eraserOpacityValueEl) {
      return;
    }

    eraserOpacityValueEl.textContent = `${Math.round(getEraserOpacity() * 100)}%`;
  }

  function getColorAdjustValue(inputEl) {
    const raw = Number.parseInt(inputEl?.value || "0", 10);
    return clamp(Number.isFinite(raw) ? raw : 0, -100, 100);
  }

  function handleRangeArrowNudge(event, inputEl, onValueChanged) {
    if (!(inputEl instanceof HTMLInputElement)) {
      return;
    }

    const key = event.key;
    const isIncreaseKey = key === "ArrowRight" || key === "ArrowUp";
    const isDecreaseKey = key === "ArrowLeft" || key === "ArrowDown";
    if (!isIncreaseKey && !isDecreaseKey) {
      return;
    }

    event.preventDefault();

    const min = Number.parseFloat(inputEl.min || "-100");
    const max = Number.parseFloat(inputEl.max || "100");
    const step = Number.parseFloat(inputEl.step || "1") || 1;
    const multiplier = event.shiftKey ? 10 : 1;
    const delta = step * multiplier * (isIncreaseKey ? 1 : -1);
    const current = Number.parseFloat(inputEl.value || "0");
    const next = clamp(
      Number.isFinite(current) ? current + delta : delta,
      Number.isFinite(min) ? min : -100,
      Number.isFinite(max) ? max : 100,
    );

    inputEl.value = String(Math.round(next));
    if (typeof onValueChanged === "function") {
      onValueChanged();
    }
  }

  function updateColorAdjustLabels() {
    if (brightnessValueEl) {
      brightnessValueEl.textContent = `${getColorAdjustValue(brightnessInput)}%`;
    }
    if (whiteBalanceValueEl) {
      whiteBalanceValueEl.textContent = `${getColorAdjustValue(whiteBalanceInput)}%`;
    }
    if (saturationValueEl) {
      saturationValueEl.textContent = `${getColorAdjustValue(saturationInput)}%`;
    }
    if (blackpointValueEl) {
      blackpointValueEl.textContent = `${getColorAdjustValue(blackpointInput)}%`;
    }
  }

  function setColorAdjustInputs(operation) {
    const brightness = clamp(Number(operation?.brightness) || 0, -100, 100);
    const whiteBalance = clamp(Number(operation?.whiteBalance) || 0, -100, 100);
    const saturation = clamp(Number(operation?.saturation) || 0, -100, 100);
    const blackpoint = clamp(Number(operation?.blackpoint) || 0, -100, 100);

    if (brightnessInput) {
      brightnessInput.value = String(brightness);
    }
    if (whiteBalanceInput) {
      whiteBalanceInput.value = String(whiteBalance);
    }
    if (saturationInput) {
      saturationInput.value = String(saturation);
    }
    if (blackpointInput) {
      blackpointInput.value = String(blackpoint);
    }
    updateColorAdjustLabels();
  }

  function getColorAdjustOperation() {
    return {
      type: "colorAdjust",
      brightness: getColorAdjustValue(brightnessInput),
      whiteBalance: getColorAdjustValue(whiteBalanceInput),
      saturation: getColorAdjustValue(saturationInput),
      blackpoint: getColorAdjustValue(blackpointInput),
    };
  }

  function setColorAdjustOperation(nextOperation) {
    const normalizedOperation = {
      type: "colorAdjust",
      brightness: clamp(Number(nextOperation?.brightness) || 0, -100, 100),
      whiteBalance: clamp(Number(nextOperation?.whiteBalance) || 0, -100, 100),
      saturation: clamp(Number(nextOperation?.saturation) || 0, -100, 100),
      blackpoint: clamp(Number(nextOperation?.blackpoint) || 0, -100, 100),
    };

    const withoutColorAdjust = operationHistory.filter(
      (step) => step?.type !== "colorAdjust",
    );

    const isNeutralAdjust =
      normalizedOperation.brightness === 0 &&
      normalizedOperation.whiteBalance === 0 &&
      normalizedOperation.saturation === 0 &&
      normalizedOperation.blackpoint === 0;

    operationHistory = isNeutralAdjust
      ? withoutColorAdjust
      : [...withoutColorAdjust, normalizedOperation];
  }

  function scheduleColorAdjustEmit() {
    if (colorAdjustEmitTimer) {
      window.clearTimeout(colorAdjustEmitTimer);
    }

    colorAdjustEmitTimer = window.setTimeout(() => {
      colorAdjustEmitTimer = null;
      hasEdits = operationHistory.length > 0;
      void emitEditorChange();
    }, 150);
  }

  async function applyColorAdjustLivePreview() {
    if (!workingCanvas || editTaskInProgress || cutoutInProgress) {
      return;
    }

    const nextOperation = getColorAdjustOperation();
    const previousOperation =
      [...operationHistory]
        .reverse()
        .find((step) => step?.type === "colorAdjust") || null;
    const previousSignature = previousOperation
      ? `${previousOperation.brightness}:${previousOperation.whiteBalance}:${previousOperation.saturation}:${previousOperation.blackpoint || 0}`
      : "none";
    const nextSignature = `${nextOperation.brightness}:${nextOperation.whiteBalance}:${nextOperation.saturation}:${nextOperation.blackpoint}`;

    if (previousSignature === nextSignature) {
      return;
    }

    setColorAdjustOperation(nextOperation);
    redoHistory = [];
    clearBackgroundSourceCache();

    const previewVersion = ++colorAdjustPreviewVersion;
    const rebuilt = await rebuildWorkingFromHistory();
    if (!rebuilt || previewVersion !== colorAdjustPreviewVersion) {
      return;
    }

    hasEdits = operationHistory.length > 0;
    render();
    updateToolbarState();
    scheduleColorAdjustEmit();
  }

  function scheduleColorAdjustPreview() {
    if (!colorAdjustMode || !workingCanvas) {
      return;
    }

    if (colorAdjustPreviewRafId) {
      window.cancelAnimationFrame(colorAdjustPreviewRafId);
    }

    colorAdjustPreviewRafId = window.requestAnimationFrame(() => {
      colorAdjustPreviewRafId = null;
      void applyColorAdjustLivePreview();
    });
  }

  function initializeSessionSnapshots() {
    snapshotBaseOperationCount = operationHistory.length;
    redoSnapshots = [];
    if (!workingCanvas) {
      sessionSnapshots = [];
      return;
    }

    sessionSnapshots = [cloneCanvas(workingCanvas)];
  }

  function syncSessionSnapshotAfterEdit() {
    if (!workingCanvas) {
      return;
    }

    const relativeOperationCount =
      operationHistory.length - snapshotBaseOperationCount;
    if (relativeOperationCount < 0 || sessionSnapshots.length === 0) {
      initializeSessionSnapshots();
      return;
    }

    const expectedLength = relativeOperationCount + 1;
    if (sessionSnapshots.length === expectedLength) {
      sessionSnapshots[sessionSnapshots.length - 1] =
        cloneCanvas(workingCanvas);
    } else if (sessionSnapshots.length === expectedLength - 1) {
      sessionSnapshots.push(cloneCanvas(workingCanvas));
    } else {
      initializeSessionSnapshots();
      return;
    }

    redoSnapshots = [];
  }

  function canUseSnapshotUndo() {
    const relativeOperationCount =
      operationHistory.length - snapshotBaseOperationCount;
    return (
      relativeOperationCount > 0 &&
      sessionSnapshots.length === relativeOperationCount + 1
    );
  }

  function canUseSnapshotRedo() {
    const relativeOperationCount =
      operationHistory.length - snapshotBaseOperationCount;
    return (
      redoHistory.length > 0 &&
      redoSnapshots.length === redoHistory.length &&
      sessionSnapshots.length === relativeOperationCount + 1
    );
  }

  function syncDimensionsText() {
    if (!dimensionsEl) {
      return;
    }

    if (!workingCanvas) {
      if (lastDimensionsText !== "") {
        dimensionsEl.textContent = "";
        lastDimensionsText = "";
      }
      return;
    }

    const nextDimensionsText = `Current image size is ${workingCanvas.width} × ${workingCanvas.height} pixels.`;
    if (lastDimensionsText !== nextDimensionsText) {
      dimensionsEl.textContent = nextDimensionsText;
      lastDimensionsText = nextDimensionsText;
    }
  }

  function sizeStageCanvases() {
    const stageRect = stageEl.getBoundingClientRect();
    const width = Math.max(1, Math.round(stageRect.width));
    const height = Math.max(1, Math.round(stageRect.height));

    canvasEl.width = width;
    canvasEl.height = height;
    overlayEl.width = width;
    overlayEl.height = height;
  }

  function computeRenderBox() {
    if (!workingCanvas) {
      return null;
    }

    const stageWidth = canvasEl.width;
    const stageHeight = canvasEl.height;
    const imageWidth = workingCanvas.width;
    const imageHeight = workingCanvas.height;

    const scale = Math.min(stageWidth / imageWidth, stageHeight / imageHeight);
    const drawWidth = imageWidth * scale;
    const drawHeight = imageHeight * scale;
    const x = (stageWidth - drawWidth) / 2;
    const y = (stageHeight - drawHeight) / 2;

    return {
      x,
      y,
      drawWidth,
      drawHeight,
      scale,
    };
  }

  function getSplitPanelCount() {
    if (!currentMeta?.splitLayout) {
      return splitSourceImages.length;
    }

    return currentMeta.splitLayout === 3 ? 3 : 2;
  }

  function getSplitCanvasDimensions() {
    const fallbackWidth = workingCanvas?.width || originalCanvas?.width || 1920;
    const fallbackHeight =
      workingCanvas?.height || originalCanvas?.height || 1080;

    return {
      width:
        Number.isFinite(Number(currentMeta?.canvasWidth)) &&
        Number(currentMeta.canvasWidth) > 0
          ? Number(currentMeta.canvasWidth)
          : fallbackWidth,
      height:
        Number.isFinite(Number(currentMeta?.canvasHeight)) &&
        Number(currentMeta.canvasHeight) > 0
          ? Number(currentMeta.canvasHeight)
          : fallbackHeight,
    };
  }

  function buildSplitPanelRects(width, height, panelCount) {
    const safeCount = Math.max(1, panelCount);
    const panelWidth = width / safeCount;
    return Array.from({ length: safeCount }, (_, index) => ({
      x: index * panelWidth,
      y: 0,
      width: panelWidth,
      height,
    }));
  }

  function getSplitSourceCropForPanel(index, panelRect) {
    const source = splitSourceImages[index];
    if (!source || !panelRect) {
      return null;
    }

    const targetAspect = panelRect.width / Math.max(1, panelRect.height);
    const sourceAspect = source.width / Math.max(1, source.height);

    let srcWidth = source.width;
    let srcHeight = source.height;
    if (sourceAspect > targetAspect) {
      srcWidth = source.height * targetAspect;
    } else {
      srcHeight = source.width / targetAspect;
    }

    const centerX = (source.width - srcWidth) / 2;
    const centerY = (source.height - srcHeight) / 2;
    const maxOffsetX = Math.max(0, (source.width - srcWidth) / 2);
    const maxOffsetY = Math.max(0, (source.height - srcHeight) / 2);

    return {
      srcWidth,
      srcHeight,
      centerX,
      centerY,
      maxOffsetX,
      maxOffsetY,
    };
  }

  function clampSplitScale(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return 1;
    }

    return clamp(numeric, 1, 3);
  }

  function normalizeSplitOffsets(offsets, panelCount) {
    const safeCount = Math.max(1, panelCount);
    const input = Array.isArray(offsets) ? offsets : [];
    return Array.from({ length: safeCount }, (_, index) => ({
      x: Number.isFinite(Number(input[index]?.x)) ? Number(input[index].x) : 0,
      y: Number.isFinite(Number(input[index]?.y)) ? Number(input[index].y) : 0,
    }));
  }

  function normalizeSplitScales(scales, panelCount) {
    const safeCount = Math.max(1, panelCount);
    const input = Array.isArray(scales) ? scales : [];
    return Array.from({ length: safeCount }, (_, index) =>
      clampSplitScale(input[index]),
    );
  }

  function getDefaultSplitReframeState(panelCount) {
    return {
      offsets: normalizeSplitOffsets([], panelCount),
      scales: normalizeSplitScales([], panelCount),
    };
  }

  function getSplitReframeStateFromOperations(operations, panelCount) {
    const fallbackState = getDefaultSplitReframeState(panelCount);
    if (!Array.isArray(operations)) {
      return fallbackState;
    }

    for (let index = operations.length - 1; index >= 0; index -= 1) {
      const step = operations[index];
      if (step?.type === "splitReframe" && Array.isArray(step.offsets)) {
        return {
          offsets: normalizeSplitOffsets(step.offsets, panelCount),
          scales: normalizeSplitScales(step.scales, panelCount),
        };
      }
    }

    return fallbackState;
  }

  function isDefaultSplitReframeState(offsets, scales) {
    const offsetsAreDefault = Array.isArray(offsets)
      ? offsets.every(
          (offset) =>
            Math.abs(Number(offset?.x) || 0) < 0.01 &&
            Math.abs(Number(offset?.y) || 0) < 0.01,
        )
      : true;
    const scalesAreDefault = Array.isArray(scales)
      ? scales.every((scale) => Math.abs(clampSplitScale(scale) - 1) < 0.001)
      : true;
    return offsetsAreDefault && scalesAreDefault;
  }

  function buildSplitReframeOperation(offsets, scales) {
    const panelCount = getSplitPanelCount();
    return {
      type: "splitReframe",
      offsets: normalizeSplitOffsets(offsets, panelCount).map((offset) => ({
        x: Number(offset.x.toFixed(2)),
        y: Number(offset.y.toFixed(2)),
      })),
      scales: normalizeSplitScales(scales, panelCount).map((scale) =>
        Number(scale.toFixed(4)),
      ),
    };
  }

  function getOperationsWithoutSplitReframe(operations) {
    return Array.isArray(operations)
      ? operations.filter((step) => step?.type !== "splitReframe")
      : [];
  }

  function composeSplitCanvasFromOffsets(offsets, scales = splitScales) {
    if (!splitReframeEnabled || splitSourceImages.length === 0) {
      return null;
    }

    const { width, height } = getSplitCanvasDimensions();
    const panelCount = getSplitPanelCount();
    const panelRects = buildSplitPanelRects(width, height, panelCount);
    const safeOffsets = normalizeSplitOffsets(offsets, panelCount);
    const safeScales = normalizeSplitScales(scales, panelCount);
    const nextCanvas = createCanvas(width, height);
    const nextContext = nextCanvas.getContext("2d");
    if (!nextContext) {
      return null;
    }

    nextContext.fillStyle = "#ffffff";
    nextContext.fillRect(0, 0, width, height);

    panelRects.forEach((panelRect, panelIndex) => {
      const source = splitSourceImages[panelIndex];
      if (!source) {
        return;
      }

      const crop = getSplitSourceCropForPanel(panelIndex, panelRect);
      if (!crop) {
        return;
      }

      const panelScale = safeScales[panelIndex] || 1;
      const scaledSrcWidth = clamp(crop.srcWidth / panelScale, 1, source.width);
      const scaledSrcHeight = clamp(
        crop.srcHeight / panelScale,
        1,
        source.height,
      );
      const maxOffsetX = Math.max(0, (source.width - scaledSrcWidth) / 2);
      const maxOffsetY = Math.max(0, (source.height - scaledSrcHeight) / 2);
      const baseCenterX = (source.width - scaledSrcWidth) / 2;
      const baseCenterY = (source.height - scaledSrcHeight) / 2;

      const rawOffset = safeOffsets[panelIndex] || { x: 0, y: 0 };
      const offsetX = clamp(rawOffset.x, -maxOffsetX, maxOffsetX);
      const offsetY = clamp(rawOffset.y, -maxOffsetY, maxOffsetY);
      const srcX = clamp(
        baseCenterX + offsetX,
        0,
        source.width - scaledSrcWidth,
      );
      const srcY = clamp(
        baseCenterY + offsetY,
        0,
        source.height - scaledSrcHeight,
      );

      nextContext.drawImage(
        source,
        srcX,
        srcY,
        scaledSrcWidth,
        scaledSrcHeight,
        panelRect.x,
        panelRect.y,
        panelRect.width,
        panelRect.height,
      );
    });

    return nextCanvas;
  }

  async function initializeSplitReframeState(meta, operations) {
    splitReframeEnabled = false;
    splitSourceImages = [];
    splitOffsets = [];
    splitScales = [];
    splitHoverPanelIndex = -1;
    splitDragPanelIndex = -1;
    splitDragPointerId = null;
    splitDragStartImagePoint = null;
    splitDragStartOffset = null;

    if (!meta?.isSplitScreen || !Array.isArray(meta.splitImages)) {
      return;
    }

    const panelCount = meta.splitLayout === 3 ? 3 : 2;
    if (meta.splitImages.length < panelCount) {
      return;
    }

    const loadedSources = await Promise.all(
      meta.splitImages
        .slice(0, panelCount)
        .map((item) => loadImage(item.imageUrl || item.thumbnailUrl || "")),
    );

    splitSourceImages = loadedSources;
    const splitState = getSplitReframeStateFromOperations(
      operations,
      panelCount,
    );
    splitOffsets = splitState.offsets;
    splitScales = splitState.scales;
    splitReframeEnabled = true;
  }

  function drawSelectionOverlay() {
    overlayContext.clearRect(0, 0, overlayEl.width, overlayEl.height);

    if (
      splitReframeEnabled &&
      renderBox &&
      !cropMode &&
      !backgroundMode &&
      !colorAdjustMode &&
      !eraserMode
    ) {
      const panelCount = getSplitPanelCount();
      const sectionWidth = renderBox.drawWidth / Math.max(1, panelCount);
      overlayContext.save();
      overlayContext.lineWidth = 1;
      overlayContext.strokeStyle = "rgba(255, 255, 255, 0.85)";

      for (let index = 1; index < panelCount; index += 1) {
        const x = renderBox.x + sectionWidth * index;
        overlayContext.beginPath();
        overlayContext.moveTo(x + 0.5, renderBox.y);
        overlayContext.lineTo(x + 0.5, renderBox.y + renderBox.drawHeight);
        overlayContext.stroke();
      }

      const highlightIndex =
        splitDragPanelIndex >= 0
          ? splitDragPanelIndex
          : splitHoverPanelIndex >= 0
            ? splitHoverPanelIndex
            : splitSelectedPanelIndex;
      if (highlightIndex >= 0) {
        overlayContext.fillStyle = "rgba(255, 255, 255, 0.14)";
        overlayContext.fillRect(
          renderBox.x + sectionWidth * highlightIndex,
          renderBox.y,
          sectionWidth,
          renderBox.drawHeight,
        );
      }
      overlayContext.restore();
    }

    if (!currentSelection) {
      drawEraserCursor();
      return;
    }

    const strokeColor = getEditorStrokeColor();
    overlayContext.save();
    overlayContext.globalAlpha = 0.2;
    overlayContext.fillStyle = strokeColor;
    overlayContext.fillRect(0, 0, overlayEl.width, overlayEl.height);
    overlayContext.restore();

    overlayContext.clearRect(
      currentSelection.x,
      currentSelection.y,
      currentSelection.width,
      currentSelection.height,
    );

    overlayContext.strokeStyle = strokeColor;
    overlayContext.lineWidth = 1;
    overlayContext.strokeRect(
      currentSelection.x + 0.5,
      currentSelection.y + 0.5,
      currentSelection.width,
      currentSelection.height,
    );

    if (cropMode && activeAspectRatio) {
      const handles = getSelectionHandles(currentSelection);
      overlayContext.fillStyle = strokeColor;
      Object.values(handles).forEach((point) => {
        overlayContext.fillRect(
          point.x - handleSize / 2,
          point.y - handleSize / 2,
          handleSize,
          handleSize,
        );
      });
    }

    drawEraserCursor();
  }

  function drawEraserCursor() {
    if (!eraserMode || !eraserCursorPoint || !renderBox) {
      return;
    }

    const radius = Math.max(2, (getEraserBrushSize() * renderBox.scale) / 2);
    overlayContext.save();
    overlayContext.lineWidth = 1.5;
    overlayContext.strokeStyle = "rgba(255, 255, 255, 0.95)";
    overlayContext.beginPath();
    overlayContext.arc(
      eraserCursorPoint.x,
      eraserCursorPoint.y,
      radius,
      0,
      Math.PI * 2,
    );
    overlayContext.stroke();

    overlayContext.lineWidth = 1;
    overlayContext.strokeStyle = "rgba(214, 58, 255, 0.95)";
    overlayContext.beginPath();
    overlayContext.arc(
      eraserCursorPoint.x,
      eraserCursorPoint.y,
      Math.max(1, radius - 2.5),
      0,
      Math.PI * 2,
    );
    overlayContext.stroke();
    overlayContext.restore();
  }

  function render() {
    displayContext.clearRect(0, 0, canvasEl.width, canvasEl.height);

    if (!workingCanvas) {
      renderBox = null;
      drawSelectionOverlay();
      updateToolbarState();
      syncDimensionsText();
      return;
    }

    renderBox = computeRenderBox();

    if (!renderBox) {
      drawSelectionOverlay();
      updateToolbarState();
      syncDimensionsText();
      return;
    }

    ensureFixedSelection();

    displayContext.drawImage(
      workingCanvas,
      renderBox.x,
      renderBox.y,
      renderBox.drawWidth,
      renderBox.drawHeight,
    );

    drawSelectionOverlay();
    updateToolbarState();
    syncDimensionsText();
  }

  function clearSelection({ renderNow = true } = {}) {
    currentSelection = null;
    dragStart = null;
    pointerInteractionMode = null;
    pointerStartPoint = null;
    pointerStartSelection = null;
    activeTouchPointers.clear();
    multiTouchGestureStart = null;
    if (renderNow) {
      render();
    }
  }

  function getSelectionHandles(selection) {
    return {
      nw: { x: selection.x, y: selection.y },
      ne: { x: selection.x + selection.width, y: selection.y },
      se: {
        x: selection.x + selection.width,
        y: selection.y + selection.height,
      },
      sw: { x: selection.x, y: selection.y + selection.height },
    };
  }

  function pointInSelection(point, selection) {
    return (
      point.x >= selection.x &&
      point.x <= selection.x + selection.width &&
      point.y >= selection.y &&
      point.y <= selection.y + selection.height
    );
  }

  function detectSelectionHit(point, customHandleRadius = handleRadius) {
    if (!currentSelection) {
      return "none";
    }

    const handles = getSelectionHandles(currentSelection);
    const corners = [
      ["resize-nw", handles.nw],
      ["resize-ne", handles.ne],
      ["resize-se", handles.se],
      ["resize-sw", handles.sw],
    ];

    for (const [mode, handlePoint] of corners) {
      const distance = Math.hypot(
        point.x - handlePoint.x,
        point.y - handlePoint.y,
      );
      if (distance <= customHandleRadius) {
        return mode;
      }
    }

    if (pointInSelection(point, currentSelection)) {
      return "move";
    }

    return "none";
  }

  function updateOverlayCursorForPoint(point) {
    overlayEl.classList.remove(
      "crop-move",
      "crop-resize-nwse",
      "crop-resize-senw",
    );

    if (!cropMode || !activeAspectRatio || !currentSelection) {
      return;
    }

    const hit = detectSelectionHit(point);
    if (hit === "move") {
      overlayEl.classList.add("crop-move");
      return;
    }

    if (hit === "resize-nw" || hit === "resize-se") {
      overlayEl.classList.add("crop-resize-nwse");
      return;
    }

    if (hit === "resize-ne" || hit === "resize-sw") {
      overlayEl.classList.add("crop-resize-senw");
    }
  }

  function buildDefaultFixedSelection() {
    if (!renderBox || !activeAspectRatio) {
      return null;
    }

    const maxWidth = renderBox.drawWidth;
    const maxHeight = renderBox.drawHeight;
    const preferredWidth = maxWidth * 0.65;
    const preferredHeight = maxHeight * 0.65;

    let width = preferredWidth;
    let height = width / activeAspectRatio;

    if (height > preferredHeight) {
      height = preferredHeight;
      width = height * activeAspectRatio;
    }

    width = Math.max(selectionMinSize, Math.min(width, maxWidth));
    height = Math.max(selectionMinSize, Math.min(height, maxHeight));

    const x = renderBox.x + (maxWidth - width) / 2;
    const y = renderBox.y + (maxHeight - height) / 2;

    return { x, y, width, height };
  }

  function ensureFixedSelection() {
    if (!cropMode || !activeAspectRatio || currentSelection) {
      return;
    }

    currentSelection = buildDefaultFixedSelection();
  }

  function moveSelectionFromPointer(point) {
    if (
      !pointerStartSelection ||
      !pointerStartPoint ||
      !renderBox ||
      !currentSelection
    ) {
      return;
    }

    const dx = point.x - pointerStartPoint.x;
    const dy = point.y - pointerStartPoint.y;
    const nextX = clamp(
      pointerStartSelection.x + dx,
      renderBox.x,
      renderBox.x + renderBox.drawWidth - pointerStartSelection.width,
    );
    const nextY = clamp(
      pointerStartSelection.y + dy,
      renderBox.y,
      renderBox.y + renderBox.drawHeight - pointerStartSelection.height,
    );

    currentSelection = {
      ...currentSelection,
      x: nextX,
      y: nextY,
    };
  }

  function resizeSelectionFromPointer(point, mode) {
    if (!pointerStartSelection || !renderBox || !activeAspectRatio) {
      return;
    }

    const start = pointerStartSelection;
    const anchors = {
      "resize-nw": { x: start.x + start.width, y: start.y + start.height },
      "resize-ne": { x: start.x, y: start.y + start.height },
      "resize-se": { x: start.x, y: start.y },
      "resize-sw": { x: start.x + start.width, y: start.y },
    };

    const anchor = anchors[mode];
    if (!anchor) {
      return;
    }

    let maxWidth = 0;
    let maxHeight = 0;
    if (mode === "resize-nw") {
      maxWidth = anchor.x - renderBox.x;
      maxHeight = anchor.y - renderBox.y;
    } else if (mode === "resize-ne") {
      maxWidth = renderBox.x + renderBox.drawWidth - anchor.x;
      maxHeight = anchor.y - renderBox.y;
    } else if (mode === "resize-se") {
      maxWidth = renderBox.x + renderBox.drawWidth - anchor.x;
      maxHeight = renderBox.y + renderBox.drawHeight - anchor.y;
    } else {
      maxWidth = anchor.x - renderBox.x;
      maxHeight = renderBox.y + renderBox.drawHeight - anchor.y;
    }

    const desiredWidth = Math.abs(point.x - anchor.x);
    const desiredHeight = Math.abs(point.y - anchor.y);
    let width = desiredWidth;
    let height = width / activeAspectRatio;

    if (
      desiredHeight > 0 &&
      desiredWidth / Math.max(desiredHeight, 0.0001) < activeAspectRatio
    ) {
      height = desiredHeight;
      width = height * activeAspectRatio;
    }

    const maxWidthByHeight = maxHeight * activeAspectRatio;
    width = Math.min(width, maxWidth, maxWidthByHeight);
    width = Math.max(selectionMinSize, width);
    height = width / activeAspectRatio;

    if (height > maxHeight) {
      height = maxHeight;
      width = height * activeAspectRatio;
    }

    if (width < selectionMinSize || height < selectionMinSize) {
      return;
    }

    if (mode === "resize-nw") {
      currentSelection = {
        x: anchor.x - width,
        y: anchor.y - height,
        width,
        height,
      };
    } else if (mode === "resize-ne") {
      currentSelection = {
        x: anchor.x,
        y: anchor.y - height,
        width,
        height,
      };
    } else if (mode === "resize-se") {
      currentSelection = {
        x: anchor.x,
        y: anchor.y,
        width,
        height,
      };
    } else {
      currentSelection = {
        x: anchor.x - width,
        y: anchor.y,
        width,
        height,
      };
    }
  }

  function clampPointToRenderBox(point) {
    if (!renderBox) {
      return point;
    }

    return {
      x: clamp(point.x, renderBox.x, renderBox.x + renderBox.drawWidth),
      y: clamp(point.y, renderBox.y, renderBox.y + renderBox.drawHeight),
    };
  }

  function constrainSelectionByRatio(nextSelection) {
    if (!dragStart || !activeAspectRatio) {
      return nextSelection;
    }

    const deltaX =
      nextSelection.width * (nextSelection.x < dragStart.x ? -1 : 1);
    const deltaY =
      nextSelection.height * (nextSelection.y < dragStart.y ? -1 : 1);
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (!absX && !absY) {
      return nextSelection;
    }

    let width = absX;
    let height = absY;

    if (!absY || absX / Math.max(absY, 0.0001) > activeAspectRatio) {
      height = width / activeAspectRatio;
    } else {
      width = height * activeAspectRatio;
    }

    const signX = deltaX < 0 ? -1 : 1;
    const signY = deltaY < 0 ? -1 : 1;

    const x = signX < 0 ? dragStart.x - width : dragStart.x;
    const y = signY < 0 ? dragStart.y - height : dragStart.y;

    return {
      x,
      y,
      width,
      height,
    };
  }

  function normalizeSelection(selection) {
    if (!selection || !renderBox) {
      return null;
    }

    const minSize = 8;
    const x = clamp(
      selection.x,
      renderBox.x,
      renderBox.x + renderBox.drawWidth,
    );
    const y = clamp(
      selection.y,
      renderBox.y,
      renderBox.y + renderBox.drawHeight,
    );
    const maxRight = renderBox.x + renderBox.drawWidth;
    const maxBottom = renderBox.y + renderBox.drawHeight;
    const right = clamp(selection.x + selection.width, renderBox.x, maxRight);
    const bottom = clamp(
      selection.y + selection.height,
      renderBox.y,
      maxBottom,
    );
    const width = right - x;
    const height = bottom - y;

    if (width < minSize || height < minSize) {
      return null;
    }

    return { x, y, width, height };
  }

  function pointerToCanvasPoint(event) {
    const rect = overlayEl.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function pointerToImagePoint(event) {
    if (!renderBox || !workingCanvas) {
      return null;
    }

    const point = clampPointToRenderBox(pointerToCanvasPoint(event));
    return {
      x: clamp(
        (point.x - renderBox.x) / renderBox.scale,
        0,
        workingCanvas.width,
      ),
      y: clamp(
        (point.y - renderBox.y) / renderBox.scale,
        0,
        workingCanvas.height,
      ),
    };
  }

  function getSplitPanelIndexAtImagePoint(imagePoint) {
    if (!imagePoint || !splitReframeEnabled || !workingCanvas) {
      return -1;
    }

    const panelCount = getSplitPanelCount();
    if (panelCount <= 0) {
      return -1;
    }

    const sectionWidth = workingCanvas.width / panelCount;
    if (!Number.isFinite(sectionWidth) || sectionWidth <= 0) {
      return -1;
    }

    const rawIndex = Math.floor(imagePoint.x / sectionWidth);
    return clamp(rawIndex, 0, panelCount - 1);
  }

  function canUseSplitReframe() {
    if (
      !splitReframeEnabled ||
      !splitToolMode ||
      !workingCanvas ||
      !renderBox
    ) {
      return false;
    }

    const nonSplitOps = getOperationsWithoutSplitReframe(operationHistory);
    return nonSplitOps.length === 0 && !editTaskInProgress && !cutoutInProgress;
  }

  function getActiveSplitPanelIndex() {
    if (splitDragPanelIndex >= 0) {
      return splitDragPanelIndex;
    }
    if (splitHoverPanelIndex >= 0) {
      return splitHoverPanelIndex;
    }
    if (splitSelectedPanelIndex >= 0) {
      return splitSelectedPanelIndex;
    }
    return splitReframeEnabled ? 0 : -1;
  }

  function setSplitPanelSelection(panelIndex) {
    splitSelectedPanelIndex = panelIndex;
  }

  function clampSplitOffsetForPanel(panelIndex, offset, scaleValue) {
    const panelCount = getSplitPanelCount();
    const { width, height } = getSplitCanvasDimensions();
    const panelRect = buildSplitPanelRects(width, height, panelCount)[
      panelIndex
    ];
    const crop = getSplitSourceCropForPanel(panelIndex, panelRect);
    const source = splitSourceImages[panelIndex];
    if (!crop || !source) {
      return { x: 0, y: 0 };
    }

    const panelScale = clampSplitScale(scaleValue);
    const scaledSrcWidth = clamp(crop.srcWidth / panelScale, 1, source.width);
    const scaledSrcHeight = clamp(
      crop.srcHeight / panelScale,
      1,
      source.height,
    );
    const maxOffsetX = Math.max(0, (source.width - scaledSrcWidth) / 2);
    const maxOffsetY = Math.max(0, (source.height - scaledSrcHeight) / 2);

    return {
      x: clamp(Number(offset?.x) || 0, -maxOffsetX, maxOffsetX),
      y: clamp(Number(offset?.y) || 0, -maxOffsetY, maxOffsetY),
    };
  }

  async function commitSplitReframeState() {
    operationHistory = getOperationsWithoutSplitReframe(operationHistory);
    if (!isDefaultSplitReframeState(splitOffsets, splitScales)) {
      operationHistory.push(
        buildSplitReframeOperation(splitOffsets, splitScales),
      );
    }

    redoHistory = [];
    hasEdits = operationHistory.length > 0;
    syncSessionSnapshotAfterEdit();
    await emitEditorChange();
  }

  function applySplitReframeStateToCanvas() {
    const splitCanvas = composeSplitCanvasFromOffsets(
      splitOffsets,
      splitScales,
    );
    if (splitCanvas) {
      workingCanvas = splitCanvas;
    }
    hasEdits = !isDefaultSplitReframeState(splitOffsets, splitScales);
  }

  async function nudgeSplitPanel(panelIndex, deltaX, deltaY) {
    if (!canUseSplitReframe() || panelIndex < 0) {
      return;
    }

    const panelCount = getSplitPanelCount();
    const nextOffsets = normalizeSplitOffsets(splitOffsets, panelCount);
    const nextScales = normalizeSplitScales(splitScales, panelCount);
    const currentOffset = nextOffsets[panelIndex] || { x: 0, y: 0 };
    const unclampedOffset = {
      x: currentOffset.x + deltaX,
      y: currentOffset.y + deltaY,
    };
    nextOffsets[panelIndex] = clampSplitOffsetForPanel(
      panelIndex,
      unclampedOffset,
      nextScales[panelIndex],
    );

    splitOffsets = nextOffsets;
    splitScales = nextScales;
    setSplitPanelSelection(panelIndex);
    applySplitReframeStateToCanvas();
    await commitSplitReframeState();
    render();
  }

  async function zoomSplitPanel(panelIndex, zoomFactor) {
    if (!canUseSplitReframe() || panelIndex < 0) {
      return;
    }

    const panelCount = getSplitPanelCount();
    const nextScales = normalizeSplitScales(splitScales, panelCount);
    const nextOffsets = normalizeSplitOffsets(splitOffsets, panelCount);

    nextScales[panelIndex] = clampSplitScale(
      nextScales[panelIndex] * zoomFactor,
    );
    nextOffsets[panelIndex] = clampSplitOffsetForPanel(
      panelIndex,
      nextOffsets[panelIndex],
      nextScales[panelIndex],
    );

    splitOffsets = nextOffsets;
    splitScales = nextScales;
    setSplitPanelSelection(panelIndex);
    applySplitReframeStateToCanvas();
    await commitSplitReframeState();
    render();
  }

  function beginSplitReframeDrag(event) {
    if (!canUseSplitReframe()) {
      return false;
    }

    const imagePoint = pointerToImagePoint(event);
    if (!imagePoint) {
      return false;
    }

    const panelIndex = getSplitPanelIndexAtImagePoint(imagePoint);
    if (panelIndex < 0) {
      return false;
    }

    setSplitPanelSelection(panelIndex);
    splitHoverPanelIndex = panelIndex;
    splitDragPanelIndex = panelIndex;
    splitDragPointerId = event.pointerId;
    splitDragStartImagePoint = imagePoint;
    splitDragStartOffset = {
      ...(splitOffsets[panelIndex] || { x: 0, y: 0 }),
    };
    overlayEl.setPointerCapture(event.pointerId);
    render();
    return true;
  }

  function updateSplitReframeDrag(event) {
    const imagePoint = pointerToImagePoint(event);
    if (!imagePoint) {
      return false;
    }

    splitHoverPanelIndex = getSplitPanelIndexAtImagePoint(imagePoint);
    if (
      splitDragPointerId !== event.pointerId ||
      splitDragPanelIndex < 0 ||
      !splitDragStartImagePoint ||
      !splitDragStartOffset ||
      !canUseSplitReframe()
    ) {
      render();
      return false;
    }

    const panelCount = getSplitPanelCount();
    const { width, height } = getSplitCanvasDimensions();
    const panelRects = buildSplitPanelRects(width, height, panelCount);
    const panelRect = panelRects[splitDragPanelIndex];
    const crop = getSplitSourceCropForPanel(splitDragPanelIndex, panelRect);
    if (!crop) {
      return false;
    }

    const panelScale = splitScales[splitDragPanelIndex] || 1;
    const scaledSrcWidth = clamp(
      crop.srcWidth / panelScale,
      1,
      splitSourceImages[splitDragPanelIndex]?.width || crop.srcWidth,
    );
    const scaledSrcHeight = clamp(
      crop.srcHeight / panelScale,
      1,
      splitSourceImages[splitDragPanelIndex]?.height || crop.srcHeight,
    );
    const maxOffsetX = Math.max(
      0,
      (splitSourceImages[splitDragPanelIndex].width - scaledSrcWidth) / 2,
    );
    const maxOffsetY = Math.max(
      0,
      (splitSourceImages[splitDragPanelIndex].height - scaledSrcHeight) / 2,
    );

    const dx = imagePoint.x - splitDragStartImagePoint.x;
    const dy = imagePoint.y - splitDragStartImagePoint.y;
    const scaleX = scaledSrcWidth / Math.max(1, panelRect.width);
    const scaleY = scaledSrcHeight / Math.max(1, panelRect.height);
    const nextOffsets = normalizeSplitOffsets(splitOffsets, panelCount);

    nextOffsets[splitDragPanelIndex] = {
      x: clamp(splitDragStartOffset.x - dx * scaleX, -maxOffsetX, maxOffsetX),
      y: clamp(splitDragStartOffset.y - dy * scaleY, -maxOffsetY, maxOffsetY),
    };

    splitOffsets = nextOffsets;
    applySplitReframeStateToCanvas();
    render();
    return true;
  }

  async function finishSplitReframeDrag(event) {
    const wasDragging = splitDragPointerId === event.pointerId;
    if (!wasDragging) {
      return false;
    }

    if (overlayEl.hasPointerCapture(event.pointerId)) {
      overlayEl.releasePointerCapture(event.pointerId);
    }

    splitDragPanelIndex = -1;
    splitDragPointerId = null;
    splitDragStartImagePoint = null;
    splitDragStartOffset = null;

    if (!canUseSplitReframe()) {
      render();
      return true;
    }

    await commitSplitReframeState();
    render();
    return true;
  }

  async function handleSplitReframeWheel(event) {
    if (!canUseSplitReframe()) {
      return;
    }

    const imagePoint = pointerToImagePoint(event);
    if (!imagePoint) {
      return;
    }

    const panelIndex = getSplitPanelIndexAtImagePoint(imagePoint);
    if (panelIndex < 0) {
      return;
    }

    event.preventDefault();

    const panelCount = getSplitPanelCount();
    const { width, height } = getSplitCanvasDimensions();
    const panelRect = buildSplitPanelRects(width, height, panelCount)[
      panelIndex
    ];
    const crop = getSplitSourceCropForPanel(panelIndex, panelRect);
    const source = splitSourceImages[panelIndex];
    if (!crop || !source) {
      return;
    }

    const zoomFactor = event.deltaY < 0 ? 1.08 : 1 / 1.08;
    const nextScales = normalizeSplitScales(splitScales, panelCount);
    nextScales[panelIndex] = clampSplitScale(
      nextScales[panelIndex] * zoomFactor,
    );

    const scaledSrcWidth = clamp(
      crop.srcWidth / nextScales[panelIndex],
      1,
      source.width,
    );
    const scaledSrcHeight = clamp(
      crop.srcHeight / nextScales[panelIndex],
      1,
      source.height,
    );
    const maxOffsetX = Math.max(0, (source.width - scaledSrcWidth) / 2);
    const maxOffsetY = Math.max(0, (source.height - scaledSrcHeight) / 2);

    const nextOffsets = normalizeSplitOffsets(splitOffsets, panelCount);
    nextOffsets[panelIndex] = {
      x: clamp(nextOffsets[panelIndex].x, -maxOffsetX, maxOffsetX),
      y: clamp(nextOffsets[panelIndex].y, -maxOffsetY, maxOffsetY),
    };

    splitScales = nextScales;
    splitOffsets = nextOffsets;

    setSplitPanelSelection(panelIndex);
    applySplitReframeStateToCanvas();
    await commitSplitReframeState();
    render();
  }

  function updateSplitTouchPointer(event) {
    if (!isTouchPointerEvent(event) || !canUseSplitReframe()) {
      return;
    }

    splitTouchPointers.set(
      event.pointerId,
      clampPointToRenderBox(pointerToCanvasPoint(event)),
    );
  }

  function removeSplitTouchPointer(event) {
    if (!isTouchPointerEvent(event)) {
      return;
    }

    splitTouchPointers.delete(event.pointerId);
    if (splitTouchPointers.size < 2) {
      splitPinchStart = null;
    }
  }

  function getTwoSplitTouchPoints() {
    if (splitTouchPointers.size < 2) {
      return null;
    }

    const pointers = [...splitTouchPointers.values()];
    return [pointers[0], pointers[1]];
  }

  function beginSplitPinchGesture() {
    if (!canUseSplitReframe()) {
      return false;
    }

    const points = getTwoSplitTouchPoints();
    if (!points) {
      return false;
    }

    const [firstPoint, secondPoint] = points;
    const distance = Math.hypot(
      secondPoint.x - firstPoint.x,
      secondPoint.y - firstPoint.y,
    );
    if (!Number.isFinite(distance) || distance < 1) {
      return false;
    }

    const midpointCanvas = {
      x: (firstPoint.x + secondPoint.x) / 2,
      y: (firstPoint.y + secondPoint.y) / 2,
    };
    const midpointImage = {
      x: clamp(
        (midpointCanvas.x - renderBox.x) / renderBox.scale,
        0,
        workingCanvas.width,
      ),
      y: clamp(
        (midpointCanvas.y - renderBox.y) / renderBox.scale,
        0,
        workingCanvas.height,
      ),
    };
    const panelIndex = getSplitPanelIndexAtImagePoint(midpointImage);
    if (panelIndex < 0) {
      return false;
    }

    splitPinchStart = {
      panelIndex,
      distance,
      scale: splitScales[panelIndex] || 1,
    };
    setSplitPanelSelection(panelIndex);
    splitDragPanelIndex = -1;
    splitDragPointerId = null;
    splitDragStartImagePoint = null;
    splitDragStartOffset = null;
    return true;
  }

  async function applySplitPinchGesture() {
    if (!splitPinchStart || !canUseSplitReframe()) {
      return false;
    }

    const points = getTwoSplitTouchPoints();
    if (!points) {
      return false;
    }

    const [firstPoint, secondPoint] = points;
    const distance = Math.hypot(
      secondPoint.x - firstPoint.x,
      secondPoint.y - firstPoint.y,
    );
    if (!Number.isFinite(distance) || distance < 1) {
      return false;
    }

    const panelIndex = splitPinchStart.panelIndex;
    const scaleRatio = distance / Math.max(1, splitPinchStart.distance);
    const panelCount = getSplitPanelCount();
    const nextScales = normalizeSplitScales(splitScales, panelCount);
    const nextOffsets = normalizeSplitOffsets(splitOffsets, panelCount);
    nextScales[panelIndex] = clampSplitScale(
      splitPinchStart.scale * scaleRatio,
    );
    nextOffsets[panelIndex] = clampSplitOffsetForPanel(
      panelIndex,
      nextOffsets[panelIndex],
      nextScales[panelIndex],
    );

    splitScales = nextScales;
    splitOffsets = nextOffsets;
    applySplitReframeStateToCanvas();
    await commitSplitReframeState();
    render();
    return true;
  }

  function eraseStrokeOnCanvas(points, brushSize) {
    if (!workingCanvas || !Array.isArray(points) || !points.length) {
      return;
    }

    const context = workingCanvas.getContext("2d");
    if (!context) {
      return;
    }

    context.save();
    context.globalCompositeOperation = "destination-out";
    context.globalAlpha = getEraserOpacity();
    context.strokeStyle = "rgba(0,0,0,1)";
    context.fillStyle = "rgba(0,0,0,1)";
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = brushSize;

    if (points.length === 1) {
      context.beginPath();
      context.arc(points[0].x, points[0].y, brushSize / 2, 0, Math.PI * 2);
      context.fill();
    } else {
      context.beginPath();
      context.moveTo(points[0].x, points[0].y);
      for (let index = 1; index < points.length; index += 1) {
        context.lineTo(points[index].x, points[index].y);
      }
      context.stroke();
    }

    context.restore();
  }

  function beginEraserStroke(event) {
    if (
      !eraserMode ||
      !workingCanvas ||
      editTaskInProgress ||
      cutoutInProgress
    ) {
      return;
    }

    const imagePoint = pointerToImagePoint(event);
    if (!imagePoint) {
      return;
    }

    eraserCursorPoint = clampPointToRenderBox(pointerToCanvasPoint(event));

    eraserStrokeActive = true;
    eraserStrokePointerId = event.pointerId;
    eraserStrokePoints = [imagePoint];
    eraseStrokeOnCanvas([imagePoint], getEraserBrushSize());
    overlayEl.setPointerCapture(event.pointerId);
    hasEdits = true;
    render();
  }

  function moveEraserStroke(event) {
    eraserCursorPoint = clampPointToRenderBox(pointerToCanvasPoint(event));

    if (!eraserStrokeActive || eraserStrokePointerId !== event.pointerId) {
      render();
      return;
    }

    const imagePoint = pointerToImagePoint(event);
    if (!imagePoint) {
      return;
    }

    const previousPoint = eraserStrokePoints[eraserStrokePoints.length - 1];
    eraserStrokePoints.push(imagePoint);
    eraseStrokeOnCanvas([previousPoint, imagePoint], getEraserBrushSize());
    render();
  }

  async function finishEraserStroke(event) {
    if (!eraserStrokeActive || eraserStrokePointerId !== event.pointerId) {
      return;
    }

    if (overlayEl.hasPointerCapture(event.pointerId)) {
      overlayEl.releasePointerCapture(event.pointerId);
    }

    const points = eraserStrokePoints.map((point) => ({
      x: Number(point.x.toFixed(2)),
      y: Number(point.y.toFixed(2)),
    }));

    if (points.length > 0) {
      operationHistory.push({
        type: "erase",
        size: getEraserBrushSize(),
        opacity: Number(getEraserOpacity().toFixed(3)),
        points,
      });
      redoHistory = [];
      clearBackgroundSourceCache();
      syncSessionSnapshotAfterEdit();
      await emitEditorChange();
    }

    eraserStrokeActive = false;
    eraserStrokePoints = [];
    eraserStrokePointerId = null;
    render();
  }

  function handlePointerDown(event) {
    updateTouchPointerPosition(event);
    updateSplitTouchPointer(event);

    if (isTouchPointerEvent(event) && (cropMode || eraserMode)) {
      event.preventDefault();
    }

    if (eraserMode) {
      eraserCursorPoint = clampPointToRenderBox(pointerToCanvasPoint(event));
      beginEraserStroke(event);
      return;
    }

    if (
      splitReframeEnabled &&
      splitToolMode &&
      !cropMode &&
      !backgroundMode &&
      !colorAdjustMode &&
      !eraserMode &&
      isTouchPointerEvent(event) &&
      splitTouchPointers.size >= 2
    ) {
      event.preventDefault();
      beginSplitPinchGesture();
      return;
    }

    if (
      !cropMode &&
      !backgroundMode &&
      !colorAdjustMode &&
      !eraserMode &&
      splitToolMode &&
      beginSplitReframeDrag(event)
    ) {
      return;
    }

    if (!cropMode || !renderBox || !workingCanvas) {
      return;
    }

    const point = clampPointToRenderBox(pointerToCanvasPoint(event));

    if (isTouchPointerEvent(event) && activeTouchPointers.size >= 2) {
      if (beginMultiTouchGesture()) {
        overlayEl.setPointerCapture(event.pointerId);
        drawSelectionOverlay();
        updateToolbarState();
      }
      return;
    }

    if (activeAspectRatio) {
      ensureFixedSelection();

      const hit = detectSelectionHit(
        point,
        isTouchPointerEvent(event) ? getTouchHandleRadius() : handleRadius,
      );
      if (hit === "none") {
        updateOverlayCursorForPoint(point);
        return;
      }

      pointerInteractionMode = hit;
      pointerStartPoint = point;
      pointerStartSelection = currentSelection ? { ...currentSelection } : null;
      overlayEl.setPointerCapture(event.pointerId);
      updateOverlayCursorForPoint(point);
      drawSelectionOverlay();
      return;
    }

    if (currentSelection && pointInSelection(point, currentSelection)) {
      pointerInteractionMode = "move";
      pointerStartPoint = point;
      pointerStartSelection = { ...currentSelection };
      overlayEl.setPointerCapture(event.pointerId);
      drawSelectionOverlay();
      return;
    }

    dragStart = point;
    pointerInteractionMode = null;
    pointerStartPoint = null;
    pointerStartSelection = null;
    currentSelection = { x: point.x, y: point.y, width: 0, height: 0 };
    overlayEl.setPointerCapture(event.pointerId);
    drawSelectionOverlay();
  }

  function handlePointerMove(event) {
    updateTouchPointerPosition(event);
    updateSplitTouchPointer(event);

    if (
      isTouchPointerEvent(event) &&
      cropMode &&
      (pointerInteractionMode || activeTouchPointers.size >= 1)
    ) {
      event.preventDefault();
    }

    if (eraserMode) {
      moveEraserStroke(event);
      return;
    }

    if (
      splitReframeEnabled &&
      splitToolMode &&
      !cropMode &&
      !backgroundMode &&
      !colorAdjustMode &&
      !eraserMode &&
      isTouchPointerEvent(event) &&
      splitTouchPointers.size >= 2
    ) {
      event.preventDefault();
      if (!splitPinchStart) {
        beginSplitPinchGesture();
      }
      void applySplitPinchGesture();
      return;
    }

    if (!cropMode && !backgroundMode && !colorAdjustMode && !eraserMode) {
      if (splitReframeEnabled && splitToolMode) {
        updateSplitReframeDrag(event);
      }
      return;
    }

    if (!cropMode) {
      return;
    }

    const point = clampPointToRenderBox(pointerToCanvasPoint(event));

    if (
      isTouchPointerEvent(event) &&
      (pointerInteractionMode === "pinch" || activeTouchPointers.size >= 2)
    ) {
      if (!multiTouchGestureStart) {
        beginMultiTouchGesture();
      }
      applyMultiTouchGesture();
      drawSelectionOverlay();
      updateToolbarState();
      return;
    }

    if (activeAspectRatio) {
      if (!pointerInteractionMode) {
        updateOverlayCursorForPoint(point);
        return;
      }

      if (pointerInteractionMode === "move") {
        moveSelectionFromPointer(point);
      } else {
        resizeSelectionFromPointer(point, pointerInteractionMode);
      }

      drawSelectionOverlay();
      updateToolbarState();
      return;
    }

    if (!dragStart) {
      if (pointerInteractionMode === "move") {
        moveSelectionFromPointer(point);
        drawSelectionOverlay();
        updateToolbarState();
      }
      return;
    }

    const unconstrainedSelection = {
      x: Math.min(dragStart.x, point.x),
      y: Math.min(dragStart.y, point.y),
      width: Math.abs(point.x - dragStart.x),
      height: Math.abs(point.y - dragStart.y),
    };

    const nextSelection = constrainSelectionByRatio(unconstrainedSelection);

    currentSelection = normalizeSelection(nextSelection) || nextSelection;
    drawSelectionOverlay();
    updateToolbarState();
  }

  async function handlePointerUp(event) {
    if (isTouchPointerEvent(event) && (cropMode || eraserMode)) {
      event.preventDefault();
    }

    removeTouchPointer(event);
    removeSplitTouchPointer(event);

    if (eraserMode) {
      await finishEraserStroke(event);
      return;
    }

    if (splitPinchStart && splitTouchPointers.size < 2) {
      splitPinchStart = null;
      render();
      return;
    }

    if (!cropMode && !backgroundMode && !colorAdjustMode && !eraserMode) {
      if (splitToolMode) {
        await finishSplitReframeDrag(event);
      }
      return;
    }

    if (!cropMode) {
      return;
    }

    if (activeAspectRatio) {
      pointerInteractionMode = null;
      pointerStartPoint = null;
      pointerStartSelection = null;
      multiTouchGestureStart = null;
    } else {
      dragStart = null;
      pointerInteractionMode = null;
      pointerStartPoint = null;
      pointerStartSelection = null;
      currentSelection = normalizeSelection(currentSelection);
    }

    if (overlayEl.hasPointerCapture(event.pointerId)) {
      overlayEl.releasePointerCapture(event.pointerId);
    }

    updateOverlayCursorForPoint(
      clampPointToRenderBox(pointerToCanvasPoint(event)),
    );
    render();
  }

  function handlePointerLeave() {
    if (splitReframeEnabled && splitToolMode && splitDragPointerId === null) {
      splitHoverPanelIndex = -1;
      render();
    }

    if (!eraserMode || eraserStrokeActive) {
      return;
    }

    eraserCursorPoint = null;
    render();
  }

  function selectionToImageRect(selection) {
    if (!renderBox || !workingCanvas || !selection) {
      return null;
    }

    const imageX = Math.round((selection.x - renderBox.x) / renderBox.scale);
    const imageY = Math.round((selection.y - renderBox.y) / renderBox.scale);
    const imageWidth = Math.round(selection.width / renderBox.scale);
    const imageHeight = Math.round(selection.height / renderBox.scale);

    const x = clamp(imageX, 0, workingCanvas.width - 1);
    const y = clamp(imageY, 0, workingCanvas.height - 1);
    const width = clamp(imageWidth, 1, workingCanvas.width - x);
    const height = clamp(imageHeight, 1, workingCanvas.height - y);

    if (width < 2 || height < 2) {
      return null;
    }

    return { x, y, width, height };
  }

  function clearFixedAspectOverlay() {
    if (!activeAspectRatio) {
      return;
    }

    activeAspectRatio = null;
    if (aspectRatioSelect) {
      aspectRatioSelect.value = "free";
    }
    currentSelection = null;
    pointerInteractionMode = null;
    pointerStartPoint = null;
    pointerStartSelection = null;
  }

  function normalizeSolidColor(input) {
    const raw = typeof input === "string" ? input.trim() : "";
    return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw) ? raw : "#ffffff";
  }

  function setBackgroundOperationColor(color) {
    const normalizedColor = normalizeSolidColor(color);
    const withoutBackground = operationHistory.filter(
      (step) => step?.type !== "background",
    );

    operationHistory = [
      ...withoutBackground,
      { type: "background", color: normalizedColor },
    ];
  }

  function clearBackgroundSourceCache() {
    backgroundSourceCanvas = null;
  }

  async function emitEditorChange() {
    const emissionVersion = ++changeEmissionVersion;

    if (typeof onChange !== "function" || !currentMeta?.editKey) {
      return;
    }

    if (!hasEdits || !workingCanvas) {
      onChange({
        editKey: currentMeta.editKey,
        previewUrl: "",
        title: currentMeta.title,
        fileName: currentMeta.fileName,
        originalImageUrl: currentMeta.imageUrl,
        thumbnailUrl: currentMeta.thumbnailUrl,
        pageId: currentMeta.pageId,
        history: [],
      });
      return;
    }

    const previewCanvas = buildPreviewCanvas(workingCanvas);
    const blob = await canvasToBlob(previewCanvas, "image/jpeg", 0.84);
    if (!blob || emissionVersion !== changeEmissionVersion) {
      return;
    }

    const cropHistory = extractCropHistory(operationHistory);
    const previewUrl = URL.createObjectURL(blob);

    if (emissionVersion !== changeEmissionVersion) {
      URL.revokeObjectURL(previewUrl);
      return;
    }

    onChange({
      editKey: currentMeta.editKey,
      previewUrl,
      title: currentMeta.title,
      fileName: currentMeta.fileName,
      originalImageUrl: currentMeta.imageUrl,
      thumbnailUrl: currentMeta.thumbnailUrl,
      pageId: currentMeta.pageId,
      history: cropHistory,
      operations: operationHistory.map((step) => ({ ...step })),
      previewOptimized: true,
    });
  }

  function cropCurrentWorkingCanvas(rect) {
    if (!workingCanvas || !rect) {
      return;
    }

    const nextCanvas = createCanvas(rect.width, rect.height);
    const nextContext = nextCanvas.getContext("2d");
    if (!nextContext) {
      throw new Error("Canvas context unavailable");
    }

    nextContext.drawImage(
      workingCanvas,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      0,
      0,
      rect.width,
      rect.height,
    );

    workingCanvas = nextCanvas;
  }

  function createCanvasFromImage(image) {
    const nextCanvas = createCanvas(image.naturalWidth, image.naturalHeight);
    const nextContext = nextCanvas.getContext("2d");
    if (!nextContext) {
      throw new Error("Canvas context unavailable");
    }
    nextContext.drawImage(image, 0, 0);
    return nextCanvas;
  }

  async function ensureOriginalCanvasLoaded(sessionId = openSessionId) {
    if (originalCanvas) {
      return originalCanvas;
    }

    if (!currentMeta?.imageUrl) {
      return null;
    }

    if (!originalCanvasLoadPromise) {
      originalCanvasLoadPromise = loadImage(currentMeta.imageUrl)
        .then((image) => {
          if (!isOpen || sessionId !== openSessionId) {
            return null;
          }
          originalCanvas = createCanvasFromImage(image);
          return originalCanvas;
        })
        .catch((error) => {
          console.error(error);
          return null;
        })
        .finally(() => {
          if (sessionId === openSessionId) {
            originalCanvasLoadPromise = null;
            updateToolbarState();
          }
        });
    }

    return originalCanvasLoadPromise;
  }

  async function removeBackgroundClientSide() {
    if (!workingCanvas || cutoutInProgress || editTaskInProgress) {
      return;
    }

    editTaskInProgress = true;
    cutoutInProgress = true;
    updateToolbarState();
    notify("Removing background in browser... first run may take longer.");
    setEditorProgressOverlay(true, "Cutout in progress…");
    const startedAt = performance.now();

    try {
      workingCanvas = await applyEditOperationsToCanvas(workingCanvas, [
        { type: "cutout" },
      ]);
      operationHistory.push({ type: "cutout" });
      redoHistory = [];
      clearBackgroundSourceCache();
      syncSessionSnapshotAfterEdit();

      hasEdits = true;
      clearSelection({ renderNow: false });
      notifyTimed("Background removed", startedAt);
      await emitEditorChange();
      render();
    } catch (error) {
      console.error(error);
      notify("Background removal failed in this browser/image.");
    } finally {
      setEditorProgressOverlay(false);
      cutoutInProgress = false;
      editTaskInProgress = false;
      updateToolbarState();
    }
  }

  async function rebuildWorkingFromHistory() {
    return rebuildWorkingFromOperations(operationHistory);
  }

  async function rebuildWorkingFromOperations(operations) {
    if (splitReframeEnabled && splitSourceImages.length > 0) {
      const panelCount = getSplitPanelCount();
      const splitState = getSplitReframeStateFromOperations(
        operations,
        panelCount,
      );
      splitOffsets = splitState.offsets;
      splitScales = splitState.scales;
      const splitBaseCanvas = composeSplitCanvasFromOffsets(
        splitOffsets,
        splitScales,
      );
      if (!splitBaseCanvas) {
        return;
      }

      const nonSplitOperations = getOperationsWithoutSplitReframe(operations);
      workingCanvas = await applyEditOperationsToCanvas(
        splitBaseCanvas,
        nonSplitOperations,
      );
      return workingCanvas;
    }

    if (!originalCanvas) {
      await ensureOriginalCanvasLoaded();
    }

    if (!originalCanvas) {
      return;
    }
    const baseCanvas = createCanvas(
      originalCanvas.width,
      originalCanvas.height,
    );
    const baseContext = baseCanvas.getContext("2d");
    if (!baseContext) {
      throw new Error("Canvas context unavailable");
    }
    baseContext.drawImage(originalCanvas, 0, 0);

    workingCanvas = await applyEditOperationsToCanvas(baseCanvas, operations);
    return workingCanvas;
  }

  async function applyCrop() {
    if (editTaskInProgress || cutoutInProgress) {
      return;
    }

    if (!currentSelection || !workingCanvas) {
      notify("Draw a crop area first.");
      return;
    }

    const sourceRect = selectionToImageRect(currentSelection);
    if (!sourceRect) {
      notify("Crop area is too small.");
      return;
    }

    editTaskInProgress = true;
    updateToolbarState();
    const startedAt = performance.now();
    try {
      cropCurrentWorkingCanvas(sourceRect);
      operationHistory.push({ type: "crop", ...sourceRect });
      redoHistory = [];
      clearBackgroundSourceCache();
      hasEdits = true;
      syncSessionSnapshotAfterEdit();
      clearSelection({ renderNow: false });
      clearFixedAspectOverlay();
      notifyTimed("Crop applied", startedAt);
      await emitEditorChange();
      render();
    } finally {
      editTaskInProgress = false;
      updateToolbarState();
    }
  }

  async function applyBackground() {
    if (!workingCanvas || editTaskInProgress || cutoutInProgress) {
      return;
    }

    editTaskInProgress = true;
    updateToolbarState();
    const startedAt = performance.now();
    try {
      const color = normalizeSolidColor(backgroundColorInput?.value);
      const hasBackground = operationHistory.some(
        (step) => step?.type === "background",
      );

      if (!hasBackground && workingCanvas) {
        backgroundSourceCanvas = cloneCanvas(workingCanvas);
      }

      if (!backgroundSourceCanvas) {
        const operationsWithoutBackground = operationHistory.filter(
          (step) => step?.type !== "background",
        );
        const rebuiltWithoutBackground = await rebuildWorkingFromOperations(
          operationsWithoutBackground,
        );
        if (!rebuiltWithoutBackground) {
          notify("Could not apply background color.");
          return;
        }
        backgroundSourceCanvas = cloneCanvas(rebuiltWithoutBackground);
      }

      setBackgroundOperationColor(color);
      redoHistory = [];
      workingCanvas = applySolidBackground(backgroundSourceCanvas, color);
      hasEdits = true;
      syncSessionSnapshotAfterEdit();
      clearSelection({ renderNow: false });
      notifyTimed("Background colour applied", startedAt);
      await emitEditorChange();
      render();
    } finally {
      editTaskInProgress = false;
      updateToolbarState();
    }
  }

  async function applyColorAdjust() {
    if (!workingCanvas || editTaskInProgress || cutoutInProgress) {
      return;
    }

    editTaskInProgress = true;
    updateToolbarState();
    const startedAt = performance.now();
    try {
      setColorAdjustOperation(getColorAdjustOperation());
      redoHistory = [];
      clearBackgroundSourceCache();
      await rebuildWorkingFromHistory();
      hasEdits = operationHistory.length > 0;
      syncSessionSnapshotAfterEdit();
      clearSelection({ renderNow: false });
      notifyTimed("Colour adjustments applied", startedAt);
      await emitEditorChange();
      render();
    } finally {
      editTaskInProgress = false;
      updateToolbarState();
    }
  }

  async function undoLastEdit() {
    if (!operationHistory.length || editTaskInProgress || cutoutInProgress) {
      return;
    }

    editTaskInProgress = true;
    updateToolbarState();
    const startedAt = performance.now();
    try {
      clearBackgroundSourceCache();
      const canUseSnapshot = canUseSnapshotUndo();
      const lastOperation = operationHistory[operationHistory.length - 1];
      operationHistory = operationHistory.slice(0, -1);
      if (lastOperation) {
        redoHistory.push(lastOperation);
      }

      if (canUseSnapshot) {
        const removedSnapshot = sessionSnapshots.pop();
        if (removedSnapshot) {
          redoSnapshots.push(removedSnapshot);
        }

        const previousSnapshot = sessionSnapshots[sessionSnapshots.length - 1];
        if (previousSnapshot) {
          workingCanvas = cloneCanvas(previousSnapshot);
        } else {
          await rebuildWorkingFromHistory();
          initializeSessionSnapshots();
        }
      } else {
        await rebuildWorkingFromHistory();
        initializeSessionSnapshots();
      }

      hasEdits = operationHistory.length > 0;
      clearSelection({ renderNow: false });
      notifyTimed("Last edit removed", startedAt);
      await emitEditorChange();
      render();
    } finally {
      editTaskInProgress = false;
      updateToolbarState();
    }
  }

  async function redoLastEdit() {
    if (!redoHistory.length || editTaskInProgress || cutoutInProgress) {
      return;
    }

    editTaskInProgress = true;
    updateToolbarState();
    const startedAt = performance.now();
    try {
      clearBackgroundSourceCache();
      const canUseSnapshot = canUseSnapshotRedo();
      const restoredOperation = redoHistory[redoHistory.length - 1];
      redoHistory = redoHistory.slice(0, -1);
      if (restoredOperation) {
        operationHistory.push(restoredOperation);
      }

      if (canUseSnapshot) {
        const restoredSnapshot = redoSnapshots.pop();
        if (restoredSnapshot) {
          sessionSnapshots.push(restoredSnapshot);
          workingCanvas = cloneCanvas(restoredSnapshot);
        } else {
          await rebuildWorkingFromHistory();
          initializeSessionSnapshots();
        }
      } else {
        await rebuildWorkingFromHistory();
        initializeSessionSnapshots();
      }

      hasEdits = operationHistory.length > 0;
      clearSelection({ renderNow: false });
      notifyTimed("Edit restored", startedAt);
      await emitEditorChange();
      render();
    } finally {
      editTaskInProgress = false;
      updateToolbarState();
    }
  }

  async function resetImage() {
    if (editTaskInProgress || cutoutInProgress) {
      return;
    }

    editTaskInProgress = true;
    updateToolbarState();
    const startedAt = performance.now();
    try {
      clearBackgroundSourceCache();
      await ensureOriginalCanvasLoaded();
      if (!originalCanvas) {
        notify("Original image is still loading.");
        return;
      }

      operationHistory = [];
      redoHistory = [];
      await rebuildWorkingFromHistory();
      initializeSessionSnapshots();
      hasEdits = false;
      clearSelection({ renderNow: false });
      clearFixedAspectOverlay();
      notifyTimed("Image reset", startedAt);
      await emitEditorChange();
      render();
    } finally {
      editTaskInProgress = false;
      updateToolbarState();
    }
  }

  async function downloadImage() {
    if (!workingCanvas || !currentMeta) {
      return;
    }

    const descriptor = inferExportDescriptor(currentMeta.fileName);
    const blob = await canvasToBlob(workingCanvas, descriptor.mimeType);

    if (!blob) {
      notify("Download failed.");
      return;
    }

    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = descriptor.fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(blobUrl);
    notify("Cropped image downloaded.");
  }

  async function open(meta) {
    const hasCanvasSource = meta?.sourceCanvas instanceof HTMLCanvasElement;

    if (!meta?.imageUrl && !hasCanvasSource) {
      throw new Error("No image source provided for editor.");
    }

    const sessionId = ++openSessionId;
    const sourceUrl = meta.startImageUrl || meta.imageUrl || "";
    const loadedSourceImage = hasCanvasSource
      ? null
      : await loadImage(sourceUrl);
    const nextWorking = hasCanvasSource
      ? cloneCanvas(meta.sourceCanvas)
      : createCanvasFromImage(loadedSourceImage);

    originalCanvas = null;
    originalCanvasLoadPromise = null;
    backgroundSourceCanvas = null;
    workingCanvas = nextWorking;
    currentMeta = {
      title: meta.title || "Image editor",
      fileName: meta.fileName || "edited-image.png",
      imageUrl: meta.imageUrl || "",
      thumbnailUrl: meta.thumbnailUrl || "",
      pageId: Number.isInteger(meta.pageId) ? meta.pageId : null,
      editKey: meta.editKey || "",
      isSplitScreen: Boolean(meta.isSplitScreen),
      splitLayout: meta.splitLayout === 3 ? 3 : 2,
      splitImages: Array.isArray(meta.splitImages) ? meta.splitImages : [],
      canvasWidth: Number.isFinite(Number(meta.canvasWidth))
        ? Number(meta.canvasWidth)
        : null,
      canvasHeight: Number.isFinite(Number(meta.canvasHeight))
        ? Number(meta.canvasHeight)
        : null,
    };

    titleEl.textContent = currentMeta.title;
    operationHistory = Array.isArray(meta.operations)
      ? normalizeEditOperations(meta.operations)
      : Array.isArray(meta.history)
        ? normalizeEditOperations(
            meta.history.map((step) => ({ type: "crop", ...step })),
          )
        : [];
    await initializeSplitReframeState(currentMeta, operationHistory);
    redoHistory = [];
    splitToolMode = splitReframeEnabled;
    hasEdits =
      operationHistory.length > 0 ||
      (Boolean(sourceUrl) &&
        Boolean(meta.imageUrl) &&
        sourceUrl !== meta.imageUrl);
    cropMode = false;
    backgroundMode = false;
    colorAdjustMode = false;
    eraserMode = false;
    eraserStrokeActive = false;
    eraserStrokePoints = [];
    eraserStrokePointerId = null;
    eraserCursorPoint = null;
    lastDimensionsText = "";
    lastHistoryInfoText = "";
    activeAspectRatio = parseAspectRatio(aspectRatioSelect?.value || "free");
    isOpen = true;

    if (hasCanvasSource) {
      originalCanvas = cloneCanvas(meta.sourceCanvas);
    } else if (sourceUrl === meta.imageUrl) {
      originalCanvas = createCanvasFromImage(loadedSourceImage);
    } else {
      void ensureOriginalCanvasLoaded(sessionId);
    }

    if (
      splitReframeEnabled ||
      (operationHistory.length > 0 && sourceUrl === meta.imageUrl)
    ) {
      await rebuildWorkingFromHistory();
    }
    const existingColorAdjust =
      [...operationHistory]
        .reverse()
        .find((step) => step?.type === "colorAdjust") || null;
    setColorAdjustInputs(existingColorAdjust);
    initializeSessionSnapshots();
    clearSelection();
    sizeStageCanvases();
    render();

    if (splitReframeEnabled) {
      const panelHint =
        getSplitPanelCount() === 2 ? "Left/Right" : "Left/Center/Right";
      notify(`Split reframe ready. Press Split to adjust ${panelHint} panels.`);
    }
  }

  function close() {
    openSessionId += 1;
    isOpen = false;
    cropMode = false;
    backgroundMode = false;
    colorAdjustMode = false;
    eraserMode = false;
    splitToolMode = false;
    eraserStrokeActive = false;
    eraserStrokePoints = [];
    eraserStrokePointerId = null;
    eraserCursorPoint = null;
    splitReframeEnabled = false;
    splitSourceImages = [];
    splitOffsets = [];
    splitScales = [];
    splitSelectedPanelIndex = -1;
    splitHoverPanelIndex = -1;
    splitDragPanelIndex = -1;
    splitDragPointerId = null;
    splitDragStartImagePoint = null;
    splitDragStartOffset = null;
    splitTouchPointers.clear();
    splitPinchStart = null;
    lastDimensionsText = "";
    lastHistoryInfoText = "";
    if (colorAdjustPreviewRafId) {
      window.cancelAnimationFrame(colorAdjustPreviewRafId);
      colorAdjustPreviewRafId = null;
    }
    if (colorAdjustEmitTimer) {
      window.clearTimeout(colorAdjustEmitTimer);
      colorAdjustEmitTimer = null;
    }
    hasEdits = false;
    operationHistory = [];
    redoHistory = [];
    snapshotBaseOperationCount = 0;
    sessionSnapshots = [];
    redoSnapshots = [];
    originalCanvas = null;
    originalCanvasLoadPromise = null;
    backgroundSourceCanvas = null;
    workingCanvas = null;
    currentMeta = null;
    setEditorProgressOverlay(false);
    clearSelection();
  }

  function toggleCropMode() {
    if (!cropMode) {
      backgroundMode = false;
      colorAdjustMode = false;
      eraserMode = false;
      splitToolMode = false;
      eraserCursorPoint = null;
    }

    cropMode = !cropMode;
    if (!cropMode) {
      clearSelection();
    } else {
      if (activeAspectRatio) {
        ensureFixedSelection();
      }
      render();
      notify(
        activeAspectRatio
          ? "Crop mode enabled. Move or resize the crop box, then apply crop."
          : "Crop mode enabled. Drag to select an area.",
      );
    }
    updateToolbarState();
  }

  function toggleBackgroundMode() {
    if (!backgroundBtn) {
      return;
    }

    backgroundMode = !backgroundMode;
    if (backgroundMode) {
      cropMode = false;
      colorAdjustMode = false;
      eraserMode = false;
      splitToolMode = false;
      eraserCursorPoint = null;
      clearSelection();
      clearFixedAspectOverlay();
      notify("Background tool enabled. Pick a colour and apply.");
    }

    render();
    updateToolbarState();
  }

  function toggleColorAdjustMode() {
    if (!colorAdjustBtn) {
      return;
    }

    colorAdjustMode = !colorAdjustMode;
    if (colorAdjustMode) {
      cropMode = false;
      backgroundMode = false;
      eraserMode = false;
      splitToolMode = false;
      eraserCursorPoint = null;
      clearSelection();
      clearFixedAspectOverlay();
      notify("Colours tool enabled. Set values and apply.");
    }

    render();
    updateToolbarState();
  }

  function toggleEraserMode() {
    if (!eraserBtn) {
      return;
    }

    eraserMode = !eraserMode;
    if (eraserMode) {
      cropMode = false;
      backgroundMode = false;
      colorAdjustMode = false;
      splitToolMode = false;
      clearSelection();
      clearFixedAspectOverlay();
      notify("Eraser enabled. Drag on the image to remove areas.");
    } else {
      eraserCursorPoint = null;
    }

    render();
    updateToolbarState();
  }

  function toggleSplitMode() {
    if (!splitReframeEnabled) {
      if (
        typeof onRequestSplitAdd === "function" &&
        currentMeta &&
        !currentMeta.isSplitScreen
      ) {
        onRequestSplitAdd({
          title: currentMeta.title,
          imageUrl: currentMeta.imageUrl,
          thumbnailUrl: currentMeta.thumbnailUrl,
          pageId: currentMeta.pageId,
          fileName: currentMeta.fileName,
        });
      } else {
        notify("Split controls are available for split images only.");
      }
      return;
    }

    splitToolMode = !splitToolMode;
    if (splitToolMode) {
      cropMode = false;
      backgroundMode = false;
      colorAdjustMode = false;
      eraserMode = false;
      eraserCursorPoint = null;
      clearSelection();
      clearFixedAspectOverlay();
      notify(
        "Split mode enabled. Drag panels, pinch/wheel to zoom, or use controls.",
      );
    }

    render();
    updateToolbarState();
  }

  function editSplitInFinder() {
    if (
      !currentMeta?.isSplitScreen ||
      !Array.isArray(currentMeta.splitImages)
    ) {
      notify("This image is not a split composition.");
      return;
    }

    if (typeof onRequestSplitEdit === "function") {
      onRequestSplitEdit({
        splitLayout: currentMeta.splitLayout,
        splitImages: currentMeta.splitImages,
        canvasWidth: currentMeta.canvasWidth,
        canvasHeight: currentMeta.canvasHeight,
      });
      return;
    }

    notify("Split edit handoff is unavailable.");
  }

  function handleResize() {
    if (!isOpen) {
      return;
    }

    sizeStageCanvases();
    render();
  }

  function handleAspectRatioChange() {
    activeAspectRatio = parseAspectRatio(aspectRatioSelect?.value || "free");
    if (!cropMode) {
      clearSelection();
      return;
    }

    if (activeAspectRatio) {
      currentSelection = buildDefaultFixedSelection();
    } else {
      currentSelection = null;
    }

    render();
  }

  overlayEl.addEventListener("pointerdown", handlePointerDown);
  overlayEl.addEventListener("pointermove", handlePointerMove);
  overlayEl.addEventListener("pointerup", handlePointerUp);
  overlayEl.addEventListener("pointercancel", handlePointerUp);
  overlayEl.addEventListener("pointerleave", handlePointerLeave);
  overlayEl.addEventListener(
    "wheel",
    (event) => {
      void handleSplitReframeWheel(event);
    },
    { passive: false },
  );

  const splitNudgeStep = 32;
  splitMoveUpBtn?.addEventListener("click", () => {
    const panelIndex = getActiveSplitPanelIndex();
    void nudgeSplitPanel(panelIndex, 0, -splitNudgeStep);
  });
  splitMoveDownBtn?.addEventListener("click", () => {
    const panelIndex = getActiveSplitPanelIndex();
    void nudgeSplitPanel(panelIndex, 0, splitNudgeStep);
  });
  splitMoveLeftBtn?.addEventListener("click", () => {
    const panelIndex = getActiveSplitPanelIndex();
    void nudgeSplitPanel(panelIndex, -splitNudgeStep, 0);
  });
  splitMoveRightBtn?.addEventListener("click", () => {
    const panelIndex = getActiveSplitPanelIndex();
    void nudgeSplitPanel(panelIndex, splitNudgeStep, 0);
  });
  splitZoomInBtn?.addEventListener("click", () => {
    const panelIndex = getActiveSplitPanelIndex();
    void zoomSplitPanel(panelIndex, 1.08);
  });
  splitZoomOutBtn?.addEventListener("click", () => {
    const panelIndex = getActiveSplitPanelIndex();
    void zoomSplitPanel(panelIndex, 1 / 1.08);
  });

  backBtn.addEventListener("click", () => {
    close();
    if (typeof onBack === "function") {
      onBack();
    }
  });

  cropToggleBtn.addEventListener("click", toggleCropMode);
  removeBgBtn?.addEventListener("click", () => {
    void removeBackgroundClientSide();
  });
  backgroundBtn?.addEventListener("click", toggleBackgroundMode);
  colorAdjustBtn?.addEventListener("click", toggleColorAdjustMode);
  eraserBtn?.addEventListener("click", toggleEraserMode);
  splitModeBtn?.addEventListener("click", toggleSplitMode);
  splitEditInFinderBtn?.addEventListener("click", editSplitInFinder);
  applyCropBtn.addEventListener("click", () => {
    void applyCrop();
  });
  applyBackgroundBtn?.addEventListener("click", () => {
    void applyBackground();
  });
  applyColorAdjustBtn?.addEventListener("click", () => {
    void applyColorAdjust();
  });
  undoBtn?.addEventListener("click", () => {
    void undoLastEdit();
  });
  eraserUndoBtn?.addEventListener("click", () => {
    void undoLastEdit();
  });
  eraserRedoBtn?.addEventListener("click", () => {
    void redoLastEdit();
  });
  resetBtn.addEventListener("click", () => {
    void resetImage();
  });
  downloadBtn.addEventListener("click", downloadImage);
  aspectRatioSelect?.addEventListener("change", handleAspectRatioChange);
  eraserSizeInput?.addEventListener("input", updateEraserSizeLabel);
  eraserOpacityInput?.addEventListener("input", () => {
    updateEraserOpacityLabel();
    render();
  });
  brightnessInput?.addEventListener("input", () => {
    updateColorAdjustLabels();
    scheduleColorAdjustPreview();
  });
  brightnessInput?.addEventListener("keydown", (event) => {
    handleRangeArrowNudge(event, brightnessInput, () => {
      updateColorAdjustLabels();
      scheduleColorAdjustPreview();
    });
  });
  whiteBalanceInput?.addEventListener("input", () => {
    updateColorAdjustLabels();
    scheduleColorAdjustPreview();
  });
  whiteBalanceInput?.addEventListener("keydown", (event) => {
    handleRangeArrowNudge(event, whiteBalanceInput, () => {
      updateColorAdjustLabels();
      scheduleColorAdjustPreview();
    });
  });
  saturationInput?.addEventListener("input", () => {
    updateColorAdjustLabels();
    scheduleColorAdjustPreview();
  });
  saturationInput?.addEventListener("keydown", (event) => {
    handleRangeArrowNudge(event, saturationInput, () => {
      updateColorAdjustLabels();
      scheduleColorAdjustPreview();
    });
  });
  blackpointInput?.addEventListener("input", () => {
    updateColorAdjustLabels();
    scheduleColorAdjustPreview();
  });
  blackpointInput?.addEventListener("keydown", (event) => {
    handleRangeArrowNudge(event, blackpointInput, () => {
      updateColorAdjustLabels();
      scheduleColorAdjustPreview();
    });
  });

  const colorSliderNudgeButtons = Array.from(
    rootEl.querySelectorAll(".editor-slider-arrow[data-nudge-target]"),
  );

  function nudgeColorSliderFromButton(button) {
    const targetId = button.getAttribute("data-nudge-target") || "";
    const targetInput = rootEl.querySelector(`#${targetId}`);
    if (!(targetInput instanceof HTMLInputElement)) {
      return;
    }

    const delta = Number.parseInt(
      button.getAttribute("data-nudge-delta") || "0",
      10,
    );
    if (!Number.isFinite(delta) || delta === 0) {
      return;
    }

    const min = Number.parseFloat(targetInput.min || "-100");
    const max = Number.parseFloat(targetInput.max || "100");
    const current = Number.parseFloat(targetInput.value || "0");
    const nextValue = clamp(
      (Number.isFinite(current) ? current : 0) + delta,
      Number.isFinite(min) ? min : -100,
      Number.isFinite(max) ? max : 100,
    );
    targetInput.value = String(Math.round(nextValue));
    targetInput.focus({ preventScroll: true });
    updateColorAdjustLabels();
    scheduleColorAdjustPreview();
  }

  colorSliderNudgeButtons.forEach((button) => {
    let repeatDelayTimer = null;
    let repeatIntervalTimer = null;
    let suppressNextClick = false;

    const clearNudgeRepeatTimers = () => {
      if (repeatDelayTimer) {
        window.clearTimeout(repeatDelayTimer);
        repeatDelayTimer = null;
      }
      if (repeatIntervalTimer) {
        window.clearInterval(repeatIntervalTimer);
        repeatIntervalTimer = null;
      }
    };

    button.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "touch") {
        return;
      }

      event.preventDefault();
      suppressNextClick = true;
      nudgeColorSliderFromButton(button);

      clearNudgeRepeatTimers();
      repeatDelayTimer = window.setTimeout(() => {
        repeatIntervalTimer = window.setInterval(() => {
          nudgeColorSliderFromButton(button);
        }, 70);
      }, 260);
    });

    button.addEventListener("pointerup", clearNudgeRepeatTimers);
    button.addEventListener("pointercancel", clearNudgeRepeatTimers);
    button.addEventListener("pointerleave", clearNudgeRepeatTimers);

    button.addEventListener("click", (event) => {
      if (suppressNextClick) {
        suppressNextClick = false;
        event.preventDefault();
        return;
      }

      nudgeColorSliderFromButton(button);
    });
  });

  window.addEventListener("resize", handleResize);

  sizeStageCanvases();
  updateEraserSizeLabel();
  updateEraserOpacityLabel();
  setColorAdjustInputs(null);
  render();

  rootEl.classList.add("hidden");

  return {
    open,
    close,
    isOpen: () => isOpen,
  };
}
