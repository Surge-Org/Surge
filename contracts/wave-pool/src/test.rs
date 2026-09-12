#![cfg(test)]
//! Tests for the wave pool.
//!
//! The numbers are taken from the program fixtures the frontend already renders
//! — wave 3 is a 25,000 USDC budget, and points come from the complexity table
//! (Trivial 100, Medium 150, High 200) — so a failure here reads against
//! something recognisable rather than against invented magnitudes.

use soroban_sdk::{
    testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke},
    token::{StellarAssetClient, TokenClient},
    Address, Env, IntoVal,
};

use crate::{Error, WavePool, WavePoolClient, WaveStatus};

/// One USDC. Stellar assets carry seven decimal places, and using the real scale
/// matters: the rounding behaviour under test is only visible at the smallest
/// unit, so testing in whole tokens would hide every case worth testing.
const USDC: i128 = 10_000_000;

/// Wave 3's window from the fixtures, as ledger timestamps.
const WAVE_START: u64 = 1_756_684_800;
const WAVE_END: u64 = 1_757_289_600;

/// Fourteen days to claim.
const CLAIM_WINDOW: u64 = 14 * 24 * 60 * 60;

struct Setup {
    env: Env,
    admin: Address,
    token: Address,
    contract: Address,
}

impl Setup {
    /// A deployed pool with a fresh test token, with authorisation mocked.
    ///
    /// `mock_all_auths` is the default because most tests are about the payout
    /// arithmetic and the state machine, and threading real signatures through
    /// every call would bury that. The tests that are specifically about who may
    /// call what build their own env without it.
    fn new() -> Self {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let token = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let contract = env.register(WavePool, (&admin, &token));

        Self {
            env,
            admin,
            token,
            contract,
        }
    }

    fn pool(&self) -> WavePoolClient<'_> {
        WavePoolClient::new(&self.env, &self.contract)
    }

    fn token(&self) -> TokenClient<'_> {
        TokenClient::new(&self.env, &self.token)
    }

    /// A new account holding `amount` of the reward asset.
    fn sponsor(&self, amount: i128) -> Address {
        let account = Address::generate(&self.env);
        StellarAssetClient::new(&self.env, &self.token).mint(&account, &amount);
        account
    }

    fn account(&self) -> Address {
        Address::generate(&self.env)
    }

    /// Moves the ledger clock to `timestamp`. The claim deadline is the only
    /// thing in this contract that depends on time, so this is only ever used to
    /// step over it — deliberately by an exact number of seconds, so the
    /// boundary itself can be tested rather than jumped past.
    fn advance_to(&self, timestamp: u64) {
        self.env
            .ledger()
            .with_mut(|ledger| ledger.timestamp = timestamp);
    }

    /// Opens wave 3 and escrows `budget` into it from a fresh sponsor.
    fn open_and_fund(&self, budget: i128) {
        let sponsor = self.sponsor(budget);
        let pool = self.pool();
        pool.open_wave(&3, &WAVE_START, &WAVE_END, &budget);
        pool.fund_wave(&3, &sponsor, &budget);
    }
}

#[test]
fn pays_each_contributor_in_proportion_to_their_points() {
    let setup = Setup::new();
    let pool = setup.pool();
    let budget = 25_000 * USDC;
    setup.open_and_fund(budget);

    // One High issue, one Medium, one Trivial — 450 points in the wave.
    let high = setup.account();
    let medium = setup.account();
    let trivial = setup.account();
    pool.award(&3, &high, &200);
    pool.award(&3, &medium, &150);
    pool.award(&3, &trivial, &100);

    pool.close_wave(&3, &CLAIM_WINDOW);

    assert_eq!(pool.claim(&3, &high), budget * 200 / 450);
    assert_eq!(pool.claim(&3, &medium), budget * 150 / 450);
    assert_eq!(pool.claim(&3, &trivial), budget * 100 / 450);

    // The contributors hold what the contract paid, and the ratios survive the
    // trip through the token.
    assert_eq!(setup.token().balance(&high), budget * 200 / 450);
    assert_eq!(setup.token().balance(&medium), budget * 150 / 450);
    assert_eq!(setup.token().balance(&trivial), budget * 100 / 450);
    // 200 points is twice 100, but the ratio only holds to within one stroop:
    // each share is floored independently, so doubling the smaller one does not
    // have to reproduce the larger. 25,000 USDC over 450 points lands exactly on
    // that case — 111_111_111_111 against 2 * 55_555_555_555. Asserting exact
    // proportionality here would be asserting something integer division does
    // not provide, and the missing unit is not lost: `sweep` recovers it.
    let doubled = setup.token().balance(&trivial) * 2;
    assert!((setup.token().balance(&high) - doubled).abs() <= 1);
}

