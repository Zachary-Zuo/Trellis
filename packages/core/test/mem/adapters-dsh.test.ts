/**
 * Fixture-based tests for the DeepSeek Harness (dsh) mem adapter.
 *
 * The fixture log is built as a concatenation of independent zstd frames,
 * which is the format's defining hazard: a single decompression call returns
 * only the first frame, so an adapter that does not walk frames reports a real
 * session as one record with no dialogue at all. Every assertion below runs
 * against that multi-frame fixture.
 *
 * `DSH_HOME` is read per call (`internal/paths.ts`), so each test points it at
 * its own tmpdir and needs no `node:os` mock.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as zlib from "node:zlib";

import {
  collectDshTurnsAndEvents,
  dshExtractDialogue,
  dshListSessions,
  dshSearch,
} from "../../src/mem/adapters/dsh.js";
import type { MemSessionInfo, MemWarning } from "../../src/mem/types.js";

const zstd = zlib as unknown as { zstdCompressSync?: (data: Buffer) => Buffer };
const HAS_ZSTD = typeof zstd.zstdCompressSync === "function";

/** Resolve the compressor once, without a non-null assertion at each call. */
function requireZstd(): (data: Buffer) => Buffer {
  const fn = zstd.zstdCompressSync;
  if (typeof fn !== "function") {
    throw new Error("node:zlib zstd support is required for this suite");
  }
  return fn;
}

/** One checksummed zstd frame per append batch, matching the dsh writer. */
function frame(record: unknown): Buffer {
  return requireZstd()(Buffer.from(`${JSON.stringify(record)}\n`, "utf8"));
}

const CREATED_MS = Date.UTC(2026, 8, 13, 8, 0, 0);
const CWD = path.join(os.tmpdir(), "trellis-dsh-fixture", "proj", "demo");

const HEADER = {
  type: "session",
  version: 3,
  id: "session-fixture-1",
  createdAt: CREATED_MS,
  cwd: CWD,
  isSeeded: false,
  delegationDepth: 0,
  agentPreset: "standard",
};

const SYSTEM = {
  type: "system/message",
  seq: 1,
  time: CREATED_MS + 1,
  data: {
    turn: 1,
    step: 1,
    message: {
      role: "system",
      content: [
        { type: "text", text: "You are an AI agent powered by DeepSeek Harness. zz-systemonly" },
      ],
    },
  },
};

/** Injection twin of the next `user/message`: same id, must not double-count. */
const SPLICED = {
  type: "agent/inbox/spliced",
  seq: 2,
  time: CREATED_MS + 2,
  data: {
    target: "next-turn",
    start: 0,
    inserted: [
      {
        id: "msg-1",
        role: "user",
        content: [{ type: "text", text: "请核对发布流程 zz-usertext" }],
      },
    ],
  },
};

const USER = {
  type: "user/message",
  seq: 3,
  time: CREATED_MS + 3,
  data: {
    id: "msg-1",
    role: "user",
    content: [{ type: "text", text: "请核对发布流程 zz-usertext" }],
  },
  surfaceOp: "append",
};

const ASSISTANT = {
  type: "assistant/message",
  seq: 4,
  time: CREATED_MS + 4,
  data: {
    turn: 1,
    step: 1,
    message: {
      role: "assistant",
      content: [
        { type: "reasoning", text: "zz-reasoning-only" },
        { type: "text", text: "已核对 zz-assttext" },
        { type: "tool-call", id: "call-1", name: "pwsh", arguments: "{}" },
      ],
    },
  },
};

const TOOL_CALL = {
  type: "tool/call",
  seq: 5,
  time: CREATED_MS + 5,
  data: {
    turn: 1,
    step: 1,
    callId: "call-1",
    name: "pwsh",
    arguments: JSON.stringify({
      command: 'python .trellis/scripts/task.py create "fixture task" --slug fixture-task',
      description: "create a task",
    }),
  },
};

let home: string;

/** Write a fixture session log: header in frame 0, then one frame per record. */
function writeSession(records: unknown[], sessionId = HEADER.id): string {
  const dir = path.join(home, "sessions", "--tmp--trellis-dsh-fixture--", sessionId);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "session.v3.jsonl.zstd");
  fs.writeFileSync(file, Buffer.concat([frame(HEADER), ...records.map(frame)]));
  return file;
}

