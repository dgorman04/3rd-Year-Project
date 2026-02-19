// lib/config.js
// API + WebSocket URLs are read from .env (in this SportsHub folder).
//
// Typical production setup (e.g. Railway):
//   EXPO_PUBLIC_API_BASE=https://your-backend.up.railway.app
//   EXPO_PUBLIC_WS_URL=wss://your-ws-service.up.railway.app
//
// For local development you can omit these and it will fall back to localhost.

const IS_WEB = typeof window !== "undefined";
const IS_LOCAL_WEB =
  IS_WEB &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1");

// Prefer EXPO_PUBLIC_API_BASE when set; otherwise use localhost (good for dev).
const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE ||
  process.env.EXPO_PUBLIC_API_BASE_WEB ||
  (IS_LOCAL_WEB ? "http://localhost:8000" : "http://localhost:8000");

export const API = `${API_BASE}/api`;
export const API_BASE_URL = API_BASE;

export const WS_URL = process.env.EXPO_PUBLIC_WS_URL || "ws://localhost:3001";

// Log API URL for debugging (only in development)
if (__DEV__) {
  console.log("API Base URL:", API_BASE);
  console.log("Full API URL:", API);
}

// Legacy helper kept for compatibility with existing code.
// Currently returns an empty object and has no effect on requests.
export function ngrokHeaders() {
  return {};
}

/**
 * Normalize recording URL so the video is always loaded from a valid host.
 *
 * - If the backend returns a relative path (e.g. `/media/...`), we prepend the API base.
 * - If the URL already points at S3 (or another cloud storage host), we keep it as-is so
 *   the browser can stream directly from cloud.
 * - For other mismatched origins (e.g. localhost vs ngrok), we rewrite to the API origin.
 */
export function normalizeRecordingUrl(recordingUrl) {
  if (!recordingUrl || typeof recordingUrl !== "string") return null;
  const base = API_BASE.replace(/\/$/, "");

  // Relative path from backend – serve via the API host.
  if (recordingUrl.startsWith("/")) return `${base}${recordingUrl}`;

  try {
    const url = new URL(recordingUrl);
    const baseOrigin = new URL(API_BASE).origin;
    const host = url.hostname || "";

    // S3 / cloud storage hosts should not be rewritten.
    const isS3Like =
      host.includes("s3.") ||
      host.endsWith(".amazonaws.com");

    if (isS3Like) {
      return recordingUrl;
    }

    // For non-S3 URLs on a different origin, normalize to the API origin.
    if (url.origin !== baseOrigin) {
      return `${baseOrigin}${url.pathname}${url.search}`;
    }
  } catch (_) {}

  return recordingUrl;
}
