extern crate std;
use super::*;
use proptest::prelude::*;
use soroban_sdk::{testutils::{Address as _, Events as _, Ledger as _}, IntoVal, TryFromVal, Val, xdr};

struct Fixture { env: Env, token: Address, escrow: Address, sponsor: Address, manager: Address, dust: Address }
impl Fixture {
    fn new() -> Self {
        let env = Env::default(); env.mock_all_auths(); env.ledger().set_timestamp(100);
        let admin = Address::generate(&env);
        let token = env.register_stellar_asset_contract_v2(admin.clone()).address();
        let escrow = env.register(WaveEscrow, (token.clone(),));
        let sponsor = Address::generate(&env);
        token::StellarAssetClient::new(&env, &token).mint(&sponsor, &1_000_000);
        let manager = Address::generate(&env); let dust = Address::generate(&env);
        Self { env, token, escrow, sponsor, manager, dust }
    }
    fn client(&self) -> WaveEscrowClient<'_> { WaveEscrowClient::new(&self.env, &self.escrow) }
    fn funded(&self, pool: i128) -> u64 {
        let c = self.client(); let id = c.create(&self.manager, &200, &50, &self.dust);
        c.fund(&id, &self.sponsor, &pool); id
    }
    fn closed(&self, pool: i128) -> u64 {
        self.env.ledger().set_timestamp(100); let id = self.funded(pool);
        self.client().open(&id); self.env.ledger().set_timestamp(200); self.client().close(&id); id
    }
    fn shares(&self, points: &[u64]) -> Vec<Share> {
        Vec::from_iter(&self.env, points.iter().map(|p| Share { recipient: Address::generate(&self.env), points: *p }))
    }
    fn balance(&self, who: &Address) -> i128 { token::TokenClient::new(&self.env, &self.token).balance(who) }
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(4096))]
    #[test]
    fn conservation_and_rounding(pool in 1_i128..=MAX_POOL, points in prop::collection::vec(0_u64..1_000_000, 1..=64)) {
        prop_assume!(points.iter().any(|p| *p != 0));
        let (allocations, dust) = split(pool, &points).unwrap();
        let total: i128 = points.iter().map(|p| i128::from(*p)).sum();
        prop_assert_eq!(allocations.iter().sum::<i128>() + dust, pool);
        prop_assert!(dust >= 0 && dust < points.len() as i128);
        for (i,p) in points.iter().enumerate() {
            prop_assert!(allocations[i] >= 0);
            // Multiplication is safe under MAX_POOL/MAX_POINTS, including this independent assertion.
            prop_assert!(allocations[i] * total <= pool * i128::from(*p));
            prop_assert!(pool * i128::from(*p) - allocations[i] * total < total);
        }
    }
}

#[test]
fn lifecycle_claims_and_dust_conserve_real_token_balance() {
    let f = Fixture::new(); let c = f.client(); let id = f.closed(101); let shares = f.shares(&[1,1,1]);
    c.settle(&id, &shares);
    assert_eq!(c.get_wave(&id).phase, Phase::Settled);
    for share in shares.iter() {
        assert_eq!(c.claim(&id, &share.recipient), 33);
        assert_eq!(f.balance(&share.recipient), 33);
        assert_eq!(c.try_claim(&id, &share.recipient), Err(Ok(EscrowError::NothingToClaim)));
    }
    assert_eq!(c.claim(&id, &f.dust), 2);
    assert_eq!(f.balance(&f.escrow), 0);
    assert_eq!(c.get_wave(&id).claimed, 101);
    assert_eq!(c.try_settle(&id, &shares), Err(Ok(EscrowError::WrongState)));
    assert_eq!(c.try_cancel(&id), Err(Ok(EscrowError::WrongState)));
}

#[test]
fn dust_recipient_may_also_earn_points() {
    let f=Fixture::new(); let c=f.client(); let id=f.closed(5);
    let shares=soroban_sdk::vec![&f.env, Share{recipient:f.dust.clone(),points:1},Share{recipient:Address::generate(&f.env),points:2}];
    c.settle(&id,&shares); assert_eq!(c.allocation(&id,&f.dust),2); assert_eq!(c.claim(&id,&f.dust),2);
}

#[test]
fn topups_withdrawal_and_cancellation_refund_actual_contributions() {
    let f=Fixture::new(); let c=f.client(); let id=f.funded(100);
    let second=Address::generate(&f.env);
    // Funding the second sponsor through the actual SAC transfer keeps the accounting test realistic.
    token::TokenClient::new(&f.env,&f.token).transfer(&f.sponsor,&second.clone().into(),&300);
    c.withdraw(&id,&f.sponsor,&20); c.open(&id); c.fund(&id,&second,&300); c.fund(&id,&f.sponsor,&20);
    assert_eq!(c.get_wave(&id).pool,400);
    assert_eq!(c.try_withdraw(&id,&second,&1),Err(Ok(EscrowError::WrongState)));
    c.cancel(&id); assert_eq!(c.refund(&id,&second),300); assert_eq!(c.refund(&id,&f.sponsor),100);
    assert_eq!(c.try_refund(&id,&second),Err(Ok(EscrowError::NothingToClaim)));
    assert_eq!(c.get_wave(&id).refunded,400); assert_eq!(f.balance(&f.escrow),0);
}

