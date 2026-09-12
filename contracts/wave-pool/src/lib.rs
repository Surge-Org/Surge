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

use soroban_sdk::{contract, contractimpl, Address, Env};

use events::{AdminSet, Initialized, WaveOpened};

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
