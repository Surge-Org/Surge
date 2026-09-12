#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env, Map,
    Vec,
};

/// Settlement and active-sponsor bounds are part of the public contract.
pub const MAX_RECIPIENTS: u32 = 64;
pub const MAX_SPONSORS: u32 = 64;
pub const MAX_POINTS: i128 = MAX_RECIPIENTS as i128 * u64::MAX as i128;
/// A classic SAC trustline uses i64. Every whole award must fit an empty trustline.
/// This bound also keeps pool * any u64 points representable in i128.
pub const MAX_POOL: i128 = i64::MAX as i128;
pub const MAX_GRACE_SECONDS: u64 = 31 * 24 * 60 * 60;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum EscrowError {
    NotFound = 1,
    WrongState = 2,
    InvalidAmount = 3,
    InvalidDeadline = 4,
    DeadlinePassed = 5,
    TooEarly = 6,
    TooManyRecipients = 7,
    DuplicateRecipient = 8,
    InvalidPoints = 9,
    PoolLimit = 10,
    NothingToClaim = 11,
    MissingTrustline = 12,
    TransferFailed = 13,
    TooManySponsors = 14,
    IdExhausted = 15,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Phase {
    Funded,
    Open,
    Closed,
    Settled,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Wave {
    pub manager: Address,
    pub dust_recipient: Address,
    pub closes_at: u64,
    pub expires_at: u64,
    pub phase: Phase,
    pub pool: i128,
    pub claimed: i128,
    pub refunded: i128,
    pub sponsors: u32,
    pub total_points: i128,
    pub dust: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Share {
    pub recipient: Address,
    pub points: u64,
}

#[contracttype]
#[derive(Clone)]
enum Key {
    Token,
    NextId,
    Wave(u64),
    Sponsor(u64, Address),
    Allocation(u64, Address),
}

#[contract]
pub struct WaveEscrow;

fn wave(env: &Env, id: u64) -> Result<Wave, EscrowError> {
    env.storage()
        .persistent()
        .get(&Key::Wave(id))
        .ok_or(EscrowError::NotFound)
}
fn save(env: &Env, id: u64, w: &Wave) {
    env.storage().persistent().set(&Key::Wave(id), w);
}
fn amount(env: &Env, key: &Key) -> i128 {
    env.storage().persistent().get(key).unwrap_or(0)
}
fn phase_event(env: &Env, id: u64, w: &Wave) {
    env.events()
        .publish((symbol_short!("phase"), id), w.clone());
}
fn pay(env: &Env, from: &Address, to: &Address, value: i128) -> Result<(), EscrowError> {
    let token: Address = env.storage().instance().get(&Key::Token).unwrap();
    match token::TokenClient::new(env, &token).try_transfer(from, to, &value) {
        Ok(Ok(())) => Ok(()),
        // SAC ContractError::TrustlineMissingError. All other errors remain distinct.
        Err(Ok(error)) if error == soroban_sdk::Error::from_contract_error(13) => {
            Err(EscrowError::MissingTrustline)
        }
        _ => Err(EscrowError::TransferFailed),
    }
}
fn cancel_expired(env: &Env, id: u64, w: &mut Wave) -> Result<(), EscrowError> {
    if w.phase == Phase::Cancelled {
        return Ok(());
    }
    if w.phase == Phase::Settled {
        return Err(EscrowError::WrongState);
    }
    if env.ledger().timestamp() <= w.expires_at {
        return Err(EscrowError::TooEarly);
    }
    w.phase = Phase::Cancelled;
    save(env, id, w);
    phase_event(env, id, w);
    Ok(())
}

/// Pure rounding kernel: floor shares and a separately claimable dust allocation.
/// Inputs are bounded so the multiplication cannot overflow i128.
pub fn split(
    pool: i128,
    points: &[u64],
) -> Result<([i128; MAX_RECIPIENTS as usize], i128), EscrowError> {
    if pool <= 0 || pool > MAX_POOL {
        return Err(EscrowError::PoolLimit);
    }
    if points.is_empty() || points.len() > MAX_RECIPIENTS as usize {
        return Err(EscrowError::TooManyRecipients);
    }
    let mut total = 0_i128;
    for p in points {
        total += i128::from(*p);
    }
    if total <= 0 || total > MAX_POINTS {
        return Err(EscrowError::InvalidPoints);
    }
    let mut allocations = [0_i128; MAX_RECIPIENTS as usize];
    let mut allocated = 0;
    for (index, p) in points.iter().enumerate() {
        let value = pool * i128::from(*p) / total;
        allocations[index] = value;
        allocated += value;
    }
    Ok((allocations, pool - allocated))
}

#[contractimpl]
impl WaveEscrow {
    /// Bind this registry to the intended USDC Stellar Asset Contract at deployment.
    pub fn __constructor(env: Env, usdc: Address) {
        env.storage().instance().set(&Key::Token, &usdc);
        env.storage().instance().set(&Key::NextId, &0_u64);
    }

    /// Create a wave in Funded (fundraising) state. Opening requires a positive pool.
    /// The manager is the settlement authority until the separate attestation registry is integrated.
    pub fn create(
        env: Env,
        manager: Address,
        closes_at: u64,
        grace_seconds: u64,
        dust_recipient: Address,
    ) -> Result<u64, EscrowError> {
        manager.require_auth();
        if closes_at <= env.ledger().timestamp()
            || grace_seconds == 0
            || grace_seconds > MAX_GRACE_SECONDS
        {
            return Err(EscrowError::InvalidDeadline);
        }
        let expires_at = closes_at
            .checked_add(grace_seconds)
            .ok_or(EscrowError::InvalidDeadline)?;
        let id: u64 = env.storage().instance().get(&Key::NextId).unwrap();
        env.storage().instance().set(
            &Key::NextId,
            &id.checked_add(1).ok_or(EscrowError::IdExhausted)?,
        );
        let w = Wave {
            manager,
            dust_recipient,
            closes_at,
            expires_at,
            phase: Phase::Funded,
            pool: 0,
            claimed: 0,
            refunded: 0,
            sponsors: 0,
            total_points: 0,
            dust: 0,
        };
        save(&env, id, &w);
        let token: Address = env.storage().instance().get(&Key::Token).unwrap();
        env.events()
            .publish((symbol_short!("created"), id), (token, w));
        Ok(id)
    }

    /// Deposit from one sponsor before the close time, including top-ups while Open.
    pub fn fund(env: Env, id: u64, sponsor: Address, value: i128) -> Result<(), EscrowError> {
        sponsor.require_auth();
        let mut w = wave(&env, id)?;
        if w.phase != Phase::Funded && w.phase != Phase::Open {
            return Err(EscrowError::WrongState);
        }
        if env.ledger().timestamp() >= w.closes_at {
            return Err(EscrowError::DeadlinePassed);
        }
        if value <= 0 {
            return Err(EscrowError::InvalidAmount);
        }
        if value > MAX_POOL - w.pool {
            return Err(EscrowError::PoolLimit);
        }
        let key = Key::Sponsor(id, sponsor.clone());
        let previous = amount(&env, &key);
        if previous == 0 {
            if w.sponsors == MAX_SPONSORS {
                return Err(EscrowError::TooManySponsors);
            }
            w.sponsors += 1;
        }
        w.pool += value;
        env.storage().persistent().set(&key, &(previous + value));
        save(&env, id, &w);
        pay(&env, &sponsor, &env.current_contract_address(), value)?;
        env.events().publish(
            (symbol_short!("funded"), id, sponsor),
            (value, previous + value, w.pool),
        );
        Ok(())
    }

    /// Withdraw a sponsor contribution only during fundraising, before Open.
    pub fn withdraw(env: Env, id: u64, sponsor: Address, value: i128) -> Result<(), EscrowError> {
        sponsor.require_auth();
        let mut w = wave(&env, id)?;
        if w.phase != Phase::Funded {
            return Err(EscrowError::WrongState);
        }
        let key = Key::Sponsor(id, sponsor.clone());
        let previous = amount(&env, &key);
        if value <= 0 || value > previous {
            return Err(EscrowError::InvalidAmount);
        }
        w.pool -= value;
        if value == previous {
            w.sponsors -= 1;
        }
        env.storage().persistent().set(&key, &(previous - value));
        save(&env, id, &w);
        pay(&env, &env.current_contract_address(), &sponsor, value)?;
        env.events().publish(
            (symbol_short!("withdraw"), id, sponsor),
            (value, previous - value, w.pool),
        );
        Ok(())
    }

    /// Manager opens a funded wave before its fixed closing time.
    pub fn open(env: Env, id: u64) -> Result<(), EscrowError> {
        let mut w = wave(&env, id)?;
        w.manager.require_auth();
        if w.phase != Phase::Funded {
            return Err(EscrowError::WrongState);
        }
        if w.pool == 0 {
            return Err(EscrowError::InvalidAmount);
        }
        if env.ledger().timestamp() >= w.closes_at {
            return Err(EscrowError::DeadlinePassed);
        }
        w.phase = Phase::Open;
        save(&env, id, &w);
        phase_event(&env, id, &w);
        Ok(())
    }

    /// Anyone can close an Open wave once its time box ends.
    pub fn close(env: Env, id: u64) -> Result<(), EscrowError> {
        let mut w = wave(&env, id)?;
        if w.phase != Phase::Open {
            return Err(EscrowError::WrongState);
        }
        if env.ledger().timestamp() < w.closes_at {
            return Err(EscrowError::TooEarly);
        }
        if env.ledger().timestamp() > w.expires_at {
            return Err(EscrowError::DeadlinePassed);
        }
        w.phase = Phase::Closed;
        save(&env, id, &w);
        phase_event(&env, id, &w);
        Ok(())
    }

    /// Commit at most 64 unique recipients once, during the grace window.
    /// Every allocation is a separate persistent entry; no token transfers occur here.
    pub fn settle(env: Env, id: u64, shares: Vec<Share>) -> Result<(), EscrowError> {
        let mut w = wave(&env, id)?;
        w.manager.require_auth();
        if w.phase != Phase::Closed {
            return Err(EscrowError::WrongState);
        }
        if env.ledger().timestamp() > w.expires_at {
            return Err(EscrowError::DeadlinePassed);
        }
        if shares.is_empty() || shares.len() > MAX_RECIPIENTS {
            return Err(EscrowError::TooManyRecipients);
        }
        let mut seen = Map::<Address, bool>::new(&env);
        let mut points = [0_u64; MAX_RECIPIENTS as usize];
        let mut total = 0_i128;
        for (index, share) in shares.iter().enumerate() {
            if seen.contains_key(share.recipient.clone()) {
                return Err(EscrowError::DuplicateRecipient);
            }
            seen.set(share.recipient, true);
            total += i128::from(share.points);
            points[index] = share.points;
        }
        let (allocations, dust) = split(w.pool, &points[..shares.len() as usize])?;
        for (index, share) in shares.iter().enumerate() {
            let value = allocations[index];
            if value > 0 {
                env.storage()
                    .persistent()
                    .set(&Key::Allocation(id, share.recipient.clone()), &value);
            }
            env.events().publish(
                (symbol_short!("allocated"), id, share.recipient),
                (share.points, value),
            );
        }
        if dust > 0 {
            let key = Key::Allocation(id, w.dust_recipient.clone());
            env.storage()
                .persistent()
                .set(&key, &(amount(&env, &key) + dust));
            env.events()
                .publish((symbol_short!("dust"), id, w.dust_recipient.clone()), dust);
        }
        w.phase = Phase::Settled;
        w.total_points = total;
        w.dust = dust;
        save(&env, id, &w);
        phase_event(&env, id, &w);
        Ok(())
    }

    /// Pull one allocation in O(1) storage accesses, independent of recipient count.
    /// A failed SAC transfer reverts the whole invocation, including this debit.
    pub fn claim(env: Env, id: u64, recipient: Address) -> Result<i128, EscrowError> {
        recipient.require_auth();
        let mut w = wave(&env, id)?;
        if w.phase != Phase::Settled {
            return Err(EscrowError::WrongState);
        }
        let key = Key::Allocation(id, recipient.clone());
        let value = amount(&env, &key);
        if value == 0 {
            return Err(EscrowError::NothingToClaim);
        }
        env.storage().persistent().set(&key, &0_i128);
        w.claimed += value;
        save(&env, id, &w);
        pay(&env, &env.current_contract_address(), &recipient, value)?;
        env.events().publish(
            (symbol_short!("claimed"), id, recipient),
            (value, w.claimed),
        );
        Ok(value)
    }

    /// Manager cancels any wave that has not settled; sponsor balances remain refundable.
    pub fn cancel(env: Env, id: u64) -> Result<(), EscrowError> {
        let mut w = wave(&env, id)?;
        w.manager.require_auth();
        if w.phase == Phase::Settled || w.phase == Phase::Cancelled {
            return Err(EscrowError::WrongState);
        }
        w.phase = Phase::Cancelled;
        save(&env, id, &w);
        phase_event(&env, id, &w);
        Ok(())
    }

    /// Permissionless expiry after the grace window, including waves never opened.
    pub fn expire(env: Env, id: u64) -> Result<(), EscrowError> {
        let mut w = wave(&env, id)?;
        cancel_expired(&env, id, &mut w)
    }

    /// Pull the sponsor's full remaining contribution after cancellation or expiry.
    /// Before settlement the whole pool is unspent, so the pro-rata refund equals the contribution exactly.
    pub fn refund(env: Env, id: u64, sponsor: Address) -> Result<i128, EscrowError> {
        sponsor.require_auth();
        let mut w = wave(&env, id)?;
        if w.phase != Phase::Cancelled {
            cancel_expired(&env, id, &mut w)?;
        }
        let key = Key::Sponsor(id, sponsor.clone());
        let value = amount(&env, &key);
        if value == 0 {
            return Err(EscrowError::NothingToClaim);
        }
        env.storage().persistent().set(&key, &0_i128);
        w.refunded += value;
        save(&env, id, &w);
        pay(&env, &env.current_contract_address(), &sponsor, value)?;
        env.events().publish(
            (symbol_short!("refunded"), id, sponsor),
            (value, w.refunded),
        );
        Ok(value)
    }

    /// Read the canonical lifecycle and accounting state for a wave.
    pub fn get_wave(env: Env, id: u64) -> Result<Wave, EscrowError> {
        wave(&env, id)
    }
    /// Read the outstanding recipient allocation without iterating over a recipient list.
    pub fn allocation(env: Env, id: u64, recipient: Address) -> i128 {
        amount(&env, &Key::Allocation(id, recipient))
    }
    /// Read the sponsor's currently recorded contribution/refund entitlement.
    pub fn contribution(env: Env, id: u64, sponsor: Address) -> i128 {
        amount(&env, &Key::Sponsor(id, sponsor))
    }
    /// Read the fixed asset binding so clients can create the correct trustline.
    pub fn token(env: Env) -> Address {
        env.storage().instance().get(&Key::Token).unwrap()
    }
}

#[cfg(test)]
mod test;