/** The single fixture session, asserted to exist before use. */
function onlySession(): MemSessionInfo {
  const sessions = dshListSessions({ platform: "dsh" });
  const session = sessions[0];
  if (!session) throw new Error("fixture session was not listed");
  return session;
}

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-dsh-home-"));
  process.env.DSH_HOME = home;
});

afterEach(() => {
  delete process.env.DSH_HOME;
  fs.rmSync(home, { recursive: true, force: true });
});

describe.skipIf(!HAS_ZSTD)("dsh mem adapter", () => {
  it("walks every zstd frame, not just the first", () => {
    writeSession([SYSTEM, SPLICED, USER, ASSISTANT, TOOL_CALL]);
    const { turns } = collectDshTurnsAndEvents(onlySession());
    // A single-frame decode would yield the 1-record header and zero turns.
    expect(turns).toHaveLength(2);
  });

  it("reads id, cwd and createdAt from the header frame", () => {
    writeSession([USER]);
    const session = onlySession();
    expect(session.id).toBe(HEADER.id);
    expect(session.cwd).toBe(CWD);
    expect(session.created).toBe(new Date(CREATED_MS).toISOString());
  });

  it("scopes by cwd and rejects unrelated projects", () => {
    writeSession([USER]);
    expect(dshListSessions({ platform: "dsh", cwd: CWD })).toHaveLength(1);
    expect(
      dshListSessions({ platform: "dsh", cwd: path.join(os.tmpdir(), "somewhere-else") }),
    ).toHaveLength(0);
  });

  it("maps only user/message and assistant/message to dialogue", () => {
    writeSession([SYSTEM, SPLICED, USER, ASSISTANT]);
    const turns = dshExtractDialogue(onlySession());
    expect(turns.map((t) => t.role)).toEqual(["user", "assistant"]);
    // The spliced twin must not produce a second user turn.
    expect(turns.filter((t) => t.role === "user")).toHaveLength(1);
    // Assistant text parts only: reasoning and tool-call parts are dropped.
    expect(turns[1]?.text).toContain("zz-assttext");
    expect(turns[1]?.text).not.toContain("zz-reasoning-only");
    // The platform system prompt is never dialogue.
    expect(turns.some((t) => t.text.includes("zz-systemonly"))).toBe(false);
  });

  it("never matches the platform system prompt in search", () => {
    writeSession([SYSTEM, SPLICED, USER, ASSISTANT]);
    const session = onlySession();
    expect(dshSearch(session, "zz-systemonly").count).toBe(0);
    expect(dshSearch(session, "zz-usertext").userCount).toBeGreaterThan(0);
  });

  it("recovers task.py create|start events from shell tool calls", () => {
    writeSession([USER, ASSISTANT, TOOL_CALL]);
    const { events } = collectDshTurnsAndEvents(onlySession());
    expect(events).toHaveLength(1);
    expect(events[0]?.action).toBe("create");
    expect(events[0]?.slug).toBe("fixture-task");
    // Real logs commit `assistant/message` before the `tool/call` it issued
    // (seq 20 then 21), so both the user and assistant turns are already in the
    // pool when the call is seen.
    expect(events[0]?.turnIndex).toBe(2);
  });

  it("keeps list cheap: an undecodable later frame does not hide the session", () => {
    const file = writeSession([USER, ASSISTANT]);
    // Append a frame-magic-prefixed blob that is not a valid frame.
    fs.appendFileSync(
      file,
      Buffer.concat([Buffer.from([0x28, 0xb5, 0x2f, 0xfd]), Buffer.alloc(16, 0x7f)]),
    );
    const session = onlySession();

    const warnings: MemWarning[] = [];
    const { turns } = collectDshTurnsAndEvents(session, warnings);
    expect(turns).toHaveLength(2);
    expect(warnings.some((w) => w.code === "dsh-undecodable-frame")).toBe(true);
  });

  it("reads an uncompressed log (compression: none)", () => {
    const dir = path.join(home, "sessions", "--tmp--none--", "session-plain-1");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "session.v3.jsonl"),
      [HEADER, USER, ASSISTANT].map((r) => JSON.stringify(r)).join("\n") + "\n",
    );
    expect(dshExtractDialogue(onlySession())).toHaveLength(2);
  });

  it("returns nothing when DSH_HOME has no sessions directory", () => {
    fs.rmSync(path.join(home, "sessions"), { recursive: true, force: true });
    expect(dshListSessions({ platform: "dsh" })).toHaveLength(0);
  });
});
