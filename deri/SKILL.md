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

On Bankr use `execute_cli` with the installed skill `deri` selected. Stage
the installed `/skills/deri/SKILL.md` as `./SKILL.md` in the sandbox.
The two generated modules below are the complete canonical helpers, not
examples. Extract them from that installed file, never transcribe them or
download remote code. Example sandbox bootstrap (Node-compatible JS):

```js
import {readFile, writeFile} from "node:fs/promises";
const doc = await readFile("./SKILL.md", "utf8");
for (const file of ["protocol.mjs", "account.mjs"]) {
  const start = "### " + file + "\n\n" + "`".repeat(3) + "js\n";
  const parts = doc.split(start);
  if (parts.length !== 2) throw Error("Installed module missing or ambiguous: " + file);
  const end = parts[1].indexOf("\n" + "`".repeat(3));
  if (end < 0) throw Error("Incomplete installed module.");
  await writeFile("./" + file, parts[1].slice(0, end) + "\n");
}
const {run} = await import("./account.mjs");
```

Use the declared ethers@6.16.0 dependency (for Deno, map the bare
`ethers` import to `npm:ethers@6.16.0`). If the installed file, dependency
or runtime is unavailable, stop. Never use files left from a previous run.
For an unsigned deposit illustration get the active wallet from Bankr and
call `run("deposit-preview", {chain:"base",owner,pToken:"new",amount:"1"})`.
This returns on-chain balance and allowance checks, not calldata. It
does not estimate fees, create a pToken, request a signature or submit.
An insufficient balance is a valid preview, not permission to fund.
For local checkouts use `node scripts/deri.mjs COMMAND` with JSON on stdin.
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

<!-- GENERATED: HOSTED MODULES -->

# Execution and acceptance

The preview commands are read-only. No script sends transactions, stores
credentials or accepts an arbitrary destination, contract method or RPC URL.
Keep the original request and hash together per confirmation, never a single
shared pending slot. In an unvalidated install, stop after the preview.

## Fund the account

1. Get the active wallet and run `portfolio`. Explicitly choose an existing
   pToken or get consent to create one. Use decimal strings, not JSON numbers.
2. Run `deposit` with `{"chain":"base","owner":"...","pToken":"new","amount":"25"}`
   (or a pToken ID string). Show chain, amount, token, spender/destination,
   and the wallet's network-fee estimate. Base and Arbitrum both need ETH for
   raw contract calls. Never submit the deposit before the signing capability
   check; the user must be able to withdraw.
3. If returned step is `approve_exact`, confirm and use Bankr's native EVM
   submission for that exact transaction. Wait for a successful receipt; re-run
   deposit, then separately confirm the actual deposit. If the step did not
   advance, stop. Never increase the allowance to unlimited.
4. Run `deposit-receipt` with chain, owner and wallet transaction hash. After
   gateway confirmation, run `margin` with its pToken ID. Wait for engine
   request ID to reach the event request ID. A pending relay is not a reason
   to submit the deposit again.

## Open, close, withdraw

1. Run `markets`, `quote`, and `portfolio`. Ask for the exact side, size, and
   worst acceptable execution price per contract (maximum on a buy, minimum
   on a sell). If asked for percentage slippage, agree on the derived price
   before signing. Reject ambiguous strikes, expiry requests and multi-leg
   orders. For short options explain margin and liquidation risk.
2. Run `trade` with e.g.
   `{"chain":"arbitrum","owner":"...","pToken":"...","symbol":"ETHUSD-4000-P","side":"buy","size":"0.01","limit":"100"}`.
   For a full close use `"side":"close"`, omit size, specify limit. This uses
   Deri's enforceable close-only order: a stale position cannot flip sides.
   For withdrawal use `withdraw` with chain, owner, pToken and an explicit
   USDC amount. The engine simulation checks current conditions; it does
   not guarantee a fill, a future price, or final settlement.
3. Show the preview summary, account, chain and pToken; explain the price
   bound, direction, size and funding. The helper does not compute an exact
   incremental margin estimate. If the user requires one, stop rather than
   guess. Confirm this exact operation. Use Bankr's own authorized wallet
   signing action for the returned typed data; stop on denial, do not change
   wallet/security settings or ask for an API key.
4. Run `verify-order` with the exact original inputs plus `action` (trade or
   withdraw), `hash`, `previewAt`, `probeSignature`, and the order `signature`.
   The helper rebuilds and simulates the order, checks the EntryPoint digest
   and the two signatures. Never disclose the executable signature in chat.
   Only for the confirmed order, send its returned method and params once
   by JSON-RPC to the returned Deri bundler URL. The returned hash must match
   the preview. The 90-second preview window is a local signing safeguard,
   not an on-chain expiry. Never retain the signed operation for later.
5. Use `receipt {"hash":"..."}`. On an ambiguous submit/timeout, look up the
   original hash only; no blind retry. Stop on a revert or signing error.
   On success, re-read positions to establish the actual fill. For withdrawals
   separately verify USDC arrival on the selected funding chain; until then,
   report relay pending. No receipt is not proof of failure.

### protocol.mjs

```js
import {
  Interface,
  TypedDataEncoder,
  ZeroAddress,
  concat,
  formatUnits,
  getAddress,
  hexlify,
  parseUnits,
  toBeHex,
  toQuantity,
  toUtf8Bytes,
  verifyTypedData,
} from "ethers";

