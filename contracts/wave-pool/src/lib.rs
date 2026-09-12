#![no_std]
//! Escrow for one Surge reward wave.
//!
//! A wave collects USDC into this contract while it is open, records the points
//! a contributor earned for each accepted issue, and — once closed — pays each
//! contributor their points-weighted share of whatever was actually escrowed.

mod error;
mod events;
mod split;
mod storage;
mod types;

mod test;

pub use error::Error;
pub use types::{Config, DataKey, Wave, WaveStatus};

use soroban_sdk::{contract, contractimpl, token::TokenClient, Address, Env};

use events::{
    AdminSet, Claimed, Initialized, PointsAwarded, PointsRevoked, Swept, WaveClosed, WaveFunded,
    WaveOpened,
};

#[contract]
pub struct WavePool;

#[contractimpl]
impl WavePool {
    /// Binds the contract to its operator and its reward asset.
    ///
    /// This runs in the same transaction as the upload, which is what closes
    /// the initialisation race an `initialize` entry point would leave open:
    /// there is no window in which a deployed contract has no admin and
    /// whoever calls first becomes it.
    pub fn __constructor(env: Env, admin: Address, token: Address) {
        storage::set_config(
            &env,
            &Config {
                admin: admin.clone(),
                token: token.clone(),
            },
        );
        Initialized { admin, token }.publish(&env);
    }

    /// The operator and reward asset this pool was deployed against.
    pub fn config(env: Env) -> Config {
        storage::config(&env)
    }

    /// Opens wave `number` for funding and for points.
    ///
    /// `start` and `end` describe the contribution window for the audit trail
    /// and for clients to render. The contract does not gate on them: a wave
    /// closes when the operator has finished reviewing the last submission, not
    /// when the clock runs out, and a contract that refused points after `end`
    /// would strand work that was submitted in time but reviewed a day late.
    pub fn open_wave(
        env: Env,
        number: u32,
        start: u64,
        end: u64,
        budget: i128,
    ) -> Result<(), Error> {
        Self::require_admin(&env);

        // Wave numbers are identity, not a label. Reopening one would silently
        // merge two rounds of rewards into a single pool and denominator.
        if storage::has_wave(&env, number) {
            return Err(Error::WaveExists);
        }
        if end <= start {
            return Err(Error::InvalidWindow);
        }
        if budget <= 0 {
            return Err(Error::InvalidBudget);
        }

        storage::set_wave(
            &env,
            &Wave {
                number,
                start,
                end,
                budget,
                escrowed: 0,
                total_points: 0,
                status: WaveStatus::Open,
                pool: 0,
                paid: 0,
                claim_deadline: 0,
            },
        );

        WaveOpened {
            number,
            start,
            end,
            budget,
        }
        .publish(&env);
        Ok(())
    }

    /// Transfers `amount` of the reward asset from `from` into wave `number`.
    ///
    /// Open to anyone, not just the admin: the program's own treasury funds most
    /// of a wave, but a sponsor topping one up is a normal thing to want, and
    /// gating it behind the operator would mean routing sponsor funds through
    /// the operator's own account first. The authorisation that matters is
    /// `from`'s — nobody can move tokens out of an account that did not sign for
    /// it — and there is no privilege attached to having funded a wave.
    pub fn fund_wave(env: Env, number: u32, from: Address, amount: i128) -> Result<(), Error> {
        from.require_auth();

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let mut wave = storage::wave(&env, number)?;
        // Funding a closed wave would add tokens the payout maths has already
        // divided around them: `pool` was snapshotted at close, so the transfer
        // would land in the contract with no claim attached to it.
        if wave.status != WaveStatus::Open {
            return Err(Error::WaveNotOpen);
        }

        wave.escrowed = wave.escrowed.checked_add(amount).ok_or(Error::Overflow)?;

        // Transfer first, then record. The token call is the step that can fail
        // for reasons this contract cannot see — insufficient balance, a frozen
        // trustline, an authorisation the account declined — and a revert there
        // must not leave `escrowed` claiming funds that never arrived.
        let config = storage::config(&env);
        TokenClient::new(&env, &config.token).transfer(
            &from,
            env.current_contract_address(),
            &amount,
        );
        storage::set_wave(&env, &wave);

        WaveFunded {
            number,
            from,
            amount,
            escrowed: wave.escrowed,
        }
        .publish(&env);
        Ok(())
    }

