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
    let numerator = pool
        .checked_mul(i128::from(points))
        .ok_or(Error::Overflow)?;

    // Both operands are positive here, so truncation toward zero is a floor.
    Ok(numerator / i128::from(total_points))
}

#[cfg(test)]
mod tests {
    use super::share;
    use crate::error::Error;

    /// One USDC, at Stellar's seven decimal places.
    const USDC: i128 = 10_000_000;

    #[test]
    fn divides_a_pool_in_proportion_to_points() {
        let pool = 25_000 * USDC;
        assert_eq!(share(pool, 200, 450), Ok(pool * 200 / 450));
        assert_eq!(share(pool, 150, 450), Ok(pool * 150 / 450));
        assert_eq!(share(pool, 100, 450), Ok(pool * 100 / 450));
    }

    #[test]
    fn a_sole_contributor_takes_the_whole_pool() {
        let pool = 25_000 * USDC;
        assert_eq!(share(pool, 200, 200), Ok(pool));
        // And nothing is left behind when the split is exact.
        assert_eq!(share(pool, 100, 200), Ok(pool / 2));
    }

    #[test]
    fn no_points_in_the_wave_has_no_denominator() {
        // Not a zero share: a wave closed without a single point recorded is a
        // state the operator resolves by sweeping, and the caller needs to be
        // able to tell that apart from having earned nothing.
        assert_eq!(share(25_000 * USDC, 0, 0), Err(Error::NoPointsRecorded));
        assert_eq!(share(25_000 * USDC, 200, 0), Err(Error::NoPointsRecorded));
    }

    #[test]
    fn earning_nothing_or_dividing_nothing_is_zero_rather_than_an_error() {
        // Applied but never assigned.
        assert_eq!(share(25_000 * USDC, 0, 450), Ok(0));
        // Wave opened but never funded — the projection a dashboard asks for
        // before any money has arrived.
        assert_eq!(share(0, 200, 450), Ok(0));
        // Defensive: a negative pool is unreachable through the entry points,
        // but flooring a negative numerator would truncate toward zero and hand
        // back a payout, so it is pinned at zero here rather than left to the
        // division.
        assert_eq!(share(-1, 200, 450), Ok(0));
    }

    #[test]
    fn multiplying_before_dividing_keeps_what_the_other_order_throws_away() {
        let pool = 25_000 * USDC;
        let (points, total) = (200u32, 450u32);

        // What the contract computes.
        let correct = share(pool, points, total).unwrap();
        // What `pool / total * points` would compute: the per-point rate is
        // floored first, so the truncation is multiplied by every point held.
        let naive = (pool / i128::from(total)) * i128::from(points);

        assert_eq!(correct, 111_111_111_111);
        assert_eq!(naive, 111_111_111_000);
        // 111 stroops on one share of one wave. Small, but it scales with the
        // number of points a contributor holds and it is systematically in the
        // program's favour rather than randomly distributed.
        assert!(correct > naive);
    }

    #[test]
    fn floored_shares_never_add_up_to_more_than_the_pool() {
        // The property the payout depends on: if the shares could sum above the
        // pool, the final claim would revert on an empty balance. Checked across
        // splits that do not divide evenly, including a prime denominator and a
        // pool that is not a round number of stroops.
        let cases: [(i128, [u32; 3]); 4] = [
            (25_000 * USDC, [200, 150, 100]),
            (10_000 * USDC, [200, 200, 200]),
            (1, [100, 100, 100]),
            (7_777_777, [199, 151, 101]),
        ];

        for (pool, points) in cases {
            let total: u32 = points.iter().sum();
            let paid: i128 = points.iter().map(|p| share(pool, *p, total).unwrap()).sum();
            assert!(paid <= pool, "paid {} exceeds pool {}", paid, pool);
            // And the leftover is bounded by the point total, not by the pool —
            // which is what makes the dust negligible at any realistic scale.
            assert!(pool - paid < i128::from(total));
        }
    }

    #[test]
    fn an_overflowing_numerator_is_reported_rather_than_wrapped() {
        // Unreachable with a real token supply, but this is the one
        // multiplication in the contract that decides how much money moves, so
        // it fails loudly instead of wrapping to a negative payout.
        assert_eq!(share(i128::MAX, 2, 3), Err(Error::Overflow));
        // Just below the boundary the maths still works.
        assert_eq!(share(i128::MAX / 2, 1, 2), Ok(i128::MAX / 4));
    }
}
