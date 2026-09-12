# Contracts

Soroban contracts for the Surge reward waves. One crate today: [`wave-pool`](wave-pool),
the escrow that holds a wave's USDC and pays it out in proportion to the points
contributors earned.

The frontend still runs on the fixtures in [`src/lib/model.ts`](../src/lib/model.ts).
This workspace is the on-chain half those fixtures stand in for, built and tested
on its own so the two can be joined once bindings are generated.

## The model

A wave has two phases and no way back.

**Open.** Anyone can transfer the reward asset in (`fund_wave`); the operator
records points as issues are accepted (`award`) and corrects them if a review is
revised (`revoke`). The contract tracks what it actually holds (`escrowed`)
separately from what the program announced (`budget`), so an underfunded wave
still pays out coherently.

**Closed.** `close_wave` freezes `escrowed` into `pool` and fixes a claim
deadline. Every payout divides `pool`, so two contributors with equal points are
paid equally no matter when — or in what order — they claim. Each contributor
calls `claim` once for their `pool * points / total_points`, floored. After the
deadline the operator recovers whatever is left with `sweep`.

The contract deliberately does not enforce the contribution window. Review lags
submission, so a wave closes when the operator has finished reviewing, not when
the clock runs out; `start` and `end` are recorded for the audit trail and for
clients to render.

## Entry points

| | Authorised by | |
| --- | --- | --- |
| `open_wave(number, start, end, budget)` | admin | Creates a wave. Refuses a number already used. |
| `fund_wave(number, from, amount)` | `from` | Transfers the reward asset into an open wave. |
| `award(number, contributor, points)` | admin | Adds points. Additive across issues. |
| `revoke(number, contributor, points)` | admin | Walks an award back. Refuses to underflow. |
| `close_wave(number, claim_window)` | admin | Freezes the pool, starts the claim window. |
| `claim(number, contributor)` | `contributor` | Pays their share, once. Returns the amount. |
| `sweep(number, to)` | admin | After the deadline, recovers dust and abandoned shares. |
| `set_admin(new_admin)` | current admin | Rotates the operator role. |
| `wave`, `points`, `claimable`, `has_claimed`, `config` | — | Reads. |

`claimable` doubles as the projection a contributor dashboard needs: while the
wave is open it quotes against the balance escrowed so far and moves as funding
arrives and others earn points; once closed it is exactly what `claim` will pay,
and zero once claimed.

## Invariants

These are what the tests exist to hold, and what any change here has to preserve.

1. **A wave never pays out more than it escrowed.** Shares are floored, so they
   sum to at most `pool`; `claim` additionally refuses anything above
   `pool - paid`.
2. **The divisor cannot move after anyone has been paid against it.** `pool` and
   `total_points` are both frozen at close.
3. **One claim per contributor per wave**, and a *failed* claim never consumes
   it — otherwise a contributor who tried before the wave was funded would be
   locked out permanently.
4. **A wave cannot reach another wave's funds.** All escrow shares one token
   account, so every payout is bounded by the calling wave's own accounting.
   This is not theoretical: see `a_share_cannot_be_claimed_out_of_another_wave_after_a_sweep`,
   which is a regression test for a bug that was real.
5. **The claim deadline is fixed before anyone claims** and cannot be moved,
   which is what stops `sweep` from being a discretionary withdrawal.

## Working on it

```powershell
cd contracts
cargo test                                    # 35 tests, host target
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo build --target wasm32v1-none --release  # what actually deploys
```

CI runs all four. The wasm build is separate from `cargo test` on purpose — the
release profile differs from the test profile in ways that can fail on their own
(`no_std`, `panic = "abort"`, a different target).

## Deploying

```powershell
stellar contract deploy `
  --wasm contracts/target/wasm32v1-none/release/wave_pool.wasm `
  --network testnet `
  --source-account <operator> `
  -- --admin <operator-address> --token <usdc-sac-address>
```

Admin and token are constructor arguments, not a later `initialize` call: there
is no window in which the deployed contract has no admin. Neither can be changed
afterwards except by `set_admin` — a different reward asset means a new
deployment, because every stored amount is denominated in the old one.

## Known rough edges

- `claimable` returns `NoPointsRecorded` rather than zero for a wave where
  nobody has been awarded anything yet, so a dashboard querying a brand-new wave
  has to handle that variant rather than rendering a zero.
- There is no pagination or enumeration: the contract can answer "what does this
  address hold in this wave" but not "who is in this wave". That is what the
  event stream is for, and it is why every award, claim and sweep emits one.
- Nothing here knows about repositories or issues. The mapping from an accepted
  issue to a point value is program policy and stays off-chain, in
  [`pointsFor`](../src/lib/model.ts).