    /// Credits `contributor` with `points` in wave `number`.
    ///
    /// The contract takes a raw point count rather than an issue complexity: the
    /// Trivial/Medium/High to 100/150/200 mapping is program policy that has
    /// changed before and will change again, and baking a policy table into a
    /// deployed contract means a redeploy to adjust it. What has to be on-chain
    /// is the number the payout divides.
    ///
    /// Additive, so a contributor landing three issues in a wave is three calls
    /// and the sum is kept by the contract. Passing an absolute total instead
    /// would make every award depend on the caller having read the current value
    /// first, and two operators reviewing different issues concurrently would
    /// silently overwrite each other.
    pub fn award(env: Env, number: u32, contributor: Address, points: u32) -> Result<(), Error> {
        Self::require_admin(&env);

        // A zero award is a no-op that would still emit an event and read as a
        // real credit in the audit trail.
        if points == 0 {
            return Err(Error::InvalidPoints);
        }

        let mut wave = storage::wave(&env, number)?;
        // The denominator is frozen at close and contributors are paid against
        // it. Awarding afterwards would dilute shares already paid out, so the
        // contract would owe more than it holds.
        if wave.status != WaveStatus::Open {
            return Err(Error::WaveNotOpen);
        }

        let total = storage::points(&env, number, &contributor)
            .checked_add(points)
            .ok_or(Error::Overflow)?;
        wave.total_points = wave
            .total_points
            .checked_add(points)
            .ok_or(Error::Overflow)?;

        storage::set_points(&env, number, &contributor, total);
        storage::set_wave(&env, &wave);

        PointsAwarded {
            number,
            contributor,
            points,
            total,
            wave_total: wave.total_points,
        }
        .publish(&env);
        Ok(())
    }

    /// Walks back `points` of a contributor's credit in wave `number`.
    ///
    /// Needed because acceptance is a human judgement that gets revised — an
    /// issue marked accepted in error, or a submission withdrawn after review.
    /// Without this the only correction available would be to close the wave,
    /// sweep it, and open a replacement, which penalises everyone else in it.
    ///
    /// Only while the wave is open. After close, a contributor's share is a
    /// number they can act on, and some of them will already have claimed
    /// against the same denominator.
    pub fn revoke(env: Env, number: u32, contributor: Address, points: u32) -> Result<(), Error> {
        Self::require_admin(&env);

        if points == 0 {
            return Err(Error::InvalidPoints);
        }

        let mut wave = storage::wave(&env, number)?;
        if wave.status != WaveStatus::Open {
            return Err(Error::WaveNotOpen);
        }

        let held = storage::points(&env, number, &contributor);
        // Refuse rather than saturate at zero. Revoking more than a contributor
        // holds means the operator is working from a stale figure, and clamping
        // would leave the wave denominator out of step with the sum of its
        // entries — which is the one invariant every payout depends on.
        let total = held.checked_sub(points).ok_or(Error::PointsUnderflow)?;
        wave.total_points = wave
            .total_points
            .checked_sub(points)
            .ok_or(Error::PointsUnderflow)?;

        storage::set_points(&env, number, &contributor, total);
        storage::set_wave(&env, &wave);

        PointsRevoked {
            number,
            contributor,
            points,
            total,
            wave_total: wave.total_points,
        }
        .publish(&env);
        Ok(())
    }

