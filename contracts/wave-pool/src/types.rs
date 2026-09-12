use soroban_sdk::{contracttype, Address};

/// Set once, at deploy time.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    /// The program operator: opens waves, records points, closes waves.
    pub admin: Address,
    /// The reward asset — the USDC SAC address on the target network. Fixed at
    /// deploy: changing the token under a funded pool would leave the escrowed
    /// balance stranded in a contract that no longer looks at it.
    pub token: Address,
}

/// A wave accepts funding and points while `Open`, and pays out while `Closed`.
/// There is no path back to `Open`.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum WaveStatus {
    Open,
    Closed,
}

/// One reward round.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Wave {
    pub number: u32,
    /// Ledger timestamps for the contribution window. Held for the audit trail
    /// and for clients to render; the contract does not gate on them, because a
    /// wave closes when the operator has finished reviewing, not when the clock
    /// runs out.
    pub start: u64,
    pub end: u64,
    /// What the program intends to pay, in the token's smallest unit.
    pub budget: i128,
    /// What has actually been transferred in. Tracked separately from `budget`
    /// because an underfunded wave still has to pay out something coherent.
    pub escrowed: i128,
    /// Denominator for every share in this wave.
    pub total_points: u32,
    pub status: WaveStatus,
    /// `escrowed` frozen at close. Payouts divide this, not the live balance,
    /// so a late transfer into the contract cannot change what an earlier
    /// claimant was owed.
    pub pool: i128,
    /// Running total actually paid out, so the unclaimed remainder is known
    /// without iterating contributors.
    pub paid: i128,
    /// Ledger timestamp after which the admin may sweep whatever is unclaimed.
    /// Zero while the wave is open.
    pub claim_deadline: u64,
}

/// Storage layout.
///
/// `Points` and `Claimed` are keyed by wave *and* contributor rather than held
/// as a map on `Wave`: a map would be read and rewritten whole on every award,
/// which turns one contributor's payout into a write proportional to the size
/// of the wave.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Config,
    Wave(u32),
    Points(u32, Address),
    Claimed(u32, Address),
}
