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

## Validation status

Run `cargo test --workspace -- --nocapture` from `contracts`. Property tests
exercise 4,096 random distributions, including zero-point recipients and large
pool values. Contract tests cover SAC balances, distinct missing-trustline
failure and retry, cancellation, expiry, duplicate claims, illegal transitions,
failed funding rollback, registry isolation and a hostile callback.

`resource_measurements_at_maximum_size` prints native host estimates at one and
64 recipients under SDK limits. These are not Wasm measurements: they exclude
VM instantiation and execution. A compiled-Wasm resource run and testnet E2E
receipt are still required before this contribution satisfies issue #1. No
successful deployment or resource result is claimed until its evidence exists.
