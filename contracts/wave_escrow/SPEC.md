# Wave escrow

This registry isolates many waves under one fixed Stellar Asset Contract address.
Deploy it with the intended USDC SAC address and verify that binding before funding.
The deployment does not claim that an arbitrary SEP-41 contract is USDC.

## Lifecycle and authority

`create` authenticates the manager and fixes the close time, grace window and dust
recipient. `Funded` means fundraising; `open` requires a positive pool. Sponsors
can fund or top up `Funded` and `Open` waves before the closing timestamp.
They can withdraw only while `Funded`. The manager opens the wave; anyone can
close an Open wave at its closing timestamp. The manager settles a Closed wave
once during the grace window. The future attestation registry (issue #2) will
own how settlement authority is selected; this version makes the manager's
existing authority explicit rather than accepting unauthenticated point sets.

Legal transitions are Funded → Open → Closed → Settled and Funded/Open/Closed →
Cancelled. Settled and Cancelled are terminal. The manager can cancel before
settlement. After `expires_at` anyone can expire a never-settled wave, including
one never opened; a sponsor's refund call can perform that transition itself.
Settlement is allowed at `expires_at`; expiry is allowed strictly afterwards,
so these alternatives never overlap. Claims after settlement do not expire.

## Accounting and rounding

Amounts are integer token units, not dollars. Each point value spans the full u64 range and the total must be positive.
Each pool is at most `i64::MAX` token units, matching a classic SAC trustline
balance limit: even a sole recipient must be able to receive the whole award.
Multiplying this pool by any u64 point value is representable in i128. No unchecked wrapping arithmetic or floating point enters allocation.
At most 64 unique recipients and 64 active sponsors are supported per wave.
Zero-point recipients receive zero; duplicate recipients are rejected.

Each recipient receives `floor(pool * points / total_points)`. The difference
between the pool and the sum of these allocations is assigned to the immutable
named dust recipient. If that address is also a point recipient, the values
are combined into its one claimable balance. Dust is pulled through `claim`,
just like a normal allocation. It is recorded separately in the event stream
and wave state, and is never credited twice or left in an unclaimable bucket.

No token transfers occur during settlement. `claim` authenticates its recipient
and loads one allocation, one Wave entry and the asset configuration. It zeros
the allocation and increments the paid amount before invoking the SAC. Returning
an error reverts the entire invocation. The SAC's MissingTrustline error (13)
is mapped to `EscrowError::MissingTrustline`; it is not confused with other
transfer failures. Creating the trustline and retrying preserves the full award.

Before settlement no money has been paid to recipients and no fee is deducted.
Consequently the remaining pool equals the sum of remaining sponsor deposits;
pro-rata cancellation refunds are exactly those deposits, with no rounding.
Sponsors pull refunds independently. Failed funding, withdrawals, claims and
refunds must roll back both accounting and token effects.

The configured SAC is a trust boundary. Effects-before-interaction plus the
Soroban host's reentry rules prevent a token callback from paying an allocation
twice. They cannot make a malicious token's own reported balances truthful.
Tests use a hostile token only to exercise callback behavior, not to certify
arbitrary tokens as USDC.

## Storage and events

Only the immutable token address and next-wave counter use instance storage.
Wave state, sponsor deposits and recipient allocations use individually keyed
persistent storage. Expiring temporary entries would destroy financial rights,
so none are temporary. Keeping recipient and sponsor records out of a growing
instance map makes individual withdrawals constant-cost in recipient count.
TTL extensions, restore workflows and upgrades belong to issue #3; production
operators must preserve/restore archived persistent entries before use.

`created` publishes the token and full initial Wave. Every lifecycle transition
publishes `phase` with the full Wave. Funding and withdrawal events include the
sponsor, delta, new contribution and pool; allocation events include each
recipient's points and amount; dust events identify the recipient and amount;
claim/refund events include their recipient, amount and running paid/refunded
total. These events contain the identities and values needed to rebuild state,
without querying private data or guessing point distributions.

## Validation

From `contracts`, run:

```sh
cargo fmt --all -- --check
cargo build --locked --target wasm32v1-none --release
cargo test --locked --workspace --features wasm-tests -- --nocapture
```

The 14 unit/property tests and one compiled-Wasm resource test passed in
[GitHub Actions run 34628318758](https://github.com/farouklaaroussi07/Surge/actions/runs/34628318758).
Property testing covers 4,096 distributions over the full u64 point range,
including zero-point recipients and large pools. Other tests cover SAC balances,
missing-trustline failure/retry, cancellation, expiry, duplicate claims, illegal
transitions, authentication, failed funding rollback, registry isolation, events
and a hostile token callback. The Wasm test includes 64 active sponsors, 64 point
recipients and a separate dust recipient. See [RESOURCES.md](RESOURCES.md) for
measurements and their limits. Claims are compared in fresh transaction hosts;
CPU, memory and ledger footprint are exactly equal at one and 64 recipients.

The identical 35,414-byte Wasm was deployed and exercised on Stellar testnet on
2026-09-11. The completed receipt is [evidence/testnet.json](evidence/testnet.json).
This used valueless Circle test USDC, not real money or bounty earnings.

Contract ID: `CBWCJUXNJTHD5AJ2ADU34XAZUZBEWOIC63YPBVZBRTXENYUBYQA56IQF`

Wasm SHA-256: `552c564a54c1a03979c42dc8d80e6cf40b3a9f555db02db37482efabdca5941e`

The receipt verifies funding, Open top-up, closure, proportional settlement,
failed claim without trustline with the distinct typed error, unchanged allocation,
trustline creation and retry, dust claim, cancellation/refund and expiry/refund.
Final escrow balance was zero and sponsor plus recipient balances conserved the
starting 200,000,000 atomic test-USDC units.

## Repeat the testnet exercise

Install Stellar CLI, create two fresh testnet identities and fund their XLM using
Friendbot. Create a Circle test-USDC trustline for the sponsor and fund it using
[Circle's testnet faucet](https://faucet.circle.com/). Leave the recipient without
a USDC trustline: the script deliberately verifies that failure before creating
its trustline. Keep the CLI configuration outside the repository.

```sh
python3 wave_escrow/scripts/testnet.py \
  --config-dir /path/to/private-testnet-config \
  --wasm target/wasm32v1-none/release/wave_escrow.wasm \
  --sponsor fresh-sponsor --recipient fresh-recipient \
  --report /path/to/new-testnet-report.json
```

The script requires at least 1.3 test USDC, hard-codes testnet and verifies Circle's
asset binding before deployment. It records public transaction hashes and command
results, never secret keys. It uses an unoptimized deployment so the deployed hash
matches the measured release artifact. Testnet resets and ledger archival can make
this deployment unavailable later; use the script to repeat the evidence.
