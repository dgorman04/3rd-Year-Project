/** Jest setup: define globals used by app code */
if (typeof global.__DEV__ === "undefined") {
  global.__DEV__ = false;
}
