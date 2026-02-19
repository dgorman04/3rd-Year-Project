/**
 * Unit tests for lib/config.js (API URL and normalizeRecordingUrl).
 */
const originalEnv = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = { ...originalEnv };
});

afterAll(() => {
  process.env = originalEnv;
});

describe("config", () => {
  test("API and API_BASE_URL are defined", () => {
    const { API, API_BASE_URL } = require("../../lib/config");
    expect(typeof API).toBe("string");
    expect(API.length).toBeGreaterThan(0);
    expect(API).toContain("/api");
    expect(typeof API_BASE_URL).toBe("string");
  });

  test("normalizeRecordingUrl returns null for empty input", () => {
    const { normalizeRecordingUrl } = require("../../lib/config");
    expect(normalizeRecordingUrl(null)).toBeNull();
    expect(normalizeRecordingUrl("")).toBeNull();
    expect(normalizeRecordingUrl(undefined)).toBeNull();
  });

  test("normalizeRecordingUrl keeps S3 URLs", () => {
    const { normalizeRecordingUrl } = require("../../lib/config");
    const url = "https://stato-recording.s3.eu-north-1.amazonaws.com/media/recording.mp4";
    const result = normalizeRecordingUrl(url);
    expect(result).toBe(url);
  });

  test("normalizeRecordingUrl prepends base to path-only URL", () => {
    const { normalizeRecordingUrl } = require("../../lib/config");
    const result = normalizeRecordingUrl("/media/recordings/video.mp4");
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
    expect(result).toContain("/media/recordings/video.mp4");
  });
});
