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

Use the active Bankr EVM wallet. Bind every request to one explicit funding chain
(`base` or `arbitrum`) and one wallet-owned Pro pToken. Ask if ambiguous.
Never bridge, accept another token, export a key, create a session key, or ask
for Bankr credentials. Do not work around Bankr signing, eligibility, recipient
or regional restrictions. Bankr signs on mainnet dChain 20231119; it does not
broadcast a regular EVM transaction there.

Run `node scripts/deri.mjs COMMAND` with a JSON object on stdin from the
skill directory (or import its exported `run(command, object)` in the sandbox).
Pass data as data, never interpolate chat text into shell commands. If helpers
or native wallet tools are unavailable, stop rather than generating calldata.

* Discovery: `markets {"chain":"base","underlying":"ETH","kind":"P"}`.
  C/P are calls/puts; use `perp` only for futures. Use live listed strikes.
* Quote: `quote {"chain":"arbitrum","symbol":"ETHUSD-4000-P"}` gives an
  indicative mark per contract, not a guaranteed fill. Explain no expiry and
  ongoing funding. Do not silently substitute everlasting for dated options.
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