    /// Stops the wave accepting funding and points, and starts it paying out.
    ///
    /// This is the operator's signal that reviewing is finished — not the end of
    /// the contribution window, which the contract deliberately does not gate on.
    ///
    /// `claim_window` is a duration in seconds, not an absolute timestamp: the
    /// operator knows how long contributors should get, and an absolute deadline
    /// computed off-chain against a clock that is not the ledger's is a way to
    /// accidentally set one in the past. It is added to the ledger timestamp to
    /// fix `claim_deadline`, after which `sweep` can recover what nobody took.
    ///
    /// A wave with no points recorded still closes. Refusing would be worse than
    /// pointless: `sweep` only works on a closed wave, so a wave that took
    /// funding and accepted no work would have no path back out and its escrow
    /// would be locked in the contract permanently.
    pub fn close_wave(env: Env, number: u32, claim_window: u64) -> Result<(), Error> {
        Self::require_admin(&env);

        let mut wave = storage::wave(&env, number)?;
        // Closing twice would move `claim_deadline` — and on a wave already
        // paying out, that means extending or retracting a window contributors
        // are relying on.
        if wave.status != WaveStatus::Open {
            return Err(Error::WaveNotOpen);
        }

        // Freeze the divisor. From here the escrowed balance can still change
        // (claims leave, a stray transfer could arrive) but `pool` cannot, so two
        // contributors with equal points are paid equally regardless of when they
        // claim or what order they claim in.
        wave.pool = wave.escrowed;
        wave.status = WaveStatus::Closed;
        wave.claim_deadline = env
            .ledger()
            .timestamp()
            .checked_add(claim_window)
            .ok_or(Error::Overflow)?;

        storage::set_wave(&env, &wave);

        WaveClosed {
            number,
            pool: wave.pool,
            total_points: wave.total_points,
            claim_deadline: wave.claim_deadline,
        }
        .publish(&env);
        Ok(())
    }

    /// Pays `contributor` their points-weighted share of a closed wave.
    ///
    /// Requires the contributor's own authorisation, and pays the address that
    /// authorised — there is no recipient parameter. Letting a caller nominate
    /// where a share goes would make this contract a route for redirecting
    /// someone else's payout the moment the admin key, or any future privileged
    /// path, could call it on their behalf. A contributor who wants the funds
    /// elsewhere can move them afterwards.
    ///
    /// Anyone can call this for themselves; the operator cannot claim on a
    /// contributor's behalf. That is a deliberate limit — it means the escrow
    /// never needs to be trusted about *where* money goes, only about how much.
    pub fn claim(env: Env, number: u32, contributor: Address) -> Result<i128, Error> {
        contributor.require_auth();

        let mut wave = storage::wave(&env, number)?;
        // Before close, `pool` is zero and `total_points` is still moving. A
        // claim here would pay nothing and burn the one-shot flag doing it.
        if wave.status != WaveStatus::Closed {
            return Err(Error::WaveNotClosed);
        }
        if storage::has_claimed(&env, number, &contributor) {
            return Err(Error::AlreadyClaimed);
        }

        let points = storage::points(&env, number, &contributor);
        let amount = split::share(wave.pool, points, wave.total_points)?;
        // Distinguish "earned nothing" from a successful zero-value transfer.
        // Marking the flag for a zero payout would spend a contributor's single
        // claim on nothing; failing tells a client the share has not settled and
        // a retry after the wave is funded is worth making.
        if amount <= 0 {
            return Err(Error::NothingToClaim);
        }

        // The wave cannot pay out more than it holds. This is a real guard, not
        // a belt-and-braces assertion: after `sweep`, `paid` is saturated at
        // `pool` but a contributor who never claimed still has points and still
        // computes a non-zero share. Without this check their transfer would be
        // attempted against the contract's balance — which holds *every* wave's
        // escrow — and would succeed by paying them out of a different, possibly
        // still-open wave.
        if amount > wave.pool - wave.paid {
            return Err(Error::PoolExhausted);
        }

        wave.paid = wave.paid.checked_add(amount).ok_or(Error::Overflow)?;

        // State before transfer. Soroban's host already forbids re-entering a
        // contract that is mid-call, so this ordering is not what stops a
        // malicious token from calling back into `claim` — but it means the
        // guarantee does not rest on that host behaviour, and it keeps `paid`
        // consistent with the flag no matter which step fails.
        storage::mark_claimed(&env, number, &contributor);
        storage::set_wave(&env, &wave);

        let config = storage::config(&env);
        TokenClient::new(&env, &config.token).transfer(
            &env.current_contract_address(),
            &contributor,
            &amount,
        );

        Claimed {
            number,
            contributor,
            points,
            amount,
            paid: wave.paid,
        }
        .publish(&env);
        Ok(amount)
    }

