// lib/config.js
// Configure endpoints via Expo public env vars (recommended):
// - EXPO_PUBLIC_API_BASE, e.g. "http://192.168.0.216:8000"
// - EXPO_PUBLIC_WS_URL, e.g. "ws://192.168.0.216:3001"
//
// Fallbacks:
// - Web: API defaults to http://localhost:8000
// - WS defaults to ws://localhost:3001 (matches your current Node server log)

const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE ||
  (typeof window !== "undefined" ? "http://localhost:8000" : "http://localhost:8000");

export const API = `${API_BASE}/api`;

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
