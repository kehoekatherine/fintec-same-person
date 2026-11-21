export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const ACCEPTED = new Set(["csv", "json", "jsonl"]);

export function fileExtension(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function isAcceptedExtension(extension: string): extension is "csv" | "json" | "jsonl" {
  return ACCEPTED.has(extension);
}

const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

export function contentLengthRejection(header: string | null): string | null {
  if (header == null || header.trim() === "") return "The upload needs a content length.";
  if (!/^\d+$/.test(header.trim())) return "The upload content length is not a number.";
  const size = Number(header);
  if (size > MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES) return "That file is larger than 8 MB.";
  return null;
}

export function uploadRejection(name: string, size: number): string | null {
  if (!isAcceptedExtension(fileExtension(name))) {
    return "Only .csv, .json, and .jsonl files can be added.";
  }
  if (size > MAX_UPLOAD_BYTES) {
    return "That file is larger than 8 MB.";
  }
  return null;
}

export function displayFileName(name: string): string {
  const base = name.split(/[/\\]/).pop()?.trim() || "upload";
  return base.slice(0, 180);
}
