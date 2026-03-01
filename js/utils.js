export function triggerDownload(blob, fileName) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export function slugifyFileName(value = "") {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "wikimedia-image";
}

export function removeCommonImageExtension(value = "") {
  return value.replace(/\.(jpg|jpeg|png|gif|webp|tiff|tif|svg|bmp)$/i, "");
}

export function normalizeAuthor(value = "") {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return "";
  }

  const normalizedForCheck = trimmed.toLowerCase().replace(/[^a-z]/g, "");
  const hasUnknown =
    normalizedForCheck.includes("unknown")
    || normalizedForCheck.includes("uknown");

  return hasUnknown ? "" : trimmed;
}

export function cleanFileTitle(title = "") {
  return title.replace(/^File:/i, "").replace(/_/g, " ");
}

export function stripHtml(value = "") {
  const parser = new DOMParser();
  const doc = parser.parseFromString(value, "text/html");
  return doc.body.textContent?.trim() || "";
}

export function parseCommonsMetadataDate(rawValue) {
  const stripped = stripHtml(rawValue || "").trim();
  if (!stripped) {
    return NaN;
  }

  const normalizedDate = stripped.replace(
    /^(\d{4}):(\d{2}):(\d{2})(.*)$/,
    "$1-$2-$3$4",
  );
  const normalizedDateTime = normalizedDate.replace(
    /^(\d{4}-\d{2}-\d{2})\s(\d{2}:\d{2}:\d{2})(.*)$/,
    "$1T$2$3",
  );

  const directParse = Date.parse(normalizedDateTime);
  if (Number.isFinite(directParse)) {
    return directParse;
  }

  const utcParse = Date.parse(`${normalizedDateTime}Z`);
  if (Number.isFinite(utcParse)) {
    return utcParse;
  }

  return NaN;
}

export function escapeHtml(value = "") {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function escapeAttribute(value = "") {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

export function escapeShortcodeValue(value = "") {
  return value.replaceAll('"', '\\"');
}
