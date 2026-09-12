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

use crate::{WavePool, WavePoolClient, WaveStatus};

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
