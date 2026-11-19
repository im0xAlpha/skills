import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { CHAINS, quoteRow, units } from "../scripts/protocol.mjs";

// Exercise exactly what a hosted install gets when it copies only SKILL.md.
const doc = await readFile(new URL("../SKILL.md", import.meta.url), "utf8");
const block = doc.match(/^```js\n(async function publicOptions\b[\s\S]*?)\n```$/m)[1];
const reader = fetch => runInNewContext("(" + block + ")", {fetch, Date});

for (const [chain, {id, gateway, usdc}] of Object.entries(CHAINS)) {
  test("standalone installed instructions: " + chain, async () => {
    const option = chain === "base" ? "ETHUSD-2000-P" : "BTCUSD-50000-C";
    const choices = {chain, underlying:option.slice(0,3), kind:option.at(-1)};
    const now = Math.floor(Date.now()/1000);
    let timestamp = now, collateral = usdc, quoteCalls = 0;
    const mark = "1.0738554e-07";
    const run = reader(async (url, opts) => {
      assert.equal(url, "https://v5dh.deri.io/graphql");
      assert.equal(opts.method, "POST");
      const {query, variables} = JSON.parse(opts.body);
      let data;
      if (query.includes("gatewayDatas")) {
        assert.equal(variables.c, id);
        data = {gatewayDatas:[{gatewayAddress:gateway,markets:[{assetAddress:collateral,assetDecimals:6}],symbols:[
          {category:"option",symbol:option,minTradeVolume:"0.01"},
          {category:"futures",symbol:"ETHUSD"}, {category:"option",symbol:"SOLUSD-50-C"}]}]};
      } else {
        assert.equal(variables.s, option); quoteCalls++;
        data = {markPrice:[{symbol:option,markPrice:mark,timestamp}]};
      }
      return {ok:true,json:async()=>({data})};
    });
    const listed = await run(choices);
    assert.equal(listed.length,1); assert.equal(listed[0].symbol, option);
    assert.equal((await run({...choices,symbol:option})).indicativeMarkUSD, mark);
    assert.equal(quoteRow([{symbol:option,markPrice:mark,timestamp}],option,now).indicativeMarkUSD, mark);
    assert.throws(()=>units(mark)); // An indicative mark is not a validated order limit.
    await assert.rejects(run({...choices,symbol:"ETHUSD-99999-P"}), /not listed/);
    assert.equal(quoteCalls,1);
    timestamp = now-125;
    await assert.rejects(run({...choices,symbol:option}), /fresh/);
    collateral = "0x0000000000000000000000000000000000000000";
    await assert.rejects(run(choices), /collateral/);
  });
}

test("live SKILL.md-only discovery and quotes", {skip:process.env.DERI_LIVE_READ !== "1"}, async () => {
  const run = reader(fetch);
  for (const [chain,underlying,kind] of [["base","ETH","P"],["arbitrum","BTC","C"]]) {
    const req = {chain,underlying,kind};
    const listed = await run(req);
    assert.ok(listed.length > 0);
    const quote = await run({...req,symbol:listed[0].symbol});
    console.log({chain,count:listed.length,examples:listed.slice(0,3).map(s=>s.symbol),quote});
  }
});
