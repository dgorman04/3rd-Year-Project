/**
 * Unit tests for lib/auth.js (token get/set/clear).
 */
const mockAsyncStorage = {
  store: {},
  getItem: jest.fn((key) => Promise.resolve(mockAsyncStorage.store[key] ?? null)),
  setItem: jest.fn((key, value) => {
    mockAsyncStorage.store[key] = value;
    return Promise.resolve();
  }),
  removeItem: jest.fn((key) => {
    delete mockAsyncStorage.store[key];
    return Promise.resolve();
  }),
};

jest.mock("@react-native-async-storage/async-storage", () => mockAsyncStorage);

const KEY = "SPORTSHUB_TOKEN";

describe("auth", () => {
  beforeEach(() => {
    mockAsyncStorage.store = {};
    mockAsyncStorage.getItem.mockClear();
    mockAsyncStorage.setItem.mockClear();
    mockAsyncStorage.removeItem.mockClear();
  });

  test("getToken returns null when nothing stored", async () => {
    const { getToken } = require("../../lib/auth");
    const token = await getToken();
    expect(token).toBeNull();
    expect(mockAsyncStorage.getItem).toHaveBeenCalledWith(KEY);
  });

  test("setToken stores token and getToken returns it", async () => {
    const { setToken, getToken } = require("../../lib/auth");
    await setToken("abc123");
    expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(KEY, "abc123");
    const token = await getToken();
    expect(token).toBe("abc123");
  });

  test("clearToken removes token", async () => {
    const { setToken, clearToken, getToken } = require("../../lib/auth");
    await setToken("xyz");
    await clearToken();
    expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith(KEY);
    const token = await getToken();
    expect(token).toBeNull();
  });
});
