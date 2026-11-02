// Root barrel — re-exports the mem (session recall) public API so callers can
// `import { ... } from "@zachary/trellis-core"`. The `/mem` sub-path import
// remains available.

export * from "./mem/index.js";