export const CHAINS = Object.freeze({
  base: {
    id: 8453,
    rpc: "https://mainnet.base.org",
    usdc: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    gateway: "0x0ba55f9140f5308541e7b88103d4bf8e090db1a8",
  },
  arbitrum: {
    id: 42161,
    rpc: "https://arb1.arbitrum.io/rpc",
    usdc: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
    gateway: "0x5d17e4133327b603cef3e8febe20c1b9fb0b6771",
  },
});
export const DC = "https://rpc-dchain.deri.io",
  BUNDLER = "https://bundler.deri.io/rpc";
export const ENGINE = "0xb02e66873718c69aa28fccb1fa7765f335644dd7",
  MANAGER = "0x5a98af1a854f365f1602696c3f5469a7950063fa";
export const FACTORY = "0xecbb11f55bbad62d487dd6028d3e52ed22ef8526",
  PAYMASTER = "0xf7ad3923e4081a6d9db97e26e8a87f258f2f19c5";
export const EP = "0x4337084d9e255ff0702461cf8895ce9e3b5ff108";
export const abi = new Interface([
  "event Transfer(address indexed from,address indexed to,uint256 value)",
  "function getAddress(address,uint256) view returns(address)",
  "function createAccount(address,uint256)",
  "function getNonce(address,uint192) view returns(uint256)",
  "function owner() view returns(address)",
  "function getUserOpHash((address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature)) view returns(bytes32)",
  "function execute(address,uint256,bytes)",
  "function trade(uint256,bytes32,int256[])",
  "function tradeWithCondition((uint256,bytes32,int256[],int256,uint8))",
  "function executeRemoveMargin(uint256,bytes32,uint256)",
  "function getPosition(bytes32,uint256) view returns(bytes32[])",
  "function getTdState(uint256) view returns((uint256,bytes32,bytes32,uint256,int256,int256,int256,bool))",
  "function getDTokenState(uint256) view returns((address,uint256,address,uint256,int256,int256,bool,bool))",
  "function getBTokenState(address) view returns((bytes32,address,bytes32,uint256))",
  "function decimals() view returns(uint8)",
  "function balanceOf(address) view returns(uint256)",
  "function allowance(address,address) view returns(uint256)",
  "function approve(address,uint256)",
  "function requestAddMargin(uint256,address,uint256)",
  "function requestAddMargin(uint256,address,uint256,bool)",
  "event RequestAddMargin((uint256,address,uint256,bytes32,uint256,int256,int256) dTokenInfo)",
]);
export const requireThat = (ok, msg) => {
  if (!ok) throw Error(msg);
};
export const same = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  a.toLowerCase() === b.toLowerCase();
export function chain(key) {
  requireThat(
    Object.hasOwn(CHAINS, key),
    "Choose base or arbitrum; no bridging or other collateral.",
  );
  return CHAINS[key];
}
export function units(s, decimals = 18) {
  requireThat(
    typeof s === "string" &&
      /^(0|[1-9]\d*)(\.\d+)?$/.test(s) &&
      (s.split(".")[1] || "").length <= decimals,
    "Expected an exact decimal string.",
  );
  const n = parseUnits(s, decimals);
  requireThat(n > 0n && n < 1n << 255n, "Amount out of bounds.");
  return n;
}
export function ptoken(id, c) {
  requireThat(
    typeof id === "string" && /^[1-9]\d{0,77}$/.test(id),
    "Use an exact pToken ID string.",
  );
  const n = BigInt(id);
  requireThat(
    n >> 160n === ((2n << 88n) | BigInt(c.id)) && BigInt.asUintN(160, n) !== 0n,
    "Wrong gateway or funding chain for this pToken.",
  );
  return n;
}
export function symbolId(symbol) {
  const option = /^(BTC|ETH)USD-[1-9]\d*(\.\d+)?-[CP]$/.test(symbol);
  requireThat(
    option || /^(BTC|ETH)USD$/.test(symbol),
    "Not a supported Deri instrument.",
  );
  const bytes = hexlify(toUtf8Bytes(symbol)).slice(2);
  requireThat(bytes.length <= 62, "Symbol too long.");
  return "0x" + bytes.padEnd(62, "0") + (option ? "02" : "01");
}
export function tradeLeg({ side, size, limit, symbol }, lot, position) {
  const id = symbolId(symbol);
  requireThat(
    ["buy", "sell", "close"].includes(side),
    "Specify buy, sell or close.",
  );
  requireThat(
    side !== "close" || size === undefined,
    "Close uses the current position, not an arbitrary size.",
  );
  const v =
    side === "close" ? -position : (side === "sell" ? -1n : 1n) * units(size);
  const step = units(lot);
  requireThat(
    v !== 0n && v % step === 0n,
    "Flat position or invalid trade lot.",
  );
  return { id, v, price: units(limit), close: side === "close" };
}
const fields = [
  ["sender", "address"],
  ["nonce", "uint256"],
  ["initCode", "bytes"],
  ["callData", "bytes"],
  ["accountGasLimits", "bytes32"],
  ["preVerificationGas", "uint256"],
  ["gasFees", "bytes32"],
  ["paymasterAndData", "bytes"],
];
const types = {
  PackedUserOperation: fields.map(([name, type]) => ({ name, type })),
};
const domain = {
  name: "ERC4337",
  version: "1",
  chainId: 20231119,
  verifyingContract: EP,
};
export function typed(op) {
  const pair = (a, b) => concat([toBeHex(a, 16), toBeHex(b, 16)]);
  const message = {
    sender: op.sender,
    nonce: BigInt(op.nonce).toString(),
    initCode: op.factory ? concat([op.factory, op.factoryData]) : "0x",
    callData: op.callData,
    accountGasLimits: pair(op.verificationGasLimit, op.callGasLimit),
    preVerificationGas: BigInt(op.preVerificationGas).toString(),
    gasFees: pair(op.maxPriorityFeePerGas, op.maxFeePerGas),
    paymasterAndData: op.paymaster
      ? concat([
          op.paymaster,
          pair(op.paymasterVerificationGasLimit, op.paymasterPostOpGasLimit),
          op.paymasterData,
        ])
      : "0x",
  };
  return { domain, types, primaryType: "PackedUserOperation", message };
}
export const digest = (t) =>
  TypedDataEncoder.hash(t.domain, t.types, t.message);
