function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function cloneCanvas(sourceCanvas) {
  const clone = createCanvas(sourceCanvas.width, sourceCanvas.height);
  const context = clone.getContext("2d");
  if (!context) {
    throw new Error("Canvas context unavailable");
  }
  context.drawImage(sourceCanvas, 0, 0);
  return clone;
}

function cropCanvas(sourceCanvas, rect) {
  const safeX = clamp(rect.x, 0, Math.max(0, sourceCanvas.width - 1));
  const safeY = clamp(rect.y, 0, Math.max(0, sourceCanvas.height - 1));
  const safeWidth = clamp(rect.width, 1, sourceCanvas.width - safeX);
  const safeHeight = clamp(rect.height, 1, sourceCanvas.height - safeY);

  const nextCanvas = createCanvas(safeWidth, safeHeight);
  const nextContext = nextCanvas.getContext("2d");
  if (!nextContext) {
    throw new Error("Canvas context unavailable");
  }

  nextContext.drawImage(
    sourceCanvas,
    safeX,
    safeY,
    safeWidth,
    safeHeight,
    0,
    0,
    safeWidth,
    safeHeight,
  );

  return nextCanvas;
}

async function canvasToBlob(canvas, mimeType = "image/png") {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to encode canvas"));
          return;
        }
        resolve(blob);
      },
      mimeType,
      0.92,
    );
  });
}

let removeBackgroundModulePromise = null;

async function getBackgroundRemovalFunction() {
  if (removeBackgroundModulePromise) {
    return removeBackgroundModulePromise;
  }

  removeBackgroundModulePromise =
    import("https://cdn.jsdelivr.net/npm/@imgly/background-removal/+esm").then(
      (module) => {
        const removeBackground = module?.default || module?.removeBackground;
        if (typeof removeBackground !== "function") {
          throw new Error("Background removal module unavailable");
        }
        return removeBackground;
      },
    );

  return removeBackgroundModulePromise;
}

async function cutoutCanvas(sourceCanvas) {
  const removeBackground = await getBackgroundRemovalFunction();
  const inputBlob = await canvasToBlob(sourceCanvas, "image/png");
  const outputBlob = await removeBackground(inputBlob, {
    output: {
      format: "image/png",
    },
  });

  if (!(outputBlob instanceof Blob)) {
    throw new Error("Cutout returned an invalid image");
  }

  const outputBitmap = await createImageBitmap(outputBlob);
  try {
    const nextCanvas = createCanvas(outputBitmap.width, outputBitmap.height);
    const nextContext = nextCanvas.getContext("2d");
    if (!nextContext) {
      throw new Error("Canvas context unavailable");
    }

    nextContext.drawImage(outputBitmap, 0, 0);
    return nextCanvas;
  } finally {
    outputBitmap.close();
  }
}

function normalizeCropOperation(step) {
  return {
    type: "crop",
    x: Number(step?.x),
    y: Number(step?.y),
    width: Number(step?.width),
    height: Number(step?.height),
  };
}

function normalizeBackgroundOperation(step) {
  const raw = typeof step?.color === "string" ? step.color.trim() : "";
  const color = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw) ? raw : "#ffffff";
  return {
    type: "background",
    color,
  };
}

function applyBackgroundColor(sourceCanvas, color) {
  const nextCanvas = createCanvas(sourceCanvas.width, sourceCanvas.height);
  const nextContext = nextCanvas.getContext("2d");
  if (!nextContext) {
    throw new Error("Canvas context unavailable");
  }

  nextContext.fillStyle = color || "#ffffff";
  nextContext.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
  nextContext.drawImage(sourceCanvas, 0, 0);
  return nextCanvas;
}

function normalizeEraseOperation(step) {
  const rawSize = Number(step?.size);
  const size = Number.isFinite(rawSize)
    ? clamp(Math.round(rawSize), 1, 300)
    : 20;
  const rawOpacity = Number(step?.opacity);
  const opacity = Number.isFinite(rawOpacity) ? clamp(rawOpacity, 0.05, 1) : 1;

  const points = Array.isArray(step?.points)
    ? step.points
        .map((point) => ({
          x: Number(point?.x),
          y: Number(point?.y),
        }))
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    : [];

  return {
    type: "erase",
    size,
    opacity,
    points,
  };
}

