//! Payout arithmetic.
//!
//! Kept in its own module, taking plain integers and returning a plain result,
//! so the maths can be reasoned about and tested without a ledger, a token, or
//! an authorisation. Everything that can go wrong with a payout goes wrong
//! here, and this is the only place in the contract that divides.

use crate::error::Error;

/// A contributor's share of `pool`, as `pool * points / total_points`, floored.
///
/// **Multiply before dividing.** `pool / total_points * points` is the same
/// expression in real arithmetic and a materially different one in integers:
/// with a 25,000 USDC pool and 1,250 total points it would floor the per-point
/// rate first and throw away a fraction of a stroop on *every* point a
/// contributor holds, which compounds into a visible shortfall. Multiplying
/// first keeps the loss to a single truncation at the end.
///
/// **Floor, not round.** Rounding up would mean the sum of every share could
/// exceed the pool, and the contract would come up short on the final claim —
/// with the shortfall landing on whoever claimed last, purely because of
/// ordering. Flooring guarantees the sum never exceeds `pool`: what is left
/// over is at most `total_points - 1` of the token's smallest unit, which
/// `sweep` recovers once the claim window has closed.
pub fn share(pool: i128, points: u32, total_points: u32) -> Result<i128, Error> {
    // The divisor. A wave closed without a single point recorded has no
    // denominator, and that is a state the operator has to resolve by sweeping,
    // not something to paper over with a zero share.
    if total_points == 0 {
        return Err(Error::NoPointsRecorded);
    }
    // Nothing earned, or nothing escrowed. Not an error: a contributor who
    // applied but landed nothing is entitled to exactly zero, and asking about
    // it is a reasonable thing for a client to do.
    if points == 0 || pool <= 0 {
        return Ok(0);
    }

    // `pool` is bounded by the token's total supply and `points` by a program
    // that awards them in hundreds, so this is far from `i128`'s ceiling in
    // practice. It is still checked: the one arithmetic operation in this
    // contract that can overflow is the one that decides how much money moves.
    let numerator = pool.checked_mul(i128::from(points)).ok_or(Error::Overflow)?;

    // Both operands are positive here, so truncation toward zero is a floor.
    Ok(numerator / i128::from(total_points))
}
