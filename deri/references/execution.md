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

## Release gates

Current review build: public option listings and indicative marks have passed
in hosted chat on Base and Arbitrum. Writes are preview-only on both chains:
neither the signing probe nor public reads establish funded order execution.

Hosted-chat probe (2026-11-19): a signed-in Fast-mode chat attempted its
sign-data action for the non-executable fixture and reported that the wallet
required MFA and contract calls to be enabled. No signature was returned.
This is a wallet-policy refusal, not a verdict on the Deri signing domain.
In this state keep discovery and quotes available, but do not request a
deposit, retry with a different signature type, or change wallet settings.
If the wallet owner independently opts in, repeat the same fixture and verify
the signature against the active wallet before treating the probe as passed.

Positive check (2026-11-19): with MFA and a 10-minute contract-call window,
Bankr chat returned one signature for the unchanged fixture. Local EIP-712
recovery matched the full signer address in the response and the abbreviated
address displayed by the trading wallet. Contract calls were switched off
immediately and verified disabled after reloading Security. Nothing was
broadcast. This verifies the signing format, not order execution or settlement.

Hosted install (2026-11-19): the fork installed as `deri`, but the initial
Base ETH put and Arbitrum BTC call tests stopped at a missing
`scripts/deri.mjs`. Public option discovery and quotes are now self-contained
in SKILL.md. Test that exact standalone reader locally with
`DERI_LIVE_READ=1 npm test`.

Hosted retest (2026-11-20): Bankr Fast chat updated the private skill from
the same fork (tested source: `a2cccc3`) and identified the inline
`publicOptions` function in the installed instructions. Using public data
only, it returned the following indicative USD marks at 18:19:08 UTC:

| Funding chain | Listed options | Quoted symbol | USD mark per contract |
| --- | --- | --- | ---: |
| Base | 60 ETH puts | `ETHUSD-4000-P` | 2353.1177 |
| Arbitrum One | 50 BTC calls | `BTCUSD-190000-C` | 0.00000058925058 |

An independent indexer read 28 seconds later matched both counts and all
three sample symbols on each chain. This verifies chat discovery and quotes
without a wallet; it does not verify installation of the account helpers,
deposits, order fills, or withdrawals.

Per chain, record a fresh hosted install, independently verified chat signer,
deposit and relay, option open, protected close, withdrawal and wallet credit.
Keep evidence of user-op and transaction hashes, never executable signatures.
Run local tests with `npm ci && npm test` from this skill folder. No live funds
or live transactions are required for those tests.

Hosted account packaging (2026-11-20, fork commit `006890b`): a same-source
reinstall in Bankr chat (private skill v3) staged SKILL.md in a fresh sandbox.
Both embedded modules loaded with ethers@6.16.0. The offline probe digest
matched the local helper. The hosted `deposit-preview` for a hypothetical
new pToken and 1 native USDC returned chain IDs 8453 and 42161, 1000000
base units, and the expected chain-specific USDC and gateway addresses.
This path only reads: it returns no transaction and does not estimate a fee.
No pToken, allowance or signature was created; no funds were transferred.
The funded and failure-case release gates remain open.

After changing either helper run `npm run package:hosted` from this skill
folder and commit the generated SKILL.md. Tests reject stale embedded source
and run the documented bootstrap with no adjacent helper files.

Pre-launch checks (2026-11-25): the funded Base trading wallet passed the
non-executable signer check with a temporary permission, subsequently
disabled. Read-only simulations on existing public Base Pro accounts verified
the EntryPoint hash for an option open, a protected close, and a withdrawal.
An undercollateralized account reverted with InsufficientMargin. These are not
fills or withdrawals from the acceptance wallet.

Regression receipt:
[`0x2efd...0d4b`](https://basescan.org/tx/0x2efdcd9eaa5a898f4321b5cb284b905294000531ac42474d5311e4c61a010d4b).
The wallet paid 650.195751 USDC; the gateway event reported 520.1566 collateral
and 130.03915 cash after deposit. Use the native-USDC wallet-to-gateway Transfer
for amount paid, never either account balance or their sum.
