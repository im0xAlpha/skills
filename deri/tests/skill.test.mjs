import test from "node:test";
import assert from "node:assert/strict";
import {
  Wallet,
  ZeroAddress,
  getAddress,
  parseUnits,
  toBeHex,
  verifyTypedData,
} from "ethers";
import {
  abi,
  chain,
  digest,
  ENGINE,
  FACTORY,
  MANAGER,
  probe,
  ptoken,
  symbolId,
  tradeLeg,
  units,
} from "../scripts/protocol.mjs";
import { run } from "../scripts/deri.mjs";

const wallet = Wallet.createRandom(),
  owner = wallet.address,
  sender = Wallet.createRandom().address;
const symbol = "ETHUSD-4000-P",
  bId = toBeHex(99, 32);
function fixture(network, extra = {}) {
  const c = chain(network),
    id = ((2n << 248n) + (BigInt(c.id) << 160n) + 1n).toString();
  const calls = [];
  const args = {
    owner,
    chain: network,
    pToken: id,
    symbol,
    side: "buy",
    size: "0.01",
    limit: "200",
  };
  const io = {
    now: () => 1000,
    async graph(q) {
      if (q.includes("markPrice("))
        return {
          markPrice: [
            { symbol, markPrice: "199", timestamp: extra.markTime ?? 999 },
          ],
        };
      if (q.includes("tdStates("))
        return {
          tdStates: [
            { pTokenId: id, bToken: c.usdc, liquidated: false },
            { pTokenId: id, bToken: ZeroAddress, liquidated: false },
          ],
        };
      return {
        gatewayDatas: [
          {
            gatewayAddress: c.gateway,
            engineAddress: ENGINE,
            symbolManager: MANAGER,
            smartAccountFactory: FACTORY,
            markets: [
              { assetAddress: extra.asset ?? c.usdc, assetDecimals: "6" },
            ],
            symbols: [
              {
                symbol,
                category: "option",
                symbolId: symbolId(symbol),
                minTradeVolume: "0.001",
              },
            ],
          },
        ],
      };
    },
    async rpc(url, m, params) {
      calls.push(m);
      if (m === "eth_chainId") return url === c.rpc ? c.id : 20231119;
      if (m === "eth_getCode") return extra.deployed ? "0xef" : "0x";
      if (m === "eth_estimateGas") return "0x10000";
      if (m === "eth_getUserOperationReceipt") return extra.receipt ?? null;
      assert.equal(m, "eth_call");
      const tx = params[0],
        parsed = abi.parseTransaction({ data: tx.data });
      if (tx.from === sender && tx.to === ENGINE) return "0x";
      const results = {
        getBTokenState: [bId, ZeroAddress, toBeHex(0, 32), 0],
        getDTokenState: [
          extra.owner ?? owner,
          1,
          c.usdc,
          0,
          0,
          0,
          false,
          false,
        ],
        getTdState: [1, toBeHex(owner, 32), bId, 10n ** 19n, 0, 0, 0, false],
        getAddress: sender,
        owner,
        getNonce: extra.nonce ?? 2,
        decimals: 6,
        balanceOf: extra.balance ?? 50000000,
        allowance: extra.allowance ?? 0,
        getPosition: [toBeHex(parseUnits("0.025", 18), 32), toBeHex(0, 32)],
      };
      if (parsed.name === "getUserOpHash") {
        const t = probe(),
          op = parsed.args[0].toObject();
        t.message = Object.fromEntries(
          Object.keys(t.message).map((k) => [k, op[k]]),
        );
        return abi.encodeFunctionResult(parsed.name, [digest(t)]);
      }
      return abi.encodeFunctionResult(parsed.name, [results[parsed.name]]);
    },
  };
  return { args, io, c, calls };
}
for (const network of ["base", "arbitrum"]) {
  test(
    network +
      ": discover, quote, identify account, fund, open, close, withdraw",
    async () => {
      const { args, io, c, calls } = fixture(network);
      assert.equal(
        (await run("markets", { chain: network, kind: "P" }, io))[0].symbol,
        symbol,
      );
      assert.equal((await run("quote", args, io)).indicativeMarkUSD, "199");
      assert.equal((await run("portfolio", args, io)).length, 1);
      assert.equal((await run("margin", args, io)).collateral, "10.0");
      const d = { ...args, pToken: "new", amount: "1.2" };
      for (const balance of [0, 1200000]) {
        const f = fixture(network, {balance});
        const preview = await run("deposit-preview", d, f.io);
        assert.equal(preview.previewOnly, true);
        assert.equal(preview.sufficientUSDC, balance >= 1200000);
        assert.equal(preview.needsExactApproval, true);
        assert.equal(preview.amountBaseUnits, "1200000");
        assert.equal(preview.gateway, c.gateway);
        assert.equal(preview.transaction, undefined);
        assert.ok(f.calls.every(m => ["eth_call","eth_chainId"].includes(m)));
        if (!balance) await assert.rejects(run("deposit", d, f.io), /Insufficient/);
      }
      const approval = await run("deposit", d, io);
      assert.deepEqual(
        [...abi.decodeFunctionData("approve", approval.transaction.data)].map(
          String,
        ),
        [getAddress(c.gateway), "1200000"],
      );
      const deposit = await run(
        "deposit",
        d,
        fixture(network, { allowance: 1200000 }).io,
      );
      assert.equal(deposit.transaction.to, c.gateway);
      assert.equal(
        abi.parseTransaction({ data: deposit.transaction.data }).args[2],
        1200000n,
      );
      const order = await run("trade", args, io);
      assert.equal(order.typedData.domain.chainId, 20231119);
      assert.ok(order.typedData.message.initCode.startsWith(FACTORY));
      const sign = (t) => wallet.signTypedData(t.domain, t.types, t.message);
      const v = {
        ...args,
        action: "trade",
        previewAt: order.previewAt,
        hash: order.hash,
        signature: await sign(order.typedData),
        probeSignature: await sign(probe()),
      };
      const signed = await run("verify-order", v, io);
      assert.equal(signed.method, "eth_sendUserOperation");
      assert.equal(
        verifyTypedData(
          order.typedData.domain,
          order.typedData.types,
          order.typedData.message,
          signed.params[0].signature,
        ),
        owner,
      );
      await assert.rejects(
        run("verify-order", { ...v, signature: v.probeSignature }, io),
        /Unexpected/,
      );
      await assert.rejects(
        run("verify-order", v, fixture(network, { nonce: 3 }).io),
        /changed/,
      );
      await assert.rejects(
        run("verify-order", { ...v, limit: "201" }, io),
        /changed/,
      );
      await assert.rejects(
        run("verify-order", { ...v, previewAt: 1 }, io),
        /Stale/,
      );
      const close = await run(
        "trade",
        { ...args, side: "close", size: undefined },
        io,
      );
      const unwrap = (result) =>
        abi.parseTransaction({
          data: abi.decodeFunctionData(
            "execute",
            result.typedData.message.callData,
          )[2],
        });
      assert.equal(unwrap(close).name, "tradeWithCondition");
      assert.equal(unwrap(close).args[0][4], 6n);
      assert.equal(unwrap(close).args[0][2][0], -parseUnits("0.025", 18));
      const withdrawal = await run("withdraw", { ...args, amount: "0.7" }, io);
      assert.equal(unwrap(withdrawal).args[2], parseUnits("0.7", 18));
      assert.ok(
        !calls.includes("eth_sendUserOperation") &&
          !calls.includes("eth_sendRawTransaction"),
      );
    },
  );
}
test("reject wrong chain, collateral, owner, stale price, precision and invalid lots", async () => {
  const { args } = fixture("base");
  assert.throws(() => chain("bnb"));
  assert.throws(() => units("0.0000001", 6));
  assert.throws(() => ptoken(args.pToken, chain("arbitrum")));
  assert.throws(() => tradeLeg({ ...args, size: "0.0011" }, "0.001", 0n));
  for (const extra of [
    { asset: ZeroAddress },
    { owner: ZeroAddress },
    { markTime: 100 },
  ])
    await assert.rejects(run("trade", args, fixture("base", extra).io));
  assert.equal(
    (await run("trade", args, fixture("base", { deployed: true }).io)).typedData
      .message.initCode,
    "0x",
  );
});
test("non-executable fixture, expected signer and explicit receipt states", async () => {
  const t = probe(),
    sig = await wallet.signTypedData(t.domain, t.types, t.message);
  // Golden digest also checked using getUserOpHash on the production EntryPoint.
  assert.equal(
    digest(t),
    "0x06552a430759d1301e8b5ff1674a607c7a13bebdc27b2d106cc3ccea50363cf9",
  );
  assert.equal(t.message.sender, ZeroAddress);
  assert.equal(t.message.initCode, "0x");
  assert.equal(t.message.accountGasLimits, toBeHex(0, 32));
  assert.ok((await run("verify-probe", { owner, signature: sig })).verified);
  await assert.rejects(run("verify-probe", { owner: sender, signature: sig }));
  const hash = digest(t);
  assert.equal(
    (await run("receipt", { hash }, fixture("base").io)).status,
    "pending_or_unknown",
  );
  assert.equal(
    (
      await run(
        "receipt",
        { hash },
        fixture("base", { receipt: { userOpHash: hash, success: false } }).io,
      )
    ).status,
    "reverted",
  );
});
test("deposit confirmation identifies the account from the gateway's own event", async () => {
  const { args, c, io } = fixture("base"),
    hash = toBeHex(3, 32);
  const event = abi.encodeEventLog("RequestAddMargin", [
    [10, owner, args.pToken, bId, units("1.2"), 0, 0],
  ]);
  const rec = {
    transactionHash: hash,
    from: owner,
    to: c.gateway,
    status: "0x1",
    logs: [
      { address: ZeroAddress, ...event },
      { address: c.gateway, ...event },
      { address: c.usdc, ...abi.encodeEventLog("Transfer", [owner, c.gateway, 1500000]) },
    ],
  };
  const input = { ...args, hash };
  const result = await run("deposit-receipt", input, { ...io, rpc: async () => rec });
  assert.equal(result.amount, "1.5");
  assert.equal(result.collateralAfter, "1.2");
  await assert.rejects(run("deposit-receipt", input, {
    ...io, rpc: async () => ({...rec, logs:rec.logs.slice(0,2)}),
  }), /No unique/);
  assert.equal(
    (await run("deposit-receipt", input, { ...io, rpc: async () => rec }))
      .requestId,
    "10",
  );
  await assert.rejects(
    run("deposit-receipt", input, {
      ...io,
      rpc: async () => ({ ...rec, logs: rec.logs.slice(0, 1) }),
    }),
    /No matching/,
  );
});

test("receipt polling never resubmits on timeout, missing or mismatched result", async () => {
  const hash = digest(probe()), txHash = toBeHex(123, 32);
  let calls = 0;
  const poll = (reply) => run("receipt", {hash}, {rpc: async (_url, method, params) => {
    assert.equal(method, "eth_getUserOperationReceipt");
    assert.deepEqual(params, [hash]);
    calls++;
    if (reply instanceof Error) throw reply;
    return reply;
  }});
  await assert.rejects(poll(new Error("timeout")), /timeout/);
  assert.equal((await poll(null)).status, "pending_or_unknown");
  await assert.rejects(poll({userOpHash:txHash, success:true}), /Unexpected/);
  assert.deepEqual(await poll({userOpHash:hash, success:true, receipt:{transactionHash:txHash}}),
    {status:"executed", hash, txHash});
  assert.equal(calls, 4);
});