#[test]
fn expiry_is_permissionless_and_never_settled_waves_do_not_lock_sponsors() {
    for phase in [Phase::Funded,Phase::Open,Phase::Closed] {
        let f=Fixture::new();let c=f.client();let id=f.funded(50);
        if phase != Phase::Funded { c.open(&id); }
        if phase == Phase::Closed { f.env.ledger().set_timestamp(200);c.close(&id); }
        f.env.ledger().set_timestamp(250);
        assert_eq!(c.try_expire(&id),Err(Ok(EscrowError::TooEarly)));
        f.env.ledger().set_timestamp(251);
        assert_eq!(c.refund(&id,&f.sponsor),50);assert_eq!(c.get_wave(&id).phase,Phase::Cancelled);
        assert_eq!(c.try_open(&id),Err(Ok(EscrowError::WrongState)));
    }
}

#[test]
fn rejects_invalid_lifecycle_deadlines_points_and_duplicates() {
    let f=Fixture::new();let c=f.client();
    assert_eq!(c.try_create(&f.manager,&100,&50,&f.dust),Err(Ok(EscrowError::InvalidDeadline)));
    assert_eq!(c.try_create(&f.manager,&200,&0,&f.dust),Err(Ok(EscrowError::InvalidDeadline)));
    let id=c.create(&f.manager,&200,&50,&f.dust);
    assert_eq!(c.try_open(&id),Err(Ok(EscrowError::InvalidAmount)));
    assert_eq!(c.try_fund(&id,&f.sponsor,&0),Err(Ok(EscrowError::InvalidAmount)));
    c.fund(&id,&f.sponsor,&10);c.open(&id);
    assert_eq!(c.try_close(&id),Err(Ok(EscrowError::TooEarly)));
    f.env.ledger().set_timestamp(200);c.close(&id);
    let shares=soroban_sdk::vec![&f.env,Share{recipient:f.dust.clone(),points:1},Share{recipient:f.dust.clone(),points:2}];
    assert_eq!(c.try_settle(&id,&shares),Err(Ok(EscrowError::DuplicateRecipient)));
    assert_eq!(c.try_settle(&id,&f.shares(&[0,0])),Err(Ok(EscrowError::InvalidPoints)));
    assert_eq!(c.try_settle(&id,&f.shares(&[u64::MAX])),Err(Ok(EscrowError::InvalidPoints)));
    assert_eq!(c.try_settle(&id,&f.shares(&[1;65])),Err(Ok(EscrowError::TooManyRecipients)));
    assert_eq!(c.get_wave(&id).phase,Phase::Closed);assert_eq!(c.allocation(&id,&f.dust),0);
    f.env.ledger().set_timestamp(251);
    assert_eq!(c.try_settle(&id,&f.shares(&[1])),Err(Ok(EscrowError::DeadlinePassed)));
}

#[test]
fn missing_trustline_has_distinct_error_and_retry_preserves_allocation() {
    let f=Fixture::new();let c=f.client();let id=f.closed(99);
    // A second SAC creates a real classic issuer account, which has no trustline to our first asset.
    let other=f.env.register_stellar_asset_contract_v2(Address::generate(&f.env));
    let account=match other.asset(){xdr::Asset::CreditAlphanum4(a)=>a.issuer,_=>panic!("expected issued asset")};
    let recipient=Address::try_from_val(&f.env,&xdr::ScAddress::Account(account)).unwrap();
    c.settle(&id,&soroban_sdk::vec![&f.env,Share{recipient:recipient.clone(),points:1}]);
    assert_eq!(c.try_claim(&id,&recipient),Err(Ok(EscrowError::MissingTrustline)));
    assert_eq!(c.allocation(&id,&recipient),99);assert_eq!(c.get_wave(&id).claimed,0);assert_eq!(f.balance(&f.escrow),99);
    token::StellarAssetClient::new(&f.env,&f.token).trust(&recipient);
    assert_eq!(c.claim(&id,&recipient),99);assert_eq!(f.balance(&recipient),99);
}

#[test]
fn failed_funding_rolls_back_pool_and_sponsor_entry() {
    let f=Fixture::new();let c=f.client();let id=f.funded(1);let empty=Address::generate(&f.env);
    assert_eq!(c.try_fund(&id,&empty,&100),Err(Ok(EscrowError::TransferFailed)));
    assert_eq!(c.get_wave(&id).pool,1);assert_eq!(c.get_wave(&id).sponsors,1);assert_eq!(c.contribution(&id,&empty),0);
}

