/**
 * Persisted DeepSeek Harness (dsh) session reader.
 *
 * Layout: `<DSH_HOME>/sessions/<cwd-group>/<session-id>/session.<gen>.jsonl.zstd`,
 * where `DSH_HOME` falls back to `~/.dsh`. The group directory encodes the cwd,
 * but the header record carries `cwd` verbatim, so no path decoding is needed
 * (unlike Claude Code's `~/.claude/projects/`).
 *
 * ## Physical encoding: a concatenation of independent zstd frames
 *
 * dsh's own persistence contract describes the artifact as "a standard
 * concatenation of independent Zstandard frames — one checksummed frame per
 * append batch". A decoder must therefore walk frames: one call returns only
 * the FIRST frame, which for a real session is just the ~200 B header.
 * Measured on a local 1.25 MB / 662-frame log: a single call yields 1 record,
 * while decoding every frame yields all 1179.
 *
 * Frame starts are located by scanning for the zstd frame magic (0x28B52FFD)
 * and decoding from each candidate offset; a candidate that is not a real
 * frame start fails its header parse and is skipped. Validated against six
 * local sessions: zero undecodable frames and a gap-free `seq` sequence
 * (0..N-1), so the walk was lossless on that sample. A frame that fails to
 * decode is reported through the warnings sink rather than dropped silently,
 * because silent loss would understate the dialogue.
 *
 * `zlib.zstdDecompressSync` is a Node 22.15 / 23.8+ runtime feature, newer than
 * this package's declared `@types/node`, so it is reached through a narrow
 * local type. Absent it the adapter raises an actionable error instead of
 * pretending the session is empty.
 *
 * ## Dialogue mapping (validated against real records)
 *
 * - `user/message`       → user turn, text parts of `data.content`
 * - `assistant/message`  → assistant turn, text parts of `data.message.content`
 * - `system/message`     → SKIPPED: it carries the platform system prompt.
 *                          `stripInjectionTags` cannot catch it (it is not
 *                          tag-wrapped), so skipping by type is required or
 *                          every search hit would be dominated by it.
 * - `agent/inbox/spliced`→ SKIPPED: the same user message as its paired
 *                          `user/message` (identical `data.id` / `source.rpcId`),
 *                          so counting both would double every user turn.
 * - tool / step / turn / command / session records are not dialogue.
 *
 * No compaction record type was observed in any local session, so this adapter
 * emits no `compactionBoundaryTurn`; revisit once a compacted log is available.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

import { isBootstrapTurn, stripInjectionTags } from "../dialogue.js";
import { inRangeOverlap, sameProject } from "../filter.js";
import { dshSessionsDir, walkDir } from "../internal/paths.js";
import { parseTaskPyCommandsAll } from "../phase.js";
import { searchInDialogue } from "../search.js";
import type {
  DialogueTurn,
  MemFilter,
  MemSessionInfo,
  MemWarning,
  SearchHit,
  TaskPyEvent,
} from "../types.js";

/** zstd frame magic (`ZSTD_MAGICNUMBER`, little-endian). */
const FRAME_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

/**
 * Session log file names across format generations: `session.jsonl.zstd` (v0),
 * `session.v1|v2|v3.jsonl.zstd`; an uncompressed deployment (`compression:
 * 'none'`) drops the `.zstd` suffix.
 */
const SESSION_FILE = /^session(\.[\w-]+)*\.jsonl(\.zstd)?$/;

/** Shell tool names whose `arguments.command` can carry a `task.py` call. */
const SHELL_TOOL = /^(pwsh|bash|shell|sh|zsh|terminal|pwsh_persistent|bash_persistent)$/;

const WARN_FRAME_LOSS = "dsh-undecodable-frame";

type ZstdDecompressor = (data: Buffer) => Buffer;

let cachedZstd: ZstdDecompressor | undefined;

/**
 * Resolve `node:zlib`'s synchronous zstd decompressor.
 *
 * Reached through a local type because the runtime feature postdates this
 * package's `@types/node`. Throws an actionable message when the running Node
 * build lacks it — a silent empty result would look like "the session has no
 * dialogue", which is the one failure mode this adapter must never fake.
 */
