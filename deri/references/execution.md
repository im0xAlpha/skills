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

Current review build: Base and Arbitrum are both preview-only. The hosted
chat signed the Deri fixture; installed-skill and funded acceptance tests are
still outstanding. The probe alone does not enable production writes.

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

Per chain, record a fresh hosted install, independently verified chat signer,
deposit and relay, option open, protected close, withdrawal and wallet credit.
Keep evidence of user-op and transaction hashes, never executable signatures.
Run local tests with `npm ci && npm test` from this skill folder. No live funds
or live transactions are required for those tests.
