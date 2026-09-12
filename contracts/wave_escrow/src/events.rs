//! Wave escrow contract events.
//!
//! Each event is a declared type with #[topic]-marked fields for indexing.

use soroban_sdk::{contractevent, Address};

/// Emitted when a wave's phase changes (Funded -> Open -> Closed -> Settled/Cancelled).
#[contractevent]
#[derive(Clone, Debug)]
pub struct PhaseChanged {
    #[topic]
    pub id: u64,
    pub phase: u32, // Phase as u32
}

/// Emitted when a wave is created.
#[contractevent]
#[derive(Clone, Debug)]
pub struct WaveCreated {
    #[topic]
    pub id: u64,
    pub token: Address,
}

/// Emitted when a sponsor funds a wave.
#[contractevent]
#[derive(Clone, Debug)]
pub struct Funded {
    #[topic]
    pub id: u64,
    #[topic]
    pub sponsor: Address,
    pub amount: i128,
    pub sponsor_total: i128,
    pub pool_total: i128,
}

/// Emitted when a sponsor withdraws their contribution.
#[contractevent]
#[derive(Clone, Debug)]
pub struct Withdrawn {
    #[topic]
    pub id: u64,
    #[topic]
    pub sponsor: Address,
    pub amount: i128,
    pub sponsor_remaining: i128,
    pub pool_total: i128,
}

/// Emitted when a recipient's share is allocated.
#[contractevent]
#[derive(Clone, Debug)]
pub struct Allocated {
    #[topic]
    pub id: u64,
    #[topic]
    pub recipient: Address,
    pub points: u64,
    pub amount: i128,
}

/// Emitted when rounding dust is allocated to the dust recipient.
#[contractevent]
#[derive(Clone, Debug)]
pub struct DustAllocated {
    #[topic]
    pub id: u64,
    #[topic]
    pub recipient: Address,
    pub amount: i128,
}

/// Emitted when a recipient claims their allocation.
#[contractevent]
#[derive(Clone, Debug)]
pub struct Claimed {
    #[topic]
    pub id: u64,
    #[topic]
    pub recipient: Address,
    pub amount: i128,
    pub claimed_total: i128,
}

/// Emitted when a wave's unclaimed funds are swept after the claim deadline.
#[contractevent]
#[allow(dead_code)]
#[derive(Clone, Debug)]
pub struct Swept {
    #[topic]
    pub id: u64,
    #[topic]
    pub recipient: Address,
    pub amount: i128,
}

/// Emitted when a sponsor is refunded their contribution.
#[contractevent]
#[derive(Clone, Debug)]
pub struct Refunded {
    #[topic]
    pub id: u64,
    #[topic]
    pub sponsor: Address,
    pub amount: i128,
    pub refunded_total: i128,
}

/// Emitted when points are revoked (cancelled), redistributing to other recipients.
#[contractevent]
#[allow(dead_code)]
#[derive(Clone, Debug)]
pub struct PointsRevoked {
    #[topic]
    pub id: u64,
    #[topic]
    pub recipient: Address,
    pub points: u64,
    pub new_amount: i128,
}
