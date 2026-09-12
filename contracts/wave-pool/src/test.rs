#![cfg(test)]
//! Tests for the wave pool.
//!
//! The numbers are taken from the program fixtures the frontend already renders
//! — wave 3 is a 25,000 USDC budget, and points come from the complexity table
//! (Trivial 100, Medium 150, High 200) — so a failure here reads against
//! something recognisable rather than against invented magnitudes.

use soroban_sdk::{
    testutils::Address as _,
    token::{StellarAssetClient, TokenClient},
    Address, Env,
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
    assert_eq!(wave.claim_deadline, setup.env.ledger().timestamp() + CLAIM_WINDOW);
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
    assert_eq!(pool.try_claimable(&9, &account), Err(Ok(Error::WaveNotFound)));
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
    assert_eq!(wave.claim_deadline, setup.env.ledger().timestamp() + CLAIM_WINDOW);
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
