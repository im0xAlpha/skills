import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {copyFile, mkdtemp, readFile, rm, symlink} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {run} from "../scripts/account.mjs";

test("fresh sandbox with only installed markdown and the declared package", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bankr-deri-install-"));
  try {
    const url = new URL("../SKILL.md", import.meta.url);
    await copyFile(url, join(dir, "SKILL.md"));
    await symlink(new URL("../node_modules", import.meta.url), join(dir, "node_modules"), "dir");
    const md = await readFile(url, "utf8");
    const bootstrap = md.match(/Example sandbox bootstrap[^\n]*\n\n```js\n([\s\S]*?)\n```/)[1];
    const output = execFileSync(process.execPath, ["--input-type=module", "-e",
      bootstrap + '\nconsole.log(JSON.stringify(await run("probe")));'], {cwd:dir});
    assert.deepEqual(JSON.parse(output), await run("probe"));
  } finally {
    await rm(dir, {recursive:true, force:true});
  }
});
