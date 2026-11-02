import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  detectInstalledRoots,
  listSkillNames,
  renderSkillFiles,
  rootsForPlatforms,
  syncSkills,
} from "../../src/commands/skills.js";

let cwd: string;

beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-skills-"));
});

afterEach(() => {
  fs.rmSync(cwd, { recursive: true, force: true });
});

const KICKOFF = ".claude/skills/kickoff/SKILL.md";

describe("bundled skill templates", () => {
  it("ships the five collaboration skills", () => {
    expect(listSkillNames()).toEqual([
      "brainstorm",
      "clarify",
      "docs-audit",
      "kickoff",
      "session-history",
    ]);
  });

  it("every SKILL.md names its own directory and is manual-only", () => {
    for (const [rel, content] of renderSkillFiles(".claude/skills")) {
      if (!rel.endsWith("/SKILL.md")) continue;
      const dir = rel.split("/")[2];
      expect(content).toMatch(new RegExp(`^---\\nname: ${dir}\\n`));
      expect(content).toContain("\ndisable-model-invocation: true\n");
    }
  });

  it("adds a Codex policy file only under .agents/skills", () => {
    const agents = renderSkillFiles(".agents/skills");
    for (const name of listSkillNames()) {
      expect(agents.get(`.agents/skills/${name}/agents/openai.yaml`)).toBe(
        "policy:\n  allow_implicit_invocation: false\n",
      );
    }
    const claude = [...renderSkillFiles(".claude/skills").keys()];
    expect(claude.some((k) => k.endsWith("openai.yaml"))).toBe(false);
  });
});

describe("rootsForPlatforms", () => {
  it("maps Claude to .claude/skills and the others to .agents/skills", () => {
    expect(rootsForPlatforms(["claude"])).toEqual([".claude/skills"]);
    expect(rootsForPlatforms(["codex", "dsh", "cursor"])).toEqual([
      ".agents/skills",
    ]);
    expect(rootsForPlatforms(["cursor", "claude"])).toEqual([
      ".claude/skills",
      ".agents/skills",
    ]);
  });
});

describe("syncSkills", () => {
  it("creates every file on first install, then reports them unchanged", async () => {
    const roots = rootsForPlatforms(["claude", "codex"]);
    const first = await syncSkills({ cwd, roots });
    const expected =
      renderSkillFiles(".claude/skills").size +
      renderSkillFiles(".agents/skills").size;
    expect(first.created).toHaveLength(expected);
    expect(fs.existsSync(path.join(cwd, KICKOFF))).toBe(true);

    const second = await syncSkills({ cwd, roots });
    expect(second.created).toEqual([]);
    expect(second.unchanged).toHaveLength(expected);
  });

  it("keeps a locally edited file when there is no resolver", async () => {
    const roots = rootsForPlatforms(["claude"]);
    await syncSkills({ cwd, roots });
    const file = path.join(cwd, KICKOFF);
    fs.writeFileSync(file, "local edit\n");

    const report = await syncSkills({ cwd, roots });
    expect(report.skipped).toEqual([KICKOFF]);
    expect(fs.readFileSync(file, "utf-8")).toBe("local edit\n");
  });

  it("shows the diff and overwrites when the resolver says so", async () => {
    const roots = rootsForPlatforms(["claude"]);
    await syncSkills({ cwd, roots });
    const file = path.join(cwd, KICKOFF);
    fs.writeFileSync(file, "local edit\n");

    const resolve = vi.fn(async () => "overwrite" as const);
    const report = await syncSkills({ cwd, roots, resolve });
    expect(resolve).toHaveBeenCalledOnce();
    const [rel, patch] = resolve.mock.calls[0] as unknown as [string, string];
    expect(rel).toBe(KICKOFF);
    expect(patch).toContain("-local edit");
    expect(patch).toContain("+name: kickoff");
    expect(report.updated).toEqual([KICKOFF]);
    expect(fs.readFileSync(file, "utf-8")).toBe(
      renderSkillFiles(".claude/skills").get(KICKOFF),
    );
  });

  it("applies an 'all' answer to the remaining files without asking again", async () => {
    const roots = rootsForPlatforms(["claude"]);
    await syncSkills({ cwd, roots });
    for (const name of ["brainstorm", "clarify"]) {
      fs.writeFileSync(path.join(cwd, `.claude/skills/${name}/SKILL.md`), "x");
    }
    const resolve = vi.fn(async () => "skip-all" as const);
    const report = await syncSkills({ cwd, roots, resolve });
    expect(resolve).toHaveBeenCalledOnce();
    expect(report.skipped).toHaveLength(2);
  });

  it("overwrites without asking under force, writes nothing under dryRun", async () => {
    const roots = rootsForPlatforms(["claude"]);
    await syncSkills({ cwd, roots });
    const file = path.join(cwd, KICKOFF);
    fs.writeFileSync(file, "local edit\n");

    const dry = await syncSkills({ cwd, roots, dryRun: true, force: true });
    expect(dry.updated).toEqual([KICKOFF]);
    expect(fs.readFileSync(file, "utf-8")).toBe("local edit\n");

    const forced = await syncSkills({ cwd, roots, force: true });
    expect(forced.updated).toEqual([KICKOFF]);
    expect(fs.readFileSync(file, "utf-8")).not.toBe("local edit\n");
  });

  it("treats a CRLF checkout of the template as unchanged", async () => {
    const roots = rootsForPlatforms(["claude"]);
    await syncSkills({ cwd, roots });
    const file = path.join(cwd, KICKOFF);
    fs.writeFileSync(
      file,
      fs.readFileSync(file, "utf-8").replace(/\n/g, "\r\n"),
    );
    const report = await syncSkills({ cwd, roots });
    expect(report.skipped).toEqual([]);
  });
});

describe("detectInstalledRoots", () => {
  it("finds only roots that already hold a bundled skill", async () => {
    expect(detectInstalledRoots(cwd)).toEqual([]);
    fs.mkdirSync(path.join(cwd, ".claude/skills/other"), { recursive: true });
    expect(detectInstalledRoots(cwd)).toEqual([]);
    await syncSkills({ cwd, roots: rootsForPlatforms(["codex"]) });
    expect(detectInstalledRoots(cwd)).toEqual([".agents/skills"]);
  });
});