#[test]
fn waves_remain_isolated() {
    let f=Fixture::new();let c=f.client();let a=f.funded(10);let b=f.funded(20);
    c.cancel(&a);c.refund(&a,&f.sponsor);assert_eq!(c.get_wave(&b).pool,20);assert_eq!(f.balance(&f.escrow),20);
}

#[test]
fn every_transition_publishes_the_complete_wave_state() {
    let f=Fixture::new();let c=f.client();let id=f.funded(10);
    c.open(&id);
    let open_events=f.env.events().all().filter_by_contract(&f.escrow);
    let expected:Vec<(Address,Vec<Val>,Val)>=soroban_sdk::vec![&f.env,(f.escrow.clone(),(symbol_short!("phase"),id).into_val(&f.env),c.get_wave(&id).into_val(&f.env))];
    assert_eq!(open_events,expected);
    f.env.ledger().set_timestamp(200);c.close(&id);
    assert_eq!(f.env.events().all().filter_by_contract(&f.escrow).events().len(),1);
    c.settle(&id,&f.shares(&[1,2]));
    // two allocation events, one dust event, and the complete Settled snapshot.
    assert_eq!(f.env.events().all().filter_by_contract(&f.escrow).events().len(),4);
}

mod hostile {
    use super::*;
    #[contract] pub struct HostileToken;
    #[contracttype] #[derive(Clone)] enum HostileKey { Target, WaveId, Recipient, Attack, Transfers }
    #[contractimpl]
    impl HostileToken {
        pub fn configure(env:Env,target:Address,id:u64,recipient:Address){
            env.storage().instance().set(&HostileKey::Target,&target);env.storage().instance().set(&HostileKey::WaveId,&id);
            env.storage().instance().set(&HostileKey::Recipient,&recipient);env.storage().instance().set(&HostileKey::Attack,&true);
        }
        pub fn transfer(env:Env,_from:Address,_to:soroban_sdk::MuxedAddress,_amount:i128){
            let n:u32=env.storage().instance().get(&HostileKey::Transfers).unwrap_or(0);
            env.storage().instance().set(&HostileKey::Transfers,&(n+1));
            if env.storage().instance().get(&HostileKey::Attack).unwrap_or(false){
                let target:Address=env.storage().instance().get(&HostileKey::Target).unwrap();
                let id:u64=env.storage().instance().get(&HostileKey::WaveId).unwrap();
                let recipient:Address=env.storage().instance().get(&HostileKey::Recipient).unwrap();
                // This is an isolated test contract. Soroban must reject the recursive escrow call.
                let result=env.try_invoke_contract::<i128,EscrowError>(&target,&symbol_short!("claim"),(id,recipient).into_val(&env));
                assert!(result.is_err());
            }
        }
        pub fn transfers(env:Env)->u32{env.storage().instance().get(&HostileKey::Transfers).unwrap_or(0)}
    }
    #[test]
    fn hostile_token_cannot_reenter_and_double_claim(){
        let env=Env::default();env.mock_all_auths();env.ledger().set_timestamp(100);
        let token=env.register(HostileToken,());let escrow=env.register(WaveEscrow,(token.clone(),));
        let c=WaveEscrowClient::new(&env,&escrow);let t=HostileTokenClient::new(&env,&token);
        let manager=Address::generate(&env);let recipient=Address::generate(&env);
        let id=c.create(&manager,&200,&50,&manager);c.fund(&id,&manager,&100);c.open(&id);
        env.ledger().set_timestamp(200);c.close(&id);c.settle(&id,&soroban_sdk::vec![&env,Share{recipient:recipient.clone(),points:1}]);
        t.configure(&escrow,&id,&recipient);let before=t.transfers();
        // A failed nested call may abort the token call, or the token may catch it. Neither can double pay.
        match c.try_claim(&id,&recipient){
            Ok(Ok(value))=>{assert_eq!(value,100);assert_eq!(t.transfers(),before+1);assert_eq!(c.allocation(&id,&recipient),0);}
            Err(Ok(EscrowError::TransferFailed))=>{assert_eq!(t.transfers(),before);assert_eq!(c.allocation(&id,&recipient),100);assert_eq!(c.get_wave(&id).claimed,0);}
            other=>panic!("unexpected result: {other:?}"),
        }
    }
}

#[test]
fn resource_measurements_at_maximum_size() {
    for count in [1,MAX_RECIPIENTS] {
        let f=Fixture::new();let c=f.client();let id=c.create(&f.manager,&200,&50,&f.dust);
        c.fund(&id,&f.sponsor,&1_000_000);
        std::println!("RESOURCE native fund n={count}: {:?}",f.env.cost_estimate().resources());
        c.open(&id);f.env.ledger().set_timestamp(200);c.close(&id);
        let points=std::vec![1;count as usize];let shares=f.shares(&points);c.settle(&id,&shares);
        std::println!("RESOURCE native settle n={count}: {:?}",f.env.cost_estimate().resources());
        c.claim(&id,&shares.get(0).unwrap().recipient);
        std::println!("RESOURCE native claim n={count}: {:?}",f.env.cost_estimate().resources());
    }
}
