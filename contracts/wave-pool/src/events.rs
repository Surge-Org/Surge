//! The contract's event stream.
//!
//! Events are the only record an indexer or the frontend can read back cheaply —
//! contract storage is not queryable off-chain, so anything a client needs to
//! reconstruct history has to be emitted here. Each event is a declared type
//! rather than an ad-hoc tuple so the payload shape is checked at compile time
//! and shows up in the generated bindings.
//!
//! Fields marked `#[topic]` are indexable, so they are the ones a client filters
//! on: a contributor watching for their own payout subscribes by address, and a
//! dashboard following one wave subscribes by wave number.

use soroban_sdk::{contractevent, Address};

/// Emitted once, from the constructor.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Initialized {
    #[topic]
    pub admin: Address,
    pub token: Address,
}

/// Emitted when the operator role moves. Both addresses are topics so the
/// outgoing and incoming admin can each find the handover.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminSet {
    #[topic]
    pub previous: Address,
    #[topic]
    pub current: Address,
}

/// Emitted when a wave starts accepting funding and points.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WaveOpened {
    #[topic]
    pub number: u32,
    pub start: u64,
    pub end: u64,
    pub budget: i128,
}

/// Emitted on every transfer into a wave. `escrowed` is the running total after
/// this transfer, so a client can follow funding progress without re-reading
/// the wave.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WaveFunded {
    #[topic]
    pub number: u32,
    #[topic]
    pub from: Address,
    pub amount: i128,
    pub escrowed: i128,
}

/// Emitted when a contributor is credited for an accepted issue. `total` is the
/// contributor's new balance in the wave and `wave_total` the new denominator,
/// so a client can recompute an in-flight share from events alone.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PointsAwarded {
    #[topic]
    pub number: u32,
    #[topic]
    pub contributor: Address,
    pub points: u32,
    pub total: u32,
    pub wave_total: u32,
}

/// Emitted when an award is walked back. Separate from `PointsAwarded` with a
/// negative delta: a correction is a different event in the audit trail than an
/// award, and a client should not have to inspect a sign to tell them apart.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PointsRevoked {
    #[topic]
    pub number: u32,
    #[topic]
    pub contributor: Address,
    pub points: u32,
    pub total: u32,
    pub wave_total: u32,
}

/// Emitted when a wave stops accepting funding and points and starts paying out.
/// Carries the two numbers every share in the wave is computed from, so a client
/// can verify a payout it was quoted.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WaveClosed {
    #[topic]
    pub number: u32,
    pub pool: i128,
    pub total_points: u32,
    pub claim_deadline: u64,
}
