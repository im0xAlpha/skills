import { getAddress, isHexString, toBeHex, ZeroAddress } from "ethers";
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
      same(rec.from, getAddress(r.owner)) && same(rec.to, c.gateway),
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
        return {
          status: "gateway_confirmed",
          pToken,
          requestId: event.args[0][0].toString(),
          amount: decimal(event.args[0][4]),
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