function applyEraseOperation(sourceCanvas, operation) {
  const nextCanvas = cloneCanvas(sourceCanvas);
  const nextContext = nextCanvas.getContext("2d");
  if (!nextContext) {
    throw new Error("Canvas context unavailable");
  }

  const size = clamp(Number(operation?.size) || 20, 1, 300);
  const opacity = clamp(Number(operation?.opacity) || 1, 0.05, 1);
  const points = Array.isArray(operation?.points) ? operation.points : [];
  if (!points.length) {
    return nextCanvas;
  }

  nextContext.save();
  nextContext.globalCompositeOperation = "destination-out";
  nextContext.globalAlpha = opacity;
  nextContext.lineCap = "round";
  nextContext.lineJoin = "round";
  nextContext.strokeStyle = "rgba(0,0,0,1)";
  nextContext.fillStyle = "rgba(0,0,0,1)";
  nextContext.lineWidth = size;

  if (points.length === 1) {
    const point = points[0];
    nextContext.beginPath();
    nextContext.arc(point.x, point.y, size / 2, 0, Math.PI * 2);
    nextContext.fill();
  } else {
    nextContext.beginPath();
    nextContext.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      nextContext.lineTo(points[index].x, points[index].y);
    }
    nextContext.stroke();
  }

  nextContext.restore();
  return nextCanvas;
}

/**
 * Normalizes and validates editor operations.
 *
 * This is the canonical operation schema used by the whole app:
 * - { type: "cutout" }
 * - { type: "background", color }
 * - { type: "crop", x, y, width, height }
 *
 * Any future editor feature should add a new operation type here first,
 * then update `applyEditOperationsToCanvas` to execute it.
 */
export function normalizeEditOperations(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((step) => {
      if (step?.type === "cutout") {
        return { type: "cutout" };
      }

      if (step?.type === "background") {
        return normalizeBackgroundOperation(step);
      }

      if (step?.type === "erase") {
        return normalizeEraseOperation(step);
      }

      if (step?.type === "crop") {
        return normalizeCropOperation(step);
      }

      if (
        step &&
        Number.isFinite(Number(step.x)) &&
        Number.isFinite(Number(step.y)) &&
        Number.isFinite(Number(step.width)) &&
        Number.isFinite(Number(step.height))
      ) {
        return normalizeCropOperation(step);
      }

      return null;
    })
    .filter(
      (step) =>
        step &&
        (step.type === "cutout" ||
          step.type === "background" ||
          (step.type === "erase" && Array.isArray(step.points)) ||
          (Number.isFinite(step.x) &&
            Number.isFinite(step.y) &&
            Number.isFinite(step.width) &&
            Number.isFinite(step.height) &&
            step.width > 0 &&
            step.height > 0)),
    );
}

/**
 * Applies the normalized operation chain to a base canvas.
 *
 * Why this exists:
 * - keeps preview rendering, editor reopen, and gallery downloads consistent
 * - prevents feature-specific logic from diverging across files
 */
export async function applyEditOperationsToCanvas(baseCanvas, operations) {
  const normalizedOperations = normalizeEditOperations(operations);
  let workingCanvas = cloneCanvas(baseCanvas);

  for (const operation of normalizedOperations) {
    if (operation.type === "cutout") {
      workingCanvas = await cutoutCanvas(workingCanvas);
      continue;
    }

    if (operation.type === "background") {
      workingCanvas = applyBackgroundColor(workingCanvas, operation.color);
      continue;
    }

    if (operation.type === "erase") {
      workingCanvas = applyEraseOperation(workingCanvas, operation);
      continue;
    }

    if (operation.type === "crop") {
      workingCanvas = cropCanvas(workingCanvas, operation);
    }
  }

  return workingCanvas;
}

/**
 * Builds a browser object URL preview by applying operations to the source image URL.
 *
 * Used by finder/gallery preview and download source resolution.
 */
export async function buildEditedPreviewUrlFromImageUrl(imageUrl, operations) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Image fetch failed with status ${response.status}`);
  }

  const sourceBlob = await response.blob();
  const sourceBitmap = await createImageBitmap(sourceBlob);

  try {
    const sourceCanvas = createCanvas(sourceBitmap.width, sourceBitmap.height);
    const sourceContext = sourceCanvas.getContext("2d");
    if (!sourceContext) {
      throw new Error("Canvas context unavailable");
    }
    sourceContext.drawImage(sourceBitmap, 0, 0);

    const editedCanvas = await applyEditOperationsToCanvas(
      sourceCanvas,
      operations,
    );
    const previewBlob = await canvasToBlob(editedCanvas, "image/png");
    return URL.createObjectURL(previewBlob);
  } finally {
    sourceBitmap.close();
  }
}

/**
 * Legacy compatibility helper for features that still need crop-only history.
 */
export function extractCropHistory(operations) {
  return normalizeEditOperations(operations)
    .filter((step) => step.type === "crop")
    .map((step) => ({
      x: step.x,
      y: step.y,
      width: step.width,
      height: step.height,
    }));
}
