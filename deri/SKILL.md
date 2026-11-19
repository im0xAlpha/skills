---
name: deri
description: Discover, quote and manage BTC and ETH Everlasting Options and perpetual futures on Deri V5 Pro using native USDC on Base or Arbitrum One.
metadata:
  clawdbot:
    homepage: https://deri.io
    requires:
      packages: ["ethers@6.16.0"]
---

# Deri V5 Pro

## Public options: list and quote

These reads require **no wallet, pToken, gas, signature, or contract-call
permission**. A GitHub chat install may contain only this SKILL.md. Use this
standalone function in Bankr's JavaScript/CLI sandbox; it needs no local files
or packages. If the sandbox uses an HTTP tool instead of fetch, issue the
same two public GraphQL queries and apply the same checks. Do not download
and execute remote code, substitute web-search results, or invent a price.

```js
async function publicOptions({chain, underlying, kind, symbol}) {
  const chains = {
    base: [8453, "0x0ba55f9140f5308541e7b88103d4bf8e090db1a8", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"],
    arbitrum: [42161, "0x5d17e4133327b603cef3e8febe20c1b9fb0b6771", "0xaf88d065e77c8cc2239327c5edb3a432268e5831"]
  };
  if (!Object.hasOwn(chains, chain)) throw Error("Choose Base or Arbitrum One.");
  if (underlying != null && !["ETH","BTC"].includes(underlying)) throw Error("Unsupported underlying.");
  if (kind != null && !["P","C"].includes(kind)) throw Error("Choose put (P) or call (C).");
  const [id, gateway, usdc] = chains[chain];
  async function query(query, variables) {
    const res = await fetch("https://v5dh.deri.io/graphql", {
      method:"POST", headers:{"content-type":"application/json"}, redirect:"error",
      body:JSON.stringify({query,variables})
    });
    if (!res.ok) throw Error("Deri indexer HTTP " + res.status);
    const {data,errors} = await res.json();
    if (errors?.length || !data) throw Error("Deri indexer query failed.");
    return data;
  }
  const {gatewayDatas} = await query("query($c:Int!){gatewayDatas(where:{chainId:$c}){gatewayAddress markets{assetAddress assetDecimals} symbols{symbol category minTradeVolume}}}",{c:id});
  const pool = gatewayDatas.find(p=>p.gatewayAddress.toLowerCase()===gateway);
  if (!pool?.markets.some(m=>m.assetAddress.toLowerCase()===usdc && Number(m.assetDecimals)===6)) throw Error("Wrong gateway or collateral.");
  const listed = pool.symbols.filter(s=>s.category==="option" && /^(BTC|ETH)USD-[1-9]\d*(\.\d+)?-[CP]$/.test(s.symbol)
    && (!underlying || s.symbol.startsWith(underlying+"USD-")) && (!kind || s.symbol.endsWith("-"+kind)));
  if (symbol == null) return listed.map(({symbol,minTradeVolume})=>({symbol,minTradeVolume}));
  if (!listed.some(s=>s.symbol===symbol)) throw Error("Option not listed for this chain and filter.");
  const {markPrice} = await query("query($s:String!){markPrice(where:{symbol:$s}){symbol markPrice timestamp}}",{s:symbol});
  const row = markPrice.find(r=>r.symbol===symbol);
  const timestamp = Number(row?.timestamp), age = Date.now()/1000-timestamp;
  const mark = row?.markPrice;
  if (!Number.isSafeInteger(timestamp) || age < -5 || age > 120 || typeof mark !== "string" ||
      !/^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(mark) || !Number.isFinite(Number(mark)) || !(Number(mark)>0)) throw Error("No fresh positive Deri mark.");
  return {chain,symbol,indicativeMarkUSD:row.markPrice,timestamp};
}
```

For example, call `await publicOptions({chain:"base",underlying:"ETH",kind:"P"})`.
To quote, pass a returned exact `symbol` to the same function on the same chain.
Report the mark in USD per contract with its UTC timestamp. It is not a firm
fill price. Options have no expiry and funding accrues; do not substitute
everlasting for dated options. On an HTTP/egress error report the failure.

## Account workflows

For account operations use the active Bankr EVM wallet and one explicit funding chain
(`base` or `arbitrum`) and wallet-owned Pro pToken. Ask if ambiguous.
Never bridge, accept another token, export a key, create a session key, or ask
for Bankr credentials. Do not work around Bankr signing, eligibility, recipient
or regional restrictions. Bankr signs on mainnet dChain 20231119; it does not
broadcast a regular EVM transaction there.

Run `node scripts/deri.mjs COMMAND` with a JSON object on stdin from the
skill directory (or import its exported `run(command, object)` in the sandbox).
Pass data as data, never interpolate chat text into shell commands. If helpers
or native wallet tools are unavailable, stop rather than generating calldata.

* Positions: `portfolio {"chain":"base","owner":"<active Bankr address>"}`.
  Show chain, pToken, positions and signed sizes. Consult `margin` for live
  engine collateral and cash; neither alone is free margin.
* Wallet compatibility: run `probe {}`. Ask the native chat wallet to sign only
  the returned typedData, unchanged, with eth_signTypedData_v4. This fixture
  deliberately has no executable sender, factory or gas. Verify with
  `verify-probe {"owner":"<independently identified Bankr wallet>","signature":"..."}`.
  A text promise, API-only result or signing by a different wallet is not a pass.
* Writes: use [the execution workflow](references/execution.md). Until hosted
  signing and the funding-to-withdrawal acceptance test have passed for a chain,
  offer previews only to ordinary users. Do not request executable signatures or
  approve token spending as a diagnostic. Do not enable a chain based solely
  on a successful fixture.