#[test]
fn a_wave_moves_from_open_to_closed_and_records_what_it_holds() {
    let setup = Setup::new();
    let pool = setup.pool();
    let budget = 25_000 * USDC;

    pool.open_wave(&3, &WAVE_START, &WAVE_END, &budget);
    let wave = pool.wave(&3);
    assert_eq!(wave.status, WaveStatus::Open);
    assert_eq!(wave.budget, budget);
    // Nothing escrowed yet, and the payout fields are not meaningful until close.
    assert_eq!(wave.escrowed, 0);
    assert_eq!(wave.pool, 0);
    assert_eq!(wave.claim_deadline, 0);

    let sponsor = setup.sponsor(budget);
    pool.fund_wave(&3, &sponsor, &budget);
    let wave = pool.wave(&3);
    assert_eq!(wave.escrowed, budget);
    // Funding does not snapshot the pool.
    assert_eq!(wave.pool, 0);

    let contributor = setup.account();
    pool.award(&3, &contributor, &200);
    assert_eq!(pool.wave(&3).total_points, 200);

    pool.close_wave(&3, &CLAIM_WINDOW);
    let wave = pool.wave(&3);
    assert_eq!(wave.status, WaveStatus::Closed);
    assert_eq!(wave.pool, budget);
    assert_eq!(
        wave.claim_deadline,
        setup.env.ledger().timestamp() + CLAIM_WINDOW
    );
}

#[test]
fn escrowed_funds_leave_the_sponsor_and_sit_in_the_contract_until_claimed() {
    let setup = Setup::new();
    let pool = setup.pool();
    let budget = 25_000 * USDC;

    let sponsor = setup.sponsor(budget);
    pool.open_wave(&3, &WAVE_START, &WAVE_END, &budget);
    pool.fund_wave(&3, &sponsor, &budget);

    assert_eq!(setup.token().balance(&sponsor), 0);
    assert_eq!(setup.token().balance(&setup.contract), budget);

    let contributor = setup.account();
    pool.award(&3, &contributor, &200);
    pool.close_wave(&3, &CLAIM_WINDOW);

    // Still escrowed: closing a wave does not push funds anywhere.
    assert_eq!(setup.token().balance(&setup.contract), budget);

    pool.claim(&3, &contributor);
    // Sole contributor, so the whole pool is theirs and nothing is left over.
    assert_eq!(setup.token().balance(&contributor), budget);
    assert_eq!(setup.token().balance(&setup.contract), 0);
}

// --- The state machine ------------------------------------------------------
//
// Everything a privileged caller can get wrong by working from a stale view of
// the wave. These all assert the specific error rather than just "it failed",
// because the operator console shows the variant and an operator who typed last
// wave's number should not be told the budget was invalid.

#[test]
fn a_wave_number_cannot_be_reused() {
    let setup = Setup::new();
    let pool = setup.pool();

    pool.open_wave(&3, &WAVE_START, &WAVE_END, &(25_000 * USDC));
    // Reopening would reset `escrowed` and `total_points` while the tokens
    // themselves stayed put, orphaning every point already awarded.
    assert_eq!(
        pool.try_open_wave(&3, &WAVE_START, &WAVE_END, &(25_000 * USDC)),
        Err(Ok(Error::WaveExists))
    );
}

#[test]
fn a_wave_needs_a_forward_window_and_a_positive_budget() {
    let setup = Setup::new();
    let pool = setup.pool();

    assert_eq!(
        pool.try_open_wave(&3, &WAVE_END, &WAVE_START, &(25_000 * USDC)),
        Err(Ok(Error::InvalidWindow))
    );
    // Equal timestamps are a zero-length window, which is just as much a
    // data-entry error as an inverted one.
    assert_eq!(
        pool.try_open_wave(&3, &WAVE_START, &WAVE_START, &(25_000 * USDC)),
        Err(Ok(Error::InvalidWindow))
    );
    assert_eq!(
        pool.try_open_wave(&3, &WAVE_START, &WAVE_END, &0),
        Err(Ok(Error::InvalidBudget))
    );
    assert_eq!(
        pool.try_open_wave(&3, &WAVE_START, &WAVE_END, &-1),
        Err(Ok(Error::InvalidBudget))
    );
}