    /// Recovers what a closed wave did not pay out, once the claim window has
    /// expired.
    ///
    /// Two things end up unclaimed, and they are different in size but not in
    /// kind. The first is rounding dust: flooring every share leaves up to
    /// `total_points - 1` of the smallest unit behind, which is negligible per
    /// wave and not negligible across a program's lifetime. The second is
    /// abandoned shares — a contributor who loses their key, or simply never
    /// comes back. Both would otherwise sit in the contract forever, since
    /// nothing else in this contract can move them.
    ///
    /// **The deadline is what makes this safe.** Without it, an admin able to
    /// sweep a wave the moment it closed could take the whole pool before a
    /// single contributor claimed, which would make the escrow pointless — it
    /// would be custody with extra steps. `claim_deadline` is fixed at close,
    /// before anyone has claimed, and cannot be moved afterwards, so the
    /// contributors' window is committed to in advance.
    ///
    /// `to` is a parameter rather than the admin address: the sweep destination
    /// is a program treasury, and the operator key that signs for it is not
    /// usually the account that should hold funds.
    pub fn sweep(env: Env, number: u32, to: Address) -> Result<i128, Error> {
        Self::require_admin(&env);

        let mut wave = storage::wave(&env, number)?;
        if wave.status != WaveStatus::Closed {
            return Err(Error::WaveNotClosed);
        }
        if env.ledger().timestamp() < wave.claim_deadline {
            return Err(Error::ClaimPeriodOpen);
        }

        // `pool - paid` is exact: `pool` is frozen and `paid` accumulates every
        // outgoing transfer, so this is the remainder without iterating anyone.
        let amount = wave.pool - wave.paid;
        if amount <= 0 {
            return Err(Error::NothingToClaim);
        }

        // Bring `paid` up to `pool` so the wave has nothing left to sweep. This
        // is what makes a second sweep fail on `amount <= 0` rather than
        // attempting a transfer against a balance that may belong to another
        // wave — the contract holds every wave's escrow in one account, and a
        // repeatable sweep would let one wave drain another's funds.
        wave.paid = wave.pool;
        storage::set_wave(&env, &wave);

        let config = storage::config(&env);
        TokenClient::new(&env, &config.token).transfer(
            &env.current_contract_address(),
            &to,
            &amount,
        );

        Swept { number, to, amount }.publish(&env);
        Ok(amount)
    }

    /// Whether a contributor has already been paid for a wave.
    pub fn has_claimed(env: Env, number: u32, contributor: Address) -> bool {
        storage::has_claimed(&env, number, &contributor)
    }

    /// What `contributor` would be paid for wave `number`, in the token's
    /// smallest unit.
    ///
    /// While the wave is open this is a projection against the balance escrowed
    /// so far, and it moves as funding arrives and as other contributors are
    /// awarded points — which is what the contributor dashboard wants to show.
    /// Once closed it is the settled figure `claim` will pay, and zero for a
    /// contributor who has already claimed.
    pub fn claimable(env: Env, number: u32, contributor: Address) -> Result<i128, Error> {
        let wave = storage::wave(&env, number)?;
        if wave.status == WaveStatus::Closed && storage::has_claimed(&env, number, &contributor) {
            return Ok(0);
        }
        let basis = match wave.status {
            WaveStatus::Open => wave.escrowed,
            WaveStatus::Closed => wave.pool,
        };
        split::share(
            basis,
            storage::points(&env, number, &contributor),
            wave.total_points,
        )
    }

    /// Points a contributor holds in a wave. Zero for anyone never awarded.
    pub fn points(env: Env, number: u32, contributor: Address) -> u32 {
        storage::points(&env, number, &contributor)
    }

    /// The full state of one wave, for clients rendering its progress.
    pub fn wave(env: Env, number: u32) -> Result<Wave, Error> {
        storage::wave(&env, number)
    }

    /// Hands the operator role to `new_admin`.
    ///
    /// Deliberately not two-step: the admin can only ever become an address the
    /// current admin signed for, and a pending-acceptance dance would leave the
    /// role ambiguous for as long as the handover sat unaccepted.
    pub fn set_admin(env: Env, new_admin: Address) {
        let mut config = storage::config(&env);
        config.admin.require_auth();

        let previous = config.admin.clone();
        config.admin = new_admin.clone();
        storage::set_config(&env, &config);

        AdminSet {
            previous,
            current: new_admin,
        }
        .publish(&env);
    }

    /// Asserts the caller is the operator.
    ///
    /// Kept private: every privileged entry point calls it, and exposing it
    /// would put an entry point on the interface whose only effect is to
    /// consume an authorisation.
    fn require_admin(env: &Env) -> Config {
        let config = storage::config(env);
        config.admin.require_auth();
        config
    }
}
