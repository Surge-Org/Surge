#![cfg(feature = "wasm-tests")]
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token, xdr::ScAddress, Address, Env, TryFromVal, Vec,
};
use wave_escrow::{Share, WaveEscrowClient, MAX_RECIPIENTS};

#[test]
fn compiled_wasm_fits_network_limits_and_claim_footprint_is_constant() {
    let mut small_claim = None;
    for count in [1, MAX_RECIPIENTS] {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(100);
        let sponsor = Address::generate(&env);
        let token = env
            .register_stellar_asset_contract_v2(sponsor.clone())
            .address();
        token::StellarAssetClient::new(&env, &token).mint(&sponsor, &1_000_000);
        let wasm = include_bytes!("../../target/wasm32v1-none/release/wave_escrow.wasm");
        let escrow = env.register(wasm.as_slice(), (token.clone(),));
        let c = WaveEscrowClient::new(&env, &escrow);
        let id = c.create(&sponsor, &200, &50, &sponsor);
        c.fund(&id, &sponsor, &(i128::from(count) * 10_000));
        for _ in 1..count {
            let extra_sponsor = Address::generate(&env);
            token::StellarAssetClient::new(&env, &token).mint(&extra_sponsor, &1);
            c.fund(&id, &extra_sponsor, &1);
        }
        println!(
            "RESOURCE wasm fund n={count}: {:?}",
            env.cost_estimate().resources()
        );
        assert_eq!(c.get_wave(&id).sponsors, count);
        c.open(&id);
        env.ledger().set_timestamp(200);
        c.close(&id);
        let shares = Vec::from_iter(
            &env,
            (0..count).map(|_| Share {
                recipient: Address::generate(&env),
                points: 1,
            }),
        );
        c.settle(&id, &shares);
        println!(
            "RESOURCE wasm settle n={count}: {:?}",
            env.cost_estimate().resources()
        );
        // A network transaction starts with a fresh host. Reload ledger state so
        // prior funding/settlement host objects do not inflate the claim estimate.
        let escrow_xdr = ScAddress::from(&escrow);
        let recipient_xdr = ScAddress::from(shares.get(0).unwrap().recipient);
        let sponsor_xdr = ScAddress::from(&sponsor);
        let env = Env::from_snapshot(env.to_snapshot());
        env.mock_all_auths();
        let escrow = Address::try_from_val(&env, &escrow_xdr).unwrap();
        let recipient = Address::try_from_val(&env, &recipient_xdr).unwrap();
        let sponsor = Address::try_from_val(&env, &sponsor_xdr).unwrap();
        let c = WaveEscrowClient::new(&env, &escrow);
        assert_eq!(c.claim(&id, &recipient), 10_000);
        let resources = env.cost_estimate().resources();
        println!("RESOURCE wasm claim n={count}: {resources:?}");
        let footprint = (
            resources.instructions,
            resources.mem_bytes,
            resources.disk_read_entries,
            resources.memory_read_entries,
            resources.write_entries,
            resources.disk_read_bytes,
            resources.write_bytes,
            resources.contract_events_size_bytes,
        );
        if let Some(small) = small_claim {
            assert_eq!(footprint, small);
        } else {
            small_claim = Some(footprint);
        }
        assert_eq!(c.allocation(&id, &sponsor), i128::from(count - 1));
        // Env enforces SDK network limits on each real Wasm invocation, not just native contract calls.
    }
}