#[test]
fn every_wave_scoped_call_reports_an_unknown_wave() {
    let setup = Setup::new();
    let pool = setup.pool();
    let account = setup.account();

    // No wave 9 was ever opened. Each of these has its own read path, so each
    // is checked — a missing `wave` lookup in one of them would otherwise
    // surface as a panic on unwrapping storage.
    assert_eq!(pool.try_wave(&9), Err(Ok(Error::WaveNotFound)));
    assert_eq!(
        pool.try_fund_wave(&9, &account, &USDC),
        Err(Ok(Error::WaveNotFound))
    );
    assert_eq!(
        pool.try_award(&9, &account, &200),
        Err(Ok(Error::WaveNotFound))
    );
    assert_eq!(
        pool.try_revoke(&9, &account, &200),
        Err(Ok(Error::WaveNotFound))
    );
    assert_eq!(
        pool.try_close_wave(&9, &CLAIM_WINDOW),
        Err(Ok(Error::WaveNotFound))
    );
    assert_eq!(pool.try_claim(&9, &account), Err(Ok(Error::WaveNotFound)));
    assert_eq!(pool.try_sweep(&9, &account), Err(Ok(Error::WaveNotFound)));
    assert_eq!(
        pool.try_claimable(&9, &account),
        Err(Ok(Error::WaveNotFound))
    );
}

#[test]
fn a_closed_wave_stops_accepting_funding_and_points() {
    let setup = Setup::new();
    let pool = setup.pool();
    setup.open_and_fund(25_000 * USDC);

    let contributor = setup.account();
    pool.award(&3, &contributor, &200);
    pool.close_wave(&3, &CLAIM_WINDOW);

    let sponsor = setup.sponsor(1_000 * USDC);
    // Money arriving now would have no claim attached to it: `pool` is already
    // snapshotted and divided among the recorded points.
    assert_eq!(
        pool.try_fund_wave(&3, &sponsor, &(1_000 * USDC)),
        Err(Ok(Error::WaveNotOpen))
    );
    // Points moving now would change a denominator contributors are being paid
    // against, in either direction.
    assert_eq!(
        pool.try_award(&3, &contributor, &100),
        Err(Ok(Error::WaveNotOpen))
    );
    assert_eq!(
        pool.try_revoke(&3, &contributor, &100),
        Err(Ok(Error::WaveNotOpen))
    );
    // And closing again would move a deadline contributors are relying on.
    assert_eq!(
        pool.try_close_wave(&3, &CLAIM_WINDOW),
        Err(Ok(Error::WaveNotOpen))
    );

    // None of it touched the wave.
    let wave = pool.wave(&3);
    assert_eq!(wave.escrowed, 25_000 * USDC);
    assert_eq!(wave.total_points, 200);
    assert_eq!(
        wave.claim_deadline,
        setup.env.ledger().timestamp() + CLAIM_WINDOW
    );
}

