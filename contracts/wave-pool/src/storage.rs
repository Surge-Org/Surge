//! Typed access to contract storage, and the TTL policy that keeps it alive.
//!
//! Soroban charges rent for state and evicts entries whose TTL runs out. An
//! evicted `Points` entry is a contributor who can no longer prove what they
//! earned, so every read path that matters bumps the entry it touched.

use soroban_sdk::{unwrap::UnwrapOptimized, Address, Env};

use crate::error::Error;
use crate::types::{Config, DataKey, Wave};

/// Ledgers in a day at the network's ~5 second close time.
const DAY_LEDGERS: u32 = 17_280;

/// Instance storage holds `Config` and is read by nearly every call, so the
/// threshold is low and the extension modest — it is cheap to keep topped up.
const INSTANCE_THRESHOLD: u32 = DAY_LEDGERS * 30;
const INSTANCE_EXTEND: u32 = DAY_LEDGERS * 90;

/// Wave and per-contributor entries have to outlive the claim window by a wide
/// margin, because a contributor who claims on the last day still needs their
/// points entry to exist. Six months of headroom against a claim window
/// measured in weeks.
const ENTRY_THRESHOLD: u32 = DAY_LEDGERS * 60;
const ENTRY_EXTEND: u32 = DAY_LEDGERS * 180;

pub fn set_config(env: &Env, config: &Config) {
    env.storage().instance().set(&DataKey::Config, config);
}

/// Reads the deploy-time config.
///
/// The constructor runs before any other entry point can, so a missing config
/// is unreachable rather than a runtime condition worth an error variant.
pub fn config(env: &Env) -> Config {
    extend_instance(env);
    env.storage()
        .instance()
        .get(&DataKey::Config)
        .unwrap_optimized()
}

pub fn extend_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_THRESHOLD, INSTANCE_EXTEND);
}

pub fn has_wave(env: &Env, number: u32) -> bool {
    env.storage().persistent().has(&DataKey::Wave(number))
}

pub fn set_wave(env: &Env, wave: &Wave) {
    let key = DataKey::Wave(wave.number);
    env.storage().persistent().set(&key, wave);
    env.storage()
        .persistent()
        .extend_ttl(&key, ENTRY_THRESHOLD, ENTRY_EXTEND);
}

pub fn wave(env: &Env, number: u32) -> Result<Wave, Error> {
    let key = DataKey::Wave(number);
    let wave = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(Error::WaveNotFound)?;
    env.storage()
        .persistent()
        .extend_ttl(&key, ENTRY_THRESHOLD, ENTRY_EXTEND);
    Ok(wave)
}

/// Points a contributor holds in a wave. Absent means zero, so a contributor
/// who never earned anything in a wave costs the contract no storage.
pub fn points(env: &Env, number: u32, contributor: &Address) -> u32 {
    let key = DataKey::Points(number, contributor.clone());
    match env.storage().persistent().get(&key) {
        Some(points) => {
            env.storage()
                .persistent()
                .extend_ttl(&key, ENTRY_THRESHOLD, ENTRY_EXTEND);
            points
        }
        None => 0,
    }
}

pub fn set_points(env: &Env, number: u32, contributor: &Address, points: u32) {
    let key = DataKey::Points(number, contributor.clone());
    if points == 0 {
        // Revoked back to nothing: drop the entry rather than keep paying rent
        // on a stored zero that reads the same as an absent one.
        env.storage().persistent().remove(&key);
        return;
    }
    env.storage().persistent().set(&key, &points);
    env.storage()
        .persistent()
        .extend_ttl(&key, ENTRY_THRESHOLD, ENTRY_EXTEND);
}
