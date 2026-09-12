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