function zstdDecompress(): ZstdDecompressor {
  if (cachedZstd) return cachedZstd;
  const candidate = (zlib as unknown as { zstdDecompressSync?: ZstdDecompressor })
    .zstdDecompressSync;
  if (typeof candidate !== "function") {
    throw new Error(
      "mem dsh adapter needs zstd decompression, which this Node build lacks " +
        `(node:zlib zstdDecompressSync is available from Node 22.15 / 23.8; running ${process.version}).`,
    );
  }
  cachedZstd = candidate;
  return candidate;
}

interface DshTextPart {
  type?: string;
  text?: string;
}

interface DshRecord {
  type?: string;
  seq?: number;
  time?: number;
  data?: {
    id?: string;
    content?: DshTextPart[];
    message?: { role?: string; content?: DshTextPart[] };
    name?: string;
    arguments?: unknown;
  };
}

interface DshHeader {
  type?: string;
  id?: string;
  createdAt?: number;
  cwd?: string;
}

/** Offsets of every zstd frame start in `raw`. */
function frameOffsets(raw: Buffer): number[] {
  const offsets: number[] = [];
  for (let i = raw.indexOf(FRAME_MAGIC); i !== -1; i = raw.indexOf(FRAME_MAGIC, i + 4)) {
    offsets.push(i);
  }
  return offsets;
}

/** Decode one frame starting at `offset`; `undefined` when it is not a frame. */
function decodeFrame(raw: Buffer, offset: number): string | undefined {
  try {
    return zstdDecompress()(raw.subarray(offset)).toString("utf8");
  } catch {
    return undefined;
  }
}

function parseLine(line: string): DshRecord | undefined {
  if (!line.trim()) return undefined;
  try {
    return JSON.parse(line) as DshRecord;
  } catch {
    return undefined;
  }
}

/** First record with `type: "session"` in a decoded chunk. */
function findHeader(text: string): DshHeader | undefined {
  for (const line of text.split("\n")) {
    const obj = parseLine(line);
    if (obj?.type === "session") return obj as DshHeader;
  }
  return undefined;
}

/**
 * Decode the whole log. A deployment with `compression: 'none'` writes plain
 * newline-delimited UTF-8 and carries no frame magic, so that case is read
 * directly. Frames that fail to decode are counted and reported once.
 */
function decodeAllText(filePath: string, s: MemSessionInfo, warnings?: MemWarning[]): string {
  const raw = fs.readFileSync(filePath);
  const offsets = frameOffsets(raw);
  if (offsets.length === 0) return raw.toString("utf8");
  const parts: string[] = [];
  let lost = 0;
  for (const offset of offsets) {
    const text = decodeFrame(raw, offset);
    if (text === undefined) {
      lost++;
      continue;
    }
    parts.push(text);
  }
  if (lost > 0 && warnings && !warnings.some((w) => w.code === WARN_FRAME_LOSS)) {
    warnings.push({
      code: WARN_FRAME_LOSS,
      message:
        `session ${s.id}: ${lost} of ${offsets.length} zstd frame(s) could not be decoded; ` +
        "the recovered dialogue is incomplete.",
    });
  }
  return parts.join("");
}

/**
 * Header only: decode the first frame and return its `session` record. The
 * first append writes the header together with the first batch, so the header
 * is the first record of the first frame, not necessarily the only one —
 * decoding just frame 0 keeps `list` cheap across a large session corpus.
 */
function readHeader(filePath: string): DshHeader | undefined {
  const raw = fs.readFileSync(filePath);
  const offsets = frameOffsets(raw);
  if (offsets.length === 0) return findHeader(raw.toString("utf8"));
  const text = decodeFrame(raw, offsets[0]);
  return text === undefined ? undefined : findHeader(text);
}

function isoFromMs(ms: unknown): string {
  return typeof ms === "number" && Number.isFinite(ms) ? new Date(ms).toISOString() : "";
}