export const probe = () =>
  typed({
    sender: ZeroAddress,
    nonce: 0,
    callData: "0x3ea893e7",
    verificationGasLimit: 0,
    callGasLimit: 0,
    preVerificationGas: 0,
    maxPriorityFeePerGas: 0,
    maxFeePerGas: 0,
  });
export function verify(t, sig, owner) {
  requireThat(
    same(verifyTypedData(t.domain, t.types, t.message, sig), getAddress(owner)),
    "Unexpected wallet signature.",
  );
  return true;
}
export function operation(owner, c, sender, nonce, deployed, inner) {
  return {
    sender,
    nonce: toQuantity(nonce),
    callData: abi.encodeFunctionData("execute", [ENGINE, 0, inner]),
    ...(deployed
      ? {}
      : {
          factory: FACTORY,
          factoryData: abi.encodeFunctionData("createAccount", [owner, c.id]),
        }),
    callGasLimit: toQuantity(2000000),
    verificationGasLimit: toQuantity(2000000),
    preVerificationGas: toQuantity(4000000),
    maxFeePerGas: toQuantity(410000001),
    maxPriorityFeePerGas: "0x4",
    paymaster: PAYMASTER,
    paymasterVerificationGasLimit: toQuantity(1000000),
    paymasterPostOpGasLimit: toQuantity(100000),
    paymasterData: "0x",
  };
}
export function quoteRow(rows, symbol, now) {
  const row = rows?.find((x) => x.symbol === symbol);
  const age = now - Number(row?.timestamp);
  // The indexer can return deep OTM marks in scientific notation. Keep the
  // source string for display; actual order limits still go through units().
  const mark = row?.markPrice;
  requireThat(
    row &&
      Number.isFinite(age) &&
      age >= -5 &&
      age <= 120 &&
      typeof mark === "string" &&
      /^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(mark) &&
      Number.isFinite(Number(mark)) && Number(mark) > 0,
    "No fresh market mark; do not sign.",
  );
  return {
    symbol,
    indicativeMarkUSD: row.markPrice,
    timestamp: Number(row.timestamp),
  };
}
export const decimal = (n) => formatUnits(n, 18);
```

### account.mjs

```js
import { formatUnits, getAddress, isHexString, toBeHex, ZeroAddress } from "ethers";
import {
  abi,
  BUNDLER,
  chain,
  DC,
  decimal,
  digest,
  ENGINE,
  EP,
  FACTORY,
  MANAGER,
  operation,
  probe,
  ptoken,
  quoteRow,
  requireThat as check,
  same,
  symbolId,
  tradeLeg,
  typed,
  units,
  verify,
} from "./protocol.mjs";

