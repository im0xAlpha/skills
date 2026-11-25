import {readFile, writeFile} from "node:fs/promises";

const docURL = new URL("../SKILL.md", import.meta.url);
const doc = await readFile(docURL, "utf8");
const marker = "<!-- GENERATED: HOSTED MODULES -->";
const blocks = [];
const workflow = await readFile(new URL("../references/execution.md", import.meta.url), "utf8");
blocks.push(workflow.split("## Release gates")[0].trimEnd());
for (const file of ["protocol.mjs", "account.mjs"]) {
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  blocks.push("### " + file + "\n\n```js\n" + source.trimEnd() + "\n```");
}
const result = doc.split(marker)[0].trimEnd() + "\n\n" + marker + "\n\n" + blocks.join("\n\n") + "\n";
if (process.argv.includes("--check")) {
  if (result !== doc) throw Error("Stale hosted modules: run npm run package:hosted");
} else {
  await writeFile(docURL, result);
}