/** Collect the `{type: "text"}` parts of a message content array. */
function textParts(content: DshTextPart[] | undefined): string[] {
  const out: string[] = [];
  for (const part of content ?? []) {
    if (part?.type !== "text") continue;
    if (typeof part.text === "string" && part.text) out.push(part.text);
  }
  return out;
}

/** Recover the shell command from a shell tool call's `arguments` JSON string. */
export function commandFromDshArguments(argsRaw: unknown): string | undefined {
  if (typeof argsRaw !== "string") return undefined;
  try {
    const parsed: unknown = JSON.parse(argsRaw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const rec = parsed as { command?: unknown; cmd?: unknown };
      if (typeof rec.command === "string") return rec.command;
      if (typeof rec.cmd === "string") return rec.cmd;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

// ---------- list ----------

export function dshListSessions(f: MemFilter): MemSessionInfo[] {
  const root = dshSessionsDir();
  if (!fs.existsSync(root)) return [];
  const out: MemSessionInfo[] = [];
  for (const file of walkDir(root)) {
    if (!SESSION_FILE.test(path.basename(file))) continue;
    const header = readHeader(file);
    if (!header) continue;
    const id =
      typeof header.id === "string" && header.id
        ? header.id
        : path.basename(path.dirname(file));
    const cwd = typeof header.cwd === "string" ? header.cwd : undefined;
    if (f.cwd && !sameProject(cwd, f.cwd)) continue;
    const created = isoFromMs(header.createdAt);
    let updated = created;
    try {
      updated = fs.statSync(file).mtime.toISOString();
    } catch {
      // Keep the header timestamp when the file cannot be stat'ed.
    }
    if (!inRangeOverlap(created, updated, f)) continue;
    out.push({ platform: "dsh", id, cwd, created, updated, filePath: file });
  }
  return out;
}

// ---------- extract / search ----------

export function dshExtractDialogue(
  s: MemSessionInfo,
  warnings?: MemWarning[],
): DialogueTurn[] {
  return collectDshTurnsAndEvents(s, warnings).turns;
}

export function dshSearch(s: MemSessionInfo, kw: string): SearchHit {
  // No warnings sink, matching the other adapters: search fans out over the
  // whole corpus and a per-session notice would print thousands of times.
  return searchInDialogue(dshExtractDialogue(s), kw);
}

/**
 * Single pass over the log, emitting cleaned dialogue plus the
 * `task.py create|start` invocations found in shell `tool/call` records.
 * `turnIndex` is the dialogue length at the moment the event is seen, which is
 * what the brainstorm-window builder slices against.
 */
export function collectDshTurnsAndEvents(
  s: MemSessionInfo,
  warnings?: MemWarning[],
): { turns: DialogueTurn[]; events: TaskPyEvent[] } {
  const turns: DialogueTurn[] = [];
  const events: TaskPyEvent[] = [];
  for (const line of decodeAllText(s.filePath, s, warnings).split("\n")) {
    const rec = parseLine(line);
    if (!rec) continue;
    const data = rec.data;
    if (rec.type === "user/message") {
      const raw = textParts(data?.content);
      if (raw.length === 0) continue;
      const joined = raw.join("\n\n");
      const text = stripInjectionTags(joined);
      if (!text || isBootstrapTurn(text, joined.length)) continue;
      turns.push({ role: "user", text });
      continue;
    }
    if (rec.type === "assistant/message") {
      const raw = textParts(data?.message?.content);
      if (raw.length === 0) continue;
      const text = stripInjectionTags(raw.join("\n\n"));
      if (!text) continue;
      turns.push({ role: "assistant", text });
      continue;
    }
    if (rec.type === "tool/call") {
      if (typeof data?.name !== "string" || !SHELL_TOOL.test(data.name)) continue;
      const cmd = commandFromDshArguments(data.arguments);
      if (!cmd) continue;
      for (const parsed of parseTaskPyCommandsAll(cmd)) {
        events.push({
          action: parsed.action,
          timestamp: isoFromMs(rec.time),
          turnIndex: turns.length,
          ...(parsed.action === "create"
            ? { slug: parsed.slug }
            : { taskDir: parsed.taskDir }),
        });
      }
    }
  }
  return { turns, events };
}
