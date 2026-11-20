import { pathToFileURL } from "node:url";
import { run } from "./account.mjs";
export { live, run } from "./account.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    let input = "";
    for await (const chunk of process.stdin) {
      input += chunk;
      if (input.length > 16000) throw Error("Input too large.");
    }
    console.log(JSON.stringify(await run(process.argv[2], JSON.parse(input || "{}"))));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
