#![no_std]
//! Escrow for one Surge reward wave.
//!
//! A wave collects USDC into this contract while it is open, records the points
//! a contributor earned for each accepted issue, and — once closed — pays each
//! contributor their points-weighted share of whatever was actually escrowed.

mod error;
mod types;

pub use error::Error;
pub use types::{Config, DataKey, Wave, WaveStatus};

use soroban_sdk::contract;

#[contract]
pub struct WavePool;
