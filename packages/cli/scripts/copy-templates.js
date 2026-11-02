#!/usr/bin/env node

/**
 * Copy src/templates/ (the bundled skills) to dist/templates/, skipping
 * TypeScript sources and OS cache files.
 */

import { cpSync } from "node:fs";
import { basename, extname } from "node:path";

const EXCLUDED_ENTRIES = new Set([".DS_Store"]);

cpSync("src/templates", "dist/templates", {
  recursive: true,
  filter: (src) =>
    !EXCLUDED_ENTRIES.has(basename(src)) && extname(src) !== ".ts",
});
console.log("Copied src/templates/ to dist/templates/");