async function post(url, body) {
  const res = await fetch(url, {
    method: "POST",
    redirect: "error",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
  });
  check(res.ok, "Read failed: HTTP " + res.status);
  return res.json();
}
export const live = {
  async rpc(url, method, params) {
    const data = await post(url, { jsonrpc: "2.0", id: 1, method, params });
    check(
      !data.error && Object.hasOwn(data, "result"),
      data.error?.message || "RPC returned no result.",
    );
    return data.result;
  },
  async graph(query, variables) {
    const data = await post("https://v5dh.deri.io/graphql", {
      query,
      variables,
    });
    check(!data.errors && data.data, "Indexer returned no valid result.");
    return data.data;
  },
  now: () => Math.floor(Date.now() / 1000),
};
const marketsQuery =
  "query($c:Int!){gatewayDatas(where:{chainId:$c}){gatewayAddress engineAddress symbolManager smartAccountFactory markets{assetAddress assetDecimals} symbols{symbol symbolId category minTradeVolume}}}";
const markQuery =
  "query($s:String!){markPrice(where:{symbol:$s}){symbol markPrice timestamp}}";
const portfolioQuery =
  "query($c:Int!,$o:String!,$g:String!){tdStates(where:{chainId:$c,account:$o,gatewayAddress:$g,singlePosition:false}){pTokenId liquidated bToken bAmount b0Amount positions{symbol volume cost}}}";
