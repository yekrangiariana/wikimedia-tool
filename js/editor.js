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
    image.crossOrigin = "anonymous";
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
  eraserBtn,
  applyCropBtn,
  applyBackgroundBtn,
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
  onBack,
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
  const selectionMinSize = 24;
  const handleRadius = 8;
  const handleSize = 10;

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
    cropToggleBtn.classList.toggle("active-tab", cropMode);
    cropToggleBtn.disabled = isBusy;
    if (backgroundBtn) {
      backgroundBtn.classList.toggle("active-tab", backgroundMode);
      backgroundBtn.disabled = isBusy;
    }
    if (eraserBtn) {
      eraserBtn.classList.toggle("active-tab", eraserMode);
      eraserBtn.disabled = isBusy;
    }
    applyCropBtn.disabled = !hasSelection || isBusy;
    if (applyBackgroundBtn) {
      applyBackgroundBtn.disabled = !workingCanvas || isBusy;
    }
    if (undoBtn) {
      undoBtn.disabled = operationHistory.length === 0 || isBusy;
    }
    if (eraserUndoBtn) {
      eraserUndoBtn.disabled = operationHistory.length === 0 || isBusy;
    }
    if (eraserRedoBtn) {
      eraserRedoBtn.disabled = redoHistory.length === 0 || isBusy;
    }
    if (removeBgBtn) {
      removeBgBtn.disabled = !workingCanvas || isBusy;
    }
    resetBtn.disabled = !workingCanvas || isBusy;
    downloadBtn.disabled = !workingCanvas || isBusy;
    if (aspectRatioRow) {
      aspectRatioRow.classList.toggle("hidden", !cropMode);
    }

    if (cropContentEl) {
      cropContentEl.classList.toggle("hidden", !cropMode);
    }

    if (backgroundContentEl) {
      backgroundContentEl.classList.toggle("hidden", !backgroundMode);
    }

    if (eraserContentEl) {
      eraserContentEl.classList.toggle("hidden", !eraserMode);
    }

    if (cropHintEl) {
      cropHintEl.classList.toggle(
        "hidden",
        cropMode || backgroundMode || eraserMode,
      );
    }

    if (historyInfoEl) {
      historyInfoEl.textContent =
        operationHistory.length > 0
          ? `You have made ${operationHistory.length} edit${operationHistory.length === 1 ? "" : "s"}.`
          : "You have not made any edits yet.";
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
      dimensionsEl.textContent = "";
      return;
    }

    dimensionsEl.textContent = `Current image size is ${workingCanvas.width} × ${workingCanvas.height} pixels.`;
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

  function drawSelectionOverlay() {
    overlayContext.clearRect(0, 0, overlayEl.width, overlayEl.height);

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

    if (isTouchPointerEvent(event) && (cropMode || eraserMode)) {
      event.preventDefault();
    }

    if (eraserMode) {
      eraserCursorPoint = clampPointToRenderBox(pointerToCanvasPoint(event));
      beginEraserStroke(event);
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

    if (eraserMode) {
      await finishEraserStroke(event);
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
    if (!meta?.imageUrl) {
      throw new Error("No image URL provided for editor.");
    }

    const sessionId = ++openSessionId;
    const sourceUrl = meta.startImageUrl || meta.imageUrl;
    const workingImage = await loadImage(sourceUrl);
    const nextWorking = createCanvasFromImage(workingImage);

    originalCanvas = null;
    originalCanvasLoadPromise = null;
    backgroundSourceCanvas = null;
    workingCanvas = nextWorking;
    currentMeta = {
      title: meta.title || "Image editor",
      fileName: meta.fileName || "edited-image.png",
      imageUrl: meta.imageUrl,
      thumbnailUrl: meta.thumbnailUrl || "",
      pageId: Number.isInteger(meta.pageId) ? meta.pageId : null,
      editKey: meta.editKey || "",
    };

    titleEl.textContent = currentMeta.title;
    operationHistory = Array.isArray(meta.operations)
      ? normalizeEditOperations(meta.operations)
      : Array.isArray(meta.history)
        ? normalizeEditOperations(
            meta.history.map((step) => ({ type: "crop", ...step })),
          )
        : [];
    redoHistory = [];
    hasEdits = operationHistory.length > 0 || sourceUrl !== meta.imageUrl;
    cropMode = false;
    backgroundMode = false;
    eraserMode = false;
    eraserStrokeActive = false;
    eraserStrokePoints = [];
    eraserStrokePointerId = null;
    eraserCursorPoint = null;
    activeAspectRatio = parseAspectRatio(aspectRatioSelect?.value || "free");
    isOpen = true;

    if (sourceUrl === meta.imageUrl) {
      originalCanvas = createCanvasFromImage(workingImage);
    } else {
      void ensureOriginalCanvasLoaded(sessionId);
    }

    if (operationHistory.length > 0 && sourceUrl === meta.imageUrl) {
      await rebuildWorkingFromHistory();
    }
    initializeSessionSnapshots();
    clearSelection();
    sizeStageCanvases();
    render();
  }

  function close() {
    openSessionId += 1;
    isOpen = false;
    cropMode = false;
    backgroundMode = false;
    eraserMode = false;
    eraserStrokeActive = false;
    eraserStrokePoints = [];
    eraserStrokePointerId = null;
    eraserCursorPoint = null;
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
      eraserMode = false;
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
      eraserMode = false;
      eraserCursorPoint = null;
      clearSelection();
      clearFixedAspectOverlay();
      notify("Background tool enabled. Pick a colour and apply.");
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
      clearSelection();
      clearFixedAspectOverlay();
      notify("Eraser enabled. Drag on the image to remove areas.");
    } else {
      eraserCursorPoint = null;
    }

    render();
    updateToolbarState();
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
  eraserBtn?.addEventListener("click", toggleEraserMode);
  applyCropBtn.addEventListener("click", () => {
    void applyCrop();
  });
  applyBackgroundBtn?.addEventListener("click", () => {
    void applyBackground();
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

  window.addEventListener("resize", handleResize);

  sizeStageCanvases();
  updateEraserSizeLabel();
  updateEraserOpacityLabel();
  render();

  rootEl.classList.add("hidden");

  return {
    open,
    close,
    isOpen: () => isOpen,
  };
}
