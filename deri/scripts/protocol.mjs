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
