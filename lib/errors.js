"use strict";

const CODES = {
  PATCH_SEALED: "PATCH_SEALED",
  PATCH_NEEDS_FIND: "PATCH_NEEDS_FIND",
  MATCH_COUNT: "MATCH_COUNT",
  PATH_INVALID: "PATH_INVALID",
  PATH_DENIED: "PATH_DENIED",
  UNKNOWN_MOD: "UNKNOWN_MOD",
  UNKNOWN_API: "UNKNOWN_API",
  NO_WINDOW: "NO_WINDOW",
  NO_HANDLER: "NO_HANDLER",
  IPC_INVOKE: "IPC_INVOKE",
  RELOAD: "RELOAD",
};

function sfError(code, message) {
  const err = new Error(message || code);
  err.name = "SandforgeError";
  err.code = code;
  return err;
}

module.exports = { CODES, sfError };
