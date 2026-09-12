#![no_std]
//! Escrow for one Surge reward wave.
//!
//! A wave collects USDC into this contract while it is open, records the points
//! a contributor earned for each accepted issue, and — once closed — pays each
//! contributor their points-weighted share of whatever was actually escrowed.

mod error;
mod events;
mod storage;
mod types;

pub use error::Error;
pub use types::{Config, DataKey, Wave, WaveStatus};

use soroban_sdk::{contract, contractimpl, token::TokenClient, Address, Env};

use events::{AdminSet, Initialized, PointsAwarded, PointsRevoked, WaveFunded, WaveOpened};

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
            &env.current_contract_address(),
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
        wave.total_points = wave.total_points.checked_add(points).ok_or(Error::Overflow)?;

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
