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

use events::{AdminSet, Initialized};

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
}
