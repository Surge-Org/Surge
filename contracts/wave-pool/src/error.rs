use soroban_sdk::contracterror;

/// Every way a `WavePool` call can fail.
///
/// The discriminants are part of the contract's public interface: a client that
/// branches on a failure reads this number out of the transaction result, so
/// they are assigned once and never reused. Append new variants, never renumber
/// existing ones.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// The wave number is already taken. Wave numbers are the identity of a
    /// wave, so reopening one would silently merge two rounds of rewards.
    WaveExists = 1,
    /// No wave was ever opened under this number.
    WaveNotFound = 2,
    /// The call only makes sense while the wave is still accepting funding and
    /// points — funding or awarding into a closed wave would change a divisor
    /// contributors have already been paid against.
    WaveNotOpen = 3,
    /// The call only makes sense after the wave is closed.
    WaveNotClosed = 4,
    /// `end` is not strictly after `start`.
    InvalidWindow = 5,
    /// Budget must be positive. A zero-budget wave has nothing to split.
    InvalidBudget = 6,
    /// Transfer amounts must be positive; the token contract would reject a
    /// negative one anyway, but failing here keeps the error legible.
    InvalidAmount = 7,
    /// Points must be positive. Awarding zero points is a no-op that would
    /// still emit an event and read as a real award in the audit trail.
    InvalidPoints = 8,
    /// Revoking more points than the contributor holds.
    PointsUnderflow = 9,
    /// The wave closed without a single point recorded, so there is no
    /// denominator to divide the pool by.
    NoPointsRecorded = 10,
    /// This contributor earned no points in this wave, or their share floors
    /// to zero.
    NothingToClaim = 11,
    /// This contributor already claimed this wave.
    AlreadyClaimed = 12,
    /// The claim window has not expired yet, so the remainder is not the
    /// admin's to sweep.
    ClaimPeriodOpen = 13,
    /// Payout arithmetic overflowed `i128`.
    Overflow = 14,
}