export async function run(cmd, r = {}, io = live) {
  if (cmd === "probe")
    return { typedData: probe(), hash: digest(probe()), nonExecutable: true };
  if (cmd === "verify-probe")
    return { verified: verify(probe(), r.signature, r.owner) };
  if (cmd === "receipt") {
    check(isHexString(r.hash, 32), "Invalid user operation hash.");
    const rec = await io.rpc(BUNDLER, "eth_getUserOperationReceipt", [r.hash]);
    if (!rec) return { status: "pending_or_unknown", hash: r.hash };
    check(
      same(rec.userOpHash, r.hash) && typeof rec.success === "boolean",
      "Unexpected receipt.",
    );
    return {
      status: rec.success ? "executed" : "reverted",
      hash: r.hash,
      txHash: rec.receipt?.transactionHash,
    };
  }
  const c = chain(r.chain);
  const read = async (url, to, fn, args = []) => {
    const data = abi.encodeFunctionData(fn, args);
    const result = await io.rpc(url, "eth_call", [{ to, data }, "latest"]);
    return abi.decodeFunctionResult(fn, result)[0];
  };
  if (cmd === "deposit-receipt") {
    check(isHexString(r.hash, 32), "Invalid transaction hash.");
    const rec = await io.rpc(c.rpc, "eth_getTransactionReceipt", [r.hash]);
    if (!rec) return { status: "pending_or_unknown" };
    check(
      same(rec.transactionHash, r.hash) && same(rec.from, getAddress(r.owner)) && same(rec.to, c.gateway),
      "Receipt is not this wallet's gateway deposit.",
    );
    if (BigInt(rec.status) !== 1n) return { status: "reverted" };
    for (const log of rec.logs.filter((l) => same(l.address, c.gateway))) {
      const event = abi.parseLog(log);
      if (
        event?.name === "RequestAddMargin" &&
        same(event.args[0][1], r.owner)
      ) {
        const pToken = event.args[0][2].toString();
        ptoken(pToken, c);
        const payments = rec.logs.filter(l => same(l.address, c.usdc))
          .map(l => abi.parseLog(l)).filter(e => e?.name === "Transfer" &&
            same(e.args.from, r.owner) && same(e.args.to, c.gateway));
        check(payments.length === 1 && payments[0].args.value > 0n, "No unique wallet USDC payment to gateway.");
        return {
          status: "gateway_confirmed",
          pToken,
          requestId: event.args[0][0].toString(),
          amount: formatUnits(payments[0].args.value, 6),
          collateralAfter: decimal(event.args[0][4]),
          cashAfter: decimal(event.args[0][5]),
        };
      }
    }
    throw Error("No matching deposit event.");
  }
  const pools = (await io.graph(marketsQuery, { c: c.id })).gatewayDatas;
  const pool = pools.find((p) => same(p.gatewayAddress, c.gateway));
  check(
    pool &&
      same(pool.engineAddress, ENGINE) &&
      same(pool.symbolManager, MANAGER) &&
      same(pool.smartAccountFactory, FACTORY) &&
      pool.markets.some(
        (m) => same(m.assetAddress, c.usdc) && String(m.assetDecimals) === "6",
      ),
    "Unexpected Deri deployment or collateral.",
  );
  const symbol = r.symbol;
  if (cmd === "markets") {
    check(
      r.underlying === undefined || ["ETH", "BTC"].includes(r.underlying),
      "Unsupported underlying.",
    );
    check(
      r.kind === undefined || ["C", "P", "perp"].includes(r.kind),
      "Use C, P or perp.",
    );
    return pool.symbols
      .filter(
        (s) =>
          /^(?:BTC|ETH)USD(?:-[1-9]\d*(?:\.\d+)?-[CP])?$/.test(s.symbol) &&
          same(s.symbolId, symbolId(s.symbol)) &&
          (!r.underlying || s.symbol.startsWith(r.underlying)) &&
          (r.kind === "perp"
            ? s.category === "futures"
            : s.category === "option" &&
              (!r.kind || s.symbol.endsWith("-" + r.kind))),
      )
      .map(({ symbol, minTradeVolume }) => ({ symbol, minTradeVolume }));
  }
  const lookup = () => {
    const s = pool.symbols.find(
      (x) => x.symbol === symbol && same(x.symbolId, symbolId(symbol)),
    );
    check(
      s && s.category === (symbol.includes("-") ? "option" : "futures"),
      "Instrument is not listed.",
    );
    return s;
  };
  const quote = async () => {
    lookup();
    return quoteRow(
      (await io.graph(markQuery, { s: symbol })).markPrice,
      symbol,
      io.now(),
    );
  };
  if (cmd === "quote") return quote();
  const owner = getAddress(r.owner);
  check(owner !== ZeroAddress, "Zero wallet.");
  if (cmd === "portfolio") {
    const rows = (
      await io.graph(portfolioQuery, {
        c: c.id,
        o: owner.toLowerCase(),
        g: c.gateway,
      })
    ).tdStates;
    return rows
      .filter((x) => !x.liquidated && same(x.bToken, c.usdc))
      .map((x) => ({ ...x, pTokenId: ptoken(x.pTokenId, c).toString() }));
  }
  check(
    ["deposit", "deposit-preview", "trade", "withdraw", "verify-order", "margin"].includes(cmd),
    "Unknown command.",
  );
  check(
    BigInt(await io.rpc(c.rpc, "eth_chainId", [])) === BigInt(c.id) &&
      BigInt(await io.rpc(DC, "eth_chainId", [])) === 20231119n,
    "RPC chain mismatch.",
  );
  const funding = cmd === "deposit" || cmd === "deposit-preview";
  const id = funding && r.pToken === "new" ? 0n : ptoken(r.pToken, c);
  let td;
  if (id !== 0n) {
    const gw = await read(c.rpc, c.gateway, "getDTokenState", [id]);
    const collateral = await read(c.rpc, c.gateway, "getBTokenState", [c.usdc]);
    td = await read(DC, ENGINE, "getTdState", [id]);
    check(
      same(gw[0], owner) &&
        same(gw[2], c.usdc) &&
        !gw[6] &&
        !gw[7] &&
        !td[7] &&
        same(td[1], toBeHex(BigInt(owner), 32)) &&
        same(td[2], collateral[0]),
      "Not this wallet's live native-USDC Pro account.",
    );
  }
  if (cmd === "margin")
    return {
      pToken: r.pToken,
      dChainRequestId: td[0].toString(),
      collateral: decimal(td[3]),
      cash: decimal(td[4]),
      cumulativePnl: decimal(td[5]),
    };
  if (funding) {
    const amount = units(r.amount, 6);
    check((await read(c.rpc, c.usdc, "decimals")) === 6n, "Token decimals mismatch.");
    const balance = await read(c.rpc, c.usdc, "balanceOf", [owner]);
    const approved =
      (await read(c.rpc, c.usdc, "allowance", [owner, c.gateway])) >= amount;
    if (cmd === "deposit-preview") return {
      previewOnly: true, owner, chainId: c.id, pToken: r.pToken,
      nativeUSDC: c.usdc, gateway: c.gateway, amount: r.amount,
      amountBaseUnits: amount.toString(), sufficientUSDC: balance >= amount,
      allowanceSufficient: approved, needsExactApproval: !approved,
    };
    check(balance >= amount, "Insufficient native USDC.");
    const to = approved ? c.gateway : c.usdc;
    const candidates = approved
      ? [
          abi.encodeFunctionData("requestAddMargin(uint256,address,uint256)", [
            id,
            c.usdc,
            amount,
          ]),
          abi.encodeFunctionData(
            "requestAddMargin(uint256,address,uint256,bool)",
            [id, c.usdc, amount, false],
          ),
        ]
      : [abi.encodeFunctionData("approve", [c.gateway, amount])];
    let data;
    for (const candidate of candidates) {
      try {
        await io.rpc(c.rpc, "eth_estimateGas", [
          { from: owner, to, data: candidate, value: "0x0" },
        ]);
        data = candidate;
        break;
      } catch (e) {
        if (candidate === candidates.at(-1)) throw e;
      }
    }
    return {
      step: approved ? "deposit" : "approve_exact",
      owner,
      pToken: r.pToken,
      amount: r.amount,
      asset: c.usdc,
      transaction: { chainId: c.id, to, value: "0", data },
    };
  }
  const action = cmd === "verify-order" ? r.action : cmd;
  check(action === "trade" || action === "withdraw", "Unsupported order.");
  const sender = await read(DC, FACTORY, "getAddress", [owner, c.id]);
  const deployed =
    (await io.rpc(DC, "eth_getCode", [sender, "latest"])) !== "0x";
  if (deployed)
    check(
      same(await read(DC, sender, "owner"), owner),
      "Smart-account owner mismatch.",
    );
  let inner, summary;
  if (action === "trade") {
    const s = lookup(),
      mark = await quote();
    const pos = await read(DC, MANAGER, "getPosition", [s.symbolId, id]);
    const vol = BigInt.asIntN(256, BigInt(pos[0]));
    const leg = tradeLeg(r, s.minTradeVolume, vol);
    inner = leg.close
      ? abi.encodeFunctionData("tradeWithCondition", [
          [id, leg.id, [leg.v, leg.price], 0, 6],
        ])
      : abi.encodeFunctionData("trade", [id, leg.id, [leg.v, leg.price]]);
    summary = {
      ...mark,
      side: r.side,
      signedVolume: decimal(leg.v),
      currentVolume: decimal(vol),
      limitUSD: r.limit,
      bound: leg.v > 0n ? "maximum" : "minimum",
      closeOnly: leg.close,
    };
  } else {
    units(r.amount, 6);
    inner = abi.encodeFunctionData("executeRemoveMargin", [
      id,
      td[2],
      units(r.amount),
    ]);
    summary = { withdrawUSDC: r.amount, recipient: owner };
  }
  // Test engine execution and its margin/limit checks without sending a transaction.
  await io.rpc(DC, "eth_call", [
    { from: sender, to: ENGINE, data: inner },
    "latest",
  ]);
  const nonce = await read(DC, EP, "getNonce", [sender, 0]);
  const op = operation(owner, c, sender, nonce, deployed, inner);
  const t = typed(op),
    hash = digest(t);
  check(
    same(
      await read(DC, EP, "getUserOpHash", [{ ...t.message, signature: "0x" }]),
      hash,
    ),
    "EntryPoint digest mismatch; do not sign.",
  );
  if (cmd === "verify-order") {
    check(
      r.hash === hash &&
        Number.isSafeInteger(r.previewAt) &&
        io.now() >= r.previewAt &&
        io.now() - r.previewAt <= 90,
      "Stale or changed preview; request new confirmation.",
    );
    verify(probe(), r.probeSignature, owner);
    verify(t, r.signature, owner);
    return {
      hash,
      method: "eth_sendUserOperation",
      url: BUNDLER,
      params: [{ ...op, signature: r.signature }, EP],
    };
  }
  return {
    action,
    owner,
    chain: r.chain,
    pToken: r.pToken,
    summary,
    hash,
    previewAt: io.now(),
    typedData: t,
  };
}
```