#[test]
fn zero_is_not_a_valid_transfer_or_award() {
    let setup = Setup::new();
    let pool = setup.pool();
    let sponsor = setup.sponsor(25_000 * USDC);
    let contributor = setup.account();
    pool.open_wave(&3, &WAVE_START, &WAVE_END, &(25_000 * USDC));

    // Both would succeed as no-ops and emit an event that reads as a real
    // transfer or a real credit in the audit trail.
    assert_eq!(
        pool.try_fund_wave(&3, &sponsor, &0),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(
        pool.try_fund_wave(&3, &sponsor, &-1),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(
        pool.try_award(&3, &contributor, &0),
        Err(Ok(Error::InvalidPoints))
    );
    assert_eq!(
        pool.try_revoke(&3, &contributor, &0),
        Err(Ok(Error::InvalidPoints))
    );
}

// --- Claiming ---------------------------------------------------------------

#[test]
fn a_share_can_only_be_claimed_once() {
    let setup = Setup::new();
    let pool = setup.pool();
    let budget = 25_000 * USDC;
    setup.open_and_fund(budget);

    let contributor = setup.account();
    pool.award(&3, &contributor, &200);
    pool.close_wave(&3, &CLAIM_WINDOW);

    assert_eq!(pool.claim(&3, &contributor), budget);
    assert_eq!(
        pool.try_claim(&3, &contributor),
        Err(Ok(Error::AlreadyClaimed))
    );
    // The second attempt moved nothing, and `paid` still reflects one payout.
    assert_eq!(setup.token().balance(&contributor), budget);
    assert_eq!(pool.wave(&3).paid, budget);
    assert!(pool.has_claimed(&3, &contributor));
}

#[test]
fn claiming_before_the_wave_closes_is_refused_rather_than_paying_nothing() {
    let setup = Setup::new();
    let pool = setup.pool();
    setup.open_and_fund(25_000 * USDC);

    let contributor = setup.account();
    pool.award(&3, &contributor, &200);

    // `pool` is zero until close, so a permissive version of this would pay out
    // nothing and consume the contributor's single claim doing it.
    assert_eq!(
        pool.try_claim(&3, &contributor),
        Err(Ok(Error::WaveNotClosed))
    );
    assert!(!pool.has_claimed(&3, &contributor));

    // And the claim still works once the wave actually closes.
    pool.close_wave(&3, &CLAIM_WINDOW);
    assert_eq!(pool.claim(&3, &contributor), 25_000 * USDC);
}

#[test]
fn a_contributor_with_no_points_is_told_so_instead_of_being_marked_claimed() {
    let setup = Setup::new();
    let pool = setup.pool();
    setup.open_and_fund(25_000 * USDC);

    let earner = setup.account();
    let applicant = setup.account();
    pool.award(&3, &earner, &200);
    pool.close_wave(&3, &CLAIM_WINDOW);

    // Applied, never assigned. Entitled to exactly zero, and `claimable` says so
    // without erroring, because asking is a reasonable thing for a client to do.
    assert_eq!(pool.claimable(&3, &applicant), 0);
    assert_eq!(
        pool.try_claim(&3, &applicant),
        Err(Ok(Error::NothingToClaim))
    );
    // Critically, the failed claim did not burn their flag.
    assert!(!pool.has_claimed(&3, &applicant));
}

#[test]
fn a_wave_that_accepted_no_work_has_no_denominator_to_divide_by() {
    let setup = Setup::new();
    let pool = setup.pool();
    setup.open_and_fund(25_000 * USDC);

    // Closing is allowed. Refusing would leave the escrow with no way out, since
    // `sweep` only operates on a closed wave.
    pool.close_wave(&3, &CLAIM_WINDOW);
    assert_eq!(pool.wave(&3).pool, 25_000 * USDC);
    assert_eq!(pool.wave(&3).total_points, 0);

    // But there is nothing to divide by, and that is a distinct condition from a
    // contributor who earned nothing in a wave that did pay out.
    let account = setup.account();
    assert_eq!(
        pool.try_claim(&3, &account),
        Err(Ok(Error::NoPointsRecorded))
    );
    assert_eq!(
        pool.try_claimable(&3, &account),
        Err(Ok(Error::NoPointsRecorded))
    );
}

#[test]
fn an_underfunded_wave_pays_a_proportional_haircut() {
    let setup = Setup::new();
    let pool = setup.pool();

    // Announced 25,000; only 10,000 ever arrived.
    let announced = 25_000 * USDC;
    let escrowed = 10_000 * USDC;
    let sponsor = setup.sponsor(escrowed);
    pool.open_wave(&3, &WAVE_START, &WAVE_END, &announced);
    pool.fund_wave(&3, &sponsor, &escrowed);

    let high = setup.account();
    let trivial = setup.account();
    pool.award(&3, &high, &200);
    pool.award(&3, &trivial, &100);
    pool.close_wave(&3, &CLAIM_WINDOW);

    // Everyone takes the same haircut: shares divide what is held, not what was
    // announced. Paying against `budget` instead would settle the first
    // claimants in full and leave the last with a reverted transfer.
    assert_eq!(pool.claim(&3, &high), escrowed * 200 / 300);
    assert_eq!(pool.claim(&3, &trivial), escrowed * 100 / 300);

    // The shortfall stays visible rather than being absorbed: the wave records
    // what it promised alongside what it held.
    let wave = pool.wave(&3);
    assert_eq!(wave.budget, announced);
    assert_eq!(wave.pool, escrowed);
    assert!(wave.paid <= wave.pool);
}

#[test]
fn claimable_projects_while_open_and_settles_at_close() {
    let setup = Setup::new();
    let pool = setup.pool();
    let contributor = setup.account();
    let other = setup.account();

    pool.open_wave(&3, &WAVE_START, &WAVE_END, &(25_000 * USDC));
    pool.award(&3, &contributor, &200);

    // Nothing escrowed yet: sole contributor, but no pool to take a share of.
    assert_eq!(pool.claimable(&3, &contributor), 0);

    let sponsor = setup.sponsor(25_000 * USDC);
    pool.fund_wave(&3, &sponsor, &(10_000 * USDC));
    // The projection tracks the escrowed balance, which is what the contributor
    // dashboard needs mid-wave.
    assert_eq!(pool.claimable(&3, &contributor), 10_000 * USDC);

    // And it moves down as other contributors earn points. The projection is
    // honest about being a moving target.
    pool.award(&3, &other, &200);
    assert_eq!(pool.claimable(&3, &contributor), 5_000 * USDC);

    pool.fund_wave(&3, &sponsor, &(15_000 * USDC));
    pool.close_wave(&3, &CLAIM_WINDOW);

    // Settled, and equal to what `claim` actually pays.
    let quoted = pool.claimable(&3, &contributor);
    assert_eq!(quoted, 12_500 * USDC);
    assert_eq!(pool.claim(&3, &contributor), quoted);
    // Zero afterwards, so a client need not special-case a claimed share to
    // avoid offering a second claim.
    assert_eq!(pool.claimable(&3, &contributor), 0);
}

#[test]
fn revoking_points_redistributes_the_pool_to_everyone_else() {
    let setup = Setup::new();
    let pool = setup.pool();
    let budget = 25_000 * USDC;
    setup.open_and_fund(budget);

    let kept = setup.account();
    let withdrawn = setup.account();
    pool.award(&3, &kept, &200);
    pool.award(&3, &withdrawn, &200);
    assert_eq!(pool.claimable(&3, &kept), budget / 2);

    // Accepted in error, or the submission was withdrawn after review.
    pool.revoke(&3, &withdrawn, &200);
    assert_eq!(pool.points(&3, &withdrawn), 0);
    assert_eq!(pool.wave(&3).total_points, 200);
    assert_eq!(pool.claimable(&3, &kept), budget);

    // Revoking more than is held is refused rather than clamped: clamping would
    // leave the wave denominator out of step with the sum of its entries.
    assert_eq!(
        pool.try_revoke(&3, &kept, &300),
        Err(Ok(Error::PointsUnderflow))
    );
    assert_eq!(pool.wave(&3).total_points, 200);

    pool.close_wave(&3, &CLAIM_WINDOW);
    assert_eq!(pool.claim(&3, &kept), budget);
}

#[test]
fn points_accumulate_across_several_accepted_issues() {
    let setup = Setup::new();
    let pool = setup.pool();
    let budget = 25_000 * USDC;
    setup.open_and_fund(budget);

    let busy = setup.account();
    let single = setup.account();
    // Three issues in one wave, awarded as each is reviewed.
    pool.award(&3, &busy, &200);
    pool.award(&3, &busy, &150);
    pool.award(&3, &busy, &100);
    pool.award(&3, &single, &150);

    assert_eq!(pool.points(&3, &busy), 450);
    assert_eq!(pool.wave(&3).total_points, 600);

    pool.close_wave(&3, &CLAIM_WINDOW);
    assert_eq!(pool.claim(&3, &busy), budget * 450 / 600);
    assert_eq!(pool.claim(&3, &single), budget * 150 / 600);
}

// --- Sweeping ---------------------------------------------------------------

#[test]
fn sweeping_is_refused_until_the_claim_deadline_passes() {
    let setup = Setup::new();
    let pool = setup.pool();
    let treasury = setup.account();
    setup.advance_to(WAVE_END);
    setup.open_and_fund(25_000 * USDC);

    let contributor = setup.account();
    pool.award(&3, &contributor, &200);

    // Not while the wave is open: `sweep` is a cleanup, not a withdrawal.
    assert_eq!(pool.try_sweep(&3, &treasury), Err(Ok(Error::WaveNotClosed)));

    pool.close_wave(&3, &CLAIM_WINDOW);
    let deadline = pool.wave(&3).claim_deadline;
    assert_eq!(deadline, WAVE_END + CLAIM_WINDOW);

    // This is the assertion the escrow rests on. An admin able to sweep the
    // moment a wave closed could take the whole pool before anyone claimed,
    // which would make the contract custody with extra steps.
    assert_eq!(
        pool.try_sweep(&3, &treasury),
        Err(Ok(Error::ClaimPeriodOpen))
    );

    // One second short of the deadline is still the contributors' window.
    setup.advance_to(deadline - 1);
    assert_eq!(
        pool.try_sweep(&3, &treasury),
        Err(Ok(Error::ClaimPeriodOpen))
    );
    assert_eq!(setup.token().balance(&treasury), 0);

    // And the boundary itself is inclusive.
    setup.advance_to(deadline);
    assert_eq!(pool.sweep(&3, &treasury), 25_000 * USDC);
    assert_eq!(setup.token().balance(&treasury), 25_000 * USDC);
}

#[test]
fn sweeping_recovers_an_abandoned_share_but_not_a_claimed_one() {
    let setup = Setup::new();
    let pool = setup.pool();
    let treasury = setup.account();
    let budget = 25_000 * USDC;
    setup.advance_to(WAVE_END);
    setup.open_and_fund(budget);

    let claims = setup.account();
    let vanishes = setup.account();
    pool.award(&3, &claims, &200);
    pool.award(&3, &vanishes, &200);
    pool.close_wave(&3, &CLAIM_WINDOW);

    pool.claim(&3, &claims);
    assert_eq!(setup.token().balance(&claims), budget / 2);

    // The other contributor never comes back — lost key, or simply gone.
    setup.advance_to(pool.wave(&3).claim_deadline);
    assert_eq!(pool.sweep(&3, &treasury), budget / 2);

    // Exactly the abandoned half, and the contract is empty afterwards.
    assert_eq!(setup.token().balance(&treasury), budget / 2);
    assert_eq!(setup.token().balance(&setup.contract), 0);
}

#[test]
fn sweeping_recovers_the_rounding_dust_left_by_flooring_every_share() {
    let setup = Setup::new();
    let pool = setup.pool();
    let treasury = setup.account();
    let budget = 25_000 * USDC;
    setup.advance_to(WAVE_END);
    setup.open_and_fund(budget);

    // 450 points into 250,000,000,000 stroops does not divide evenly, which is
    // the whole point of the case.
    let high = setup.account();
    let medium = setup.account();
    let trivial = setup.account();
    pool.award(&3, &high, &200);
    pool.award(&3, &medium, &150);
    pool.award(&3, &trivial, &100);
    pool.close_wave(&3, &CLAIM_WINDOW);

    let paid = pool.claim(&3, &high) + pool.claim(&3, &medium) + pool.claim(&3, &trivial);

    // Flooring guarantees the shares never add up to more than the pool, which
    // is what stops the final claim reverting on an empty balance.
    assert!(paid < budget);
    let dust = budget - paid;
    // Bounded by the number of points in the wave, and in practice a handful of
    // stroops — but not zero, and not recoverable any other way.
    assert!(dust > 0 && dust < 450);
    assert_eq!(setup.token().balance(&setup.contract), dust);

    setup.advance_to(pool.wave(&3).claim_deadline);
    assert_eq!(pool.sweep(&3, &treasury), dust);
    assert_eq!(setup.token().balance(&setup.contract), 0);
}

#[test]
fn a_wave_cannot_be_swept_twice() {
    let setup = Setup::new();
    let pool = setup.pool();
    let treasury = setup.account();
    setup.advance_to(WAVE_END);

    // Two waves funded into the same contract account, which is what makes a
    // repeatable sweep dangerous rather than merely untidy: the balance is
    // there, it just belongs to wave 4.
    let sponsor = setup.sponsor(35_000 * USDC);
    pool.open_wave(&3, &WAVE_START, &WAVE_END, &(25_000 * USDC));
    pool.fund_wave(&3, &sponsor, &(25_000 * USDC));
    pool.open_wave(&4, &WAVE_END, &(WAVE_END + 604_800), &(10_000 * USDC));
    pool.fund_wave(&4, &sponsor, &(10_000 * USDC));

    let contributor = setup.account();
    pool.award(&3, &contributor, &200);
    pool.close_wave(&3, &CLAIM_WINDOW);
    setup.advance_to(pool.wave(&3).claim_deadline);

    assert_eq!(pool.sweep(&3, &treasury), 25_000 * USDC);
    assert_eq!(
        pool.try_sweep(&3, &treasury),
        Err(Ok(Error::NothingToClaim))
    );

    // Wave 4's escrow is untouched, and the treasury only ever received wave 3.
    assert_eq!(setup.token().balance(&treasury), 25_000 * USDC);
    assert_eq!(setup.token().balance(&setup.contract), 10_000 * USDC);
    assert_eq!(pool.wave(&4).escrowed, 10_000 * USDC);
}

#[test]
fn a_fully_claimed_wave_has_nothing_left_to_sweep() {
    let setup = Setup::new();
    let pool = setup.pool();
    let treasury = setup.account();
    let budget = 25_000 * USDC;
    setup.advance_to(WAVE_END);
    setup.open_and_fund(budget);

    // A single contributor takes the pool exactly, leaving no dust.
    let contributor = setup.account();
    pool.award(&3, &contributor, &200);
    pool.close_wave(&3, &CLAIM_WINDOW);
    assert_eq!(pool.claim(&3, &contributor), budget);

    setup.advance_to(pool.wave(&3).claim_deadline);
    assert_eq!(
        pool.try_sweep(&3, &treasury),
        Err(Ok(Error::NothingToClaim))
    );
    assert_eq!(setup.token().balance(&treasury), 0);
}

#[test]
fn a_share_cannot_be_claimed_out_of_another_wave_after_a_sweep() {
    let setup = Setup::new();
    let pool = setup.pool();
    let treasury = setup.account();
    setup.advance_to(WAVE_END);

    // Wave 4 is deliberately the larger of the two. The contract holds every
    // wave's escrow in one token account, so wave 4's 40,000 is more than enough
    // to cover a stale claim against wave 3 — which is what makes this reachable
    // rather than something the token's own balance check would refuse.
    let sponsor = setup.sponsor(65_000 * USDC);
    pool.open_wave(&3, &WAVE_START, &WAVE_END, &(25_000 * USDC));
    pool.fund_wave(&3, &sponsor, &(25_000 * USDC));
    pool.open_wave(&4, &WAVE_END, &(WAVE_END + 604_800), &(40_000 * USDC));
    pool.fund_wave(&4, &sponsor, &(40_000 * USDC));

    // Sole contributor to wave 3, who lets the claim window lapse.
    let late = setup.account();
    pool.award(&3, &late, &200);
    pool.close_wave(&3, &CLAIM_WINDOW);
    setup.advance_to(pool.wave(&3).claim_deadline);
    assert_eq!(pool.sweep(&3, &treasury), 25_000 * USDC);

    // Their points and their computed share both still exist. What no longer
    // exists is wave 3's money.
    assert_eq!(pool.points(&3, &late), 200);
    assert_eq!(pool.try_claim(&3, &late), Err(Ok(Error::PoolExhausted)));

    // Wave 4, still open, keeps every stroop of its escrow.
    assert_eq!(setup.token().balance(&setup.contract), 40_000 * USDC);
    assert_eq!(setup.token().balance(&late), 0);
    assert_eq!(pool.wave(&4).escrowed, 40_000 * USDC);
}

// --- Authorisation ----------------------------------------------------------
//
// These build their own environment rather than using `Setup`, because `Setup`
// mocks every authorisation — which is what makes the arithmetic tests readable
// and exactly what must not be in place here.

/// A pool deployed with no mocked authorisations at all.
fn unmocked() -> (Env, Address, Address) {
    let env = Env::default();
    let admin = Address::generate(&env);
    let token = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    let contract = env.register(WavePool, (&admin, &token));
    (env, admin, contract)
}

#[test]
fn no_privileged_call_succeeds_without_an_authorisation() {
    let (env, _admin, contract) = unmocked();
    let pool = WavePoolClient::new(&env, &contract);
    let account = Address::generate(&env);

    // Nothing is signed, so `require_auth` has nothing to satisfy it. These fail
    // as host errors rather than contract errors — authorisation is checked
    // before the contract body runs, which is the point.
    assert!(pool
        .try_open_wave(&3, &WAVE_START, &WAVE_END, &(25_000 * USDC))
        .is_err());
    assert!(pool.try_set_admin(&account).is_err());

    // Reads stay open: nothing here moves funds or grants anything, and a client
    // rendering a dashboard has no signature to offer.
    assert_eq!(pool.config().admin, _admin);
}

#[test]
fn the_admin_is_the_address_whose_authorisation_is_required() {
    let setup = Setup::new();
    let pool = setup.pool();

    // With every auth mocked the calls succeed, so the question is *whose*
    // signature the host recorded as required — which is what a caller would
    // actually have to produce on a real network.
    pool.open_wave(&3, &WAVE_START, &WAVE_END, &(25_000 * USDC));
    assert_eq!(setup.env.auths()[0].0, setup.admin);

    // Funded so the sweep at the end has something to recover; the funder's own
    // authorisation is covered by the next test.
    let sponsor = setup.sponsor(25_000 * USDC);
    pool.fund_wave(&3, &sponsor, &(25_000 * USDC));

    let contributor = setup.account();
    pool.award(&3, &contributor, &200);
    assert_eq!(setup.env.auths()[0].0, setup.admin);

    pool.close_wave(&3, &CLAIM_WINDOW);
    assert_eq!(setup.env.auths()[0].0, setup.admin);

    setup.advance_to(pool.wave(&3).claim_deadline);
    pool.sweep(&3, &setup.account());
    assert_eq!(setup.env.auths()[0].0, setup.admin);
}

#[test]
fn funding_and_claiming_are_authorised_by_the_account_they_move_funds_for() {
    let setup = Setup::new();
    let pool = setup.pool();
    let budget = 25_000 * USDC;

    let sponsor = setup.sponsor(budget);
    pool.open_wave(&3, &WAVE_START, &WAVE_END, &budget);

    // Funding is authorised by the funder, not the operator — that is what lets
    // a sponsor pay in directly instead of routing through the admin's account.
    pool.fund_wave(&3, &sponsor, &budget);
    assert_eq!(setup.env.auths()[0].0, sponsor);

    let contributor = setup.account();
    pool.award(&3, &contributor, &200);
    pool.close_wave(&3, &CLAIM_WINDOW);

    // And a claim is authorised by the claimant. The admin cannot stand in for
    // them, which is the limit that keeps the escrow from being trusted about
    // where money goes.
    pool.claim(&3, &contributor);
    assert_eq!(setup.env.auths()[0].0, contributor);
}

#[test]
fn an_intruder_cannot_open_a_wave_by_signing_for_themselves() {
    let (env, admin, contract) = unmocked();
    let intruder = Address::generate(&env);
    let args = (3u32, WAVE_START, WAVE_END, 25_000 * USDC).into_val(&env);

    // A perfectly valid signature — from the wrong address. The contract asks
    // for the admin's authorisation specifically, so offering someone else's is
    // not a near-miss that lands on a permissive branch; it simply is not the
    // authorisation that was requested.
    let pool = WavePoolClient::new(&env, &contract);
    env.mock_auths(&[MockAuth {
        address: &intruder,
        invoke: &MockAuthInvoke {
            contract: &contract,
            fn_name: "open_wave",
            args,
            sub_invokes: &[],
        },
    }]);
    assert!(pool
        .try_open_wave(&3, &WAVE_START, &WAVE_END, &(25_000 * USDC))
        .is_err());
    assert!(pool.try_wave(&3).is_err());

    // The same call with the admin's signature goes through, so the refusal above
    // is about who signed and not about the arguments.
    env.mock_auths(&[MockAuth {
        address: &admin,
        invoke: &MockAuthInvoke {
            contract: &contract,
            fn_name: "open_wave",
            args: (3u32, WAVE_START, WAVE_END, 25_000 * USDC).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    pool.open_wave(&3, &WAVE_START, &WAVE_END, &(25_000 * USDC));
    assert_eq!(pool.wave(&3).budget, 25_000 * USDC);
}

#[test]
fn rotating_the_admin_moves_every_privileged_path_with_it() {
    let setup = Setup::new();
    let pool = setup.pool();
    let successor = setup.account();

    assert_eq!(pool.config().admin, setup.admin);
    pool.set_admin(&successor);
    // The handover itself is authorised by the outgoing admin, so the role can
    // only ever move to an address the incumbent signed for.
    assert_eq!(setup.env.auths()[0].0, setup.admin);
    assert_eq!(pool.config().admin, successor);

    // Every privileged path follows, rather than only the ones that happen to
    // re-read the config: they all go through `require_admin`.
    pool.open_wave(&3, &WAVE_START, &WAVE_END, &(25_000 * USDC));
    assert_eq!(setup.env.auths()[0].0, successor);

    let contributor = setup.account();
    pool.award(&3, &contributor, &200);
    assert_eq!(setup.env.auths()[0].0, successor);

    pool.close_wave(&3, &CLAIM_WINDOW);
    assert_eq!(setup.env.auths()[0].0, successor);

    // And the role keeps moving: the new admin can hand it on again.
    pool.set_admin(&setup.admin);
    assert_eq!(setup.env.auths()[0].0, successor);
    assert_eq!(pool.config().admin, setup.admin);
}

#[test]
fn the_previous_admin_cannot_act_after_the_handover() {
    let (env, admin, contract) = unmocked();
    let pool = WavePoolClient::new(&env, &contract);
    let successor = Address::generate(&env);

    env.mock_auths(&[MockAuth {
        address: &admin,
        invoke: &MockAuthInvoke {
            contract: &contract,
            fn_name: "set_admin",
            args: (successor.clone(),).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    pool.set_admin(&successor);

    // The outgoing admin signs a wave open, correctly, and is refused — the
    // signature is valid, it is simply no longer the one the contract asks for.
    env.mock_auths(&[MockAuth {
        address: &admin,
        invoke: &MockAuthInvoke {
            contract: &contract,
            fn_name: "open_wave",
            args: (3u32, WAVE_START, WAVE_END, 25_000 * USDC).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    assert!(pool
        .try_open_wave(&3, &WAVE_START, &WAVE_END, &(25_000 * USDC))
        .is_err());
    assert!(pool.try_wave(&3).is_err());

    // The successor's signature works on the same call.
    env.mock_auths(&[MockAuth {
        address: &successor,
        invoke: &MockAuthInvoke {
            contract: &contract,
            fn_name: "open_wave",
            args: (3u32, WAVE_START, WAVE_END, 25_000 * USDC).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    pool.open_wave(&3, &WAVE_START, &WAVE_END, &(25_000 * USDC));
    assert_eq!(pool.wave(&3).budget, 25_000 * USDC);
}
