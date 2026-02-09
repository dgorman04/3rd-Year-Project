// lib/config.js
// API URL is read from .env (in this SportsHub folder).
//
// Use ngrok: set EXPO_PUBLIC_API_BASE to your ngrok URL (e.g. https://xxxx.ngrok-free.app).
// This is used for both web and mobile. Run: ngrok http 8000
// Then stop Expo and run "npx expo start" again after changing .env.
//
// Optional: EXPO_PUBLIC_WS_URL for websockets (e.g. wss://xxxx.ngrok-free.app)

const IS_WEB = typeof window !== "undefined";
const IS_LOCAL_WEB =
  IS_WEB &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1");

// Use ngrok (or EXPO_PUBLIC_API_BASE) everywhere when set — the only way it works
// for phone and often for web. Only fall back to localhost when no API base is set.
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

export function ngrokHeaders() {
  // Safe to always include; only matters when using ngrok.
  return { "ngrok-skip-browser-warning": "true" };
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
