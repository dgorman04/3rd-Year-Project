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
 * Normalize recording URL so the video is always loaded from the same host as the API.
 * Fixes DEMUXER_ERROR when backend returns localhost but the app is opened via ngrok.
 */
export function normalizeRecordingUrl(recordingUrl) {
  if (!recordingUrl || typeof recordingUrl !== "string") return null;
  const base = API_BASE.replace(/\/$/, "");
  if (recordingUrl.startsWith("/")) return `${base}${recordingUrl}`;
  try {
    const baseOrigin = new URL(API_BASE).origin;
    const url = new URL(recordingUrl);
    if (url.origin !== baseOrigin) return `${baseOrigin}${url.pathname}${url.search}`;
  } catch (_) {}
  return recordingUrl;
}
