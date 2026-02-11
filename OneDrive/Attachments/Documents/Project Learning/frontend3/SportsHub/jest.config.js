/** Jest config for SportsHub. Run with: npm test */
module.exports = {
  testEnvironment: "node",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testMatch: ["**/__tests__/**/*.test.js", "**/__tests__/**/*.test.jsx"],
  moduleFileExtensions: ["js", "jsx", "ts", "tsx", "json"],
  transform: {
    "^.+\\.[jt]sx?$": "babel-jest",
  },
  transformIgnorePatterns: [
    // Allow Expo's virtual env shim to be transformed so `export` syntax is handled
    "node_modules/(?!expo/virtual/.*)",
  ],
};
