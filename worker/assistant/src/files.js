// Validation of the single file a visitor may attach to a message. Files are never stored:
// they are checked here and passed to the model as a base64 content block for this one request.

export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_PDF_PAGES = 10;

const TYPES = {
  "image/jpeg": (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  "image/gif": (b) => b.length > 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 &&
    (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61,
  "image/webp": (b) => b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  "application/pdf": (b) => b.length > 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d,
};

export const ALLOWED_TYPES = Object.keys(TYPES);

export class FileError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function decodeBase64(data) {
  if (typeof data !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(data) || data.length % 4 !== 0) {
    throw new FileError("bad_file");
  }
  // 4 MB of bytes is at most ~5.6 M base64 characters; anything longer is rejected before decoding.
  if (data.length > Math.ceil(MAX_FILE_BYTES / 3) * 4) throw new FileError("file_too_big");
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, binary };
}

// Counts "/Type /Page" objects (not "/Pages"). Compressed object streams can hide pages, so this is a
// best-effort check; the size limit always applies.
export function countPdfPages(binary) {
  const matches = binary.match(/\/Type\s*\/Page(?![a-zA-Z])/g);
  return matches ? matches.length : 0;
}

/** Returns {mediaType, data, kind} for a valid attachment, or throws FileError. */
export function validateAttachment(attachment) {
  if (attachment === null || attachment === undefined) return null;
  if (typeof attachment !== "object" || Array.isArray(attachment)) throw new FileError("bad_file");
  const mediaType = attachment.type;
  if (!Object.prototype.hasOwnProperty.call(TYPES, mediaType)) throw new FileError("bad_file_type");
  const { bytes, binary } = decodeBase64(attachment.data);
  if (bytes.length === 0) throw new FileError("bad_file");
  if (bytes.length > MAX_FILE_BYTES) throw new FileError("file_too_big");
  if (!TYPES[mediaType](bytes)) throw new FileError("bad_file_type");
  if (mediaType === "application/pdf" && countPdfPages(binary) > MAX_PDF_PAGES) throw new FileError("pdf_too_long");
  return { mediaType, data: attachment.data, kind: mediaType === "application/pdf" ? "document" : "image" };
}
