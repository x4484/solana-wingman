# Challenge 4: Staking Program

## TLDR

Build a token staking vault where users deposit tokens and earn rewards over time. Learn time-based calculations, reward distribution, and the Clock sysvar.

## Core Concepts

### What You're Building

A staking program where:
1. Users deposit tokens into a staking vault
2. Rewards accrue based on time staked
3. Users can claim rewards anytime
4. Users can unstake to withdraw principal + rewards

### The Staking Model

```
┌──────────────────────────────────────────────────────────┐
│                    STAKING POOL (PDA)                     │
│  seeds = ["pool", mint.key()]                            │
├──────────────────────────────────────────────────────────┤
│  authority: Pubkey       │  Pool admin                   │
│  staking_mint: Pubkey    │  Token being staked           │
│  reward_mint: Pubkey     │  Token given as rewards       │
│  reward_rate: u64        │  Rewards per second per token │
│  total_staked: u64       │  Total tokens in pool         │
│  bump: u8                │  PDA bump                     │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                    USER STAKE (PDA)                       │
│  seeds = ["stake", pool.key(), user.key()]               │
├──────────────────────────────────────────────────────────┤
│  owner: Pubkey           │  User's wallet                │
│  pool: Pubkey            │  Which pool                   │
│  amount: u64             │  Amount staked                │
│  last_claim: i64         │  Timestamp of last claim      │
│  bump: u8                │  PDA bump                     │
└──────────────────────────────────────────────────────────┘
```

### Reward Calculation

```
Rewards = staked_amount × reward_rate × time_elapsed

Example:
- Staked: 1000 tokens
- Reward rate: 0.0001 tokens/second/staked token (≈ 8.64 tokens/day)
- Time elapsed: 86400 seconds (1 day)
- Rewards = 1000 × 0.0001 × 86400 = 8,640 tokens

In smallest units (with 9 decimals):
- Reward rate: 100_000 (0.0001 × 10^9)
- Calculation uses fixed-point math to avoid overflow
```

## Code Walkthrough

### 1. The Staking Program

```rust
use anchor_lang::prelude::*;
use anchor_spl::{
    token::{Mint, Token, TokenAccount, Transfer, MintTo},
    associated_token::AssociatedToken,
};

declare_id!("YOUR_PROGRAM_ID");

// Reward rate: tokens per second per staked token (scaled by 10^9)
// Example: 100_000 = 0.0001 tokens/second = ~8.64 tokens/day per staked token
const DEFAULT_REWARD_RATE: u64 = 100_000;

#[program]
pub mod staking {
    use super::*;

    /// Initialize a new staking pool
    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        reward_rate: u64,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.authority = ctx.accounts.authority.key();
        pool.staking_mint = ctx.accounts.staking_mint.key();
        pool.reward_mint = ctx.accounts.reward_mint.key();
        pool.reward_rate = reward_rate;
        pool.total_staked = 0;
        pool.bump = ctx.bumps.pool;
        pool.vault_bump = ctx.bumps.vault;

        msg!("Staking pool initialized with rate: {}", reward_rate);
        Ok(())
    }

    /// User stakes tokens
    pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
        require!(amount > 0, StakingError::ZeroAmount);

        let clock = Clock::get()?;
        let user_stake = &mut ctx.accounts.user_stake;
        let pool = &mut ctx.accounts.pool;

        // If user already has a stake, claim pending rewards first
        if user_stake.amount > 0 {
            let rewards = calculate_rewards(
                user_stake.amount,
                pool.reward_rate,
                user_stake.last_claim,
                clock.unix_timestamp,
            )?;

            if rewards > 0 {
                // Mint rewards to user
                mint_rewards(
                    &ctx.accounts.reward_mint,
                    &ctx.accounts.user_reward_ata,
                    &ctx.accounts.pool,
                    &ctx.accounts.token_program,
                    pool.bump,
                    rewards,
                )?;
            }
        }

        // Transfer staking tokens from user to vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_staking_ata.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
        );
        anchor_spl::token::transfer(cpi_ctx, amount)?;

        // Update state
        user_stake.owner = ctx.accounts.user.key();
        user_stake.pool = pool.key();
        user_stake.amount = user_stake.amount.checked_add(amount).unwrap();
        user_stake.last_claim = clock.unix_timestamp;
        user_stake.bump = ctx.bumps.user_stake;

        pool.total_staked = pool.total_staked.checked_add(amount).unwrap();

        msg!("Staked {} tokens. Total stake: {}", amount, user_stake.amount);
        Ok(())
    }

    /// Claim pending rewards without unstaking
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        let clock = Clock::get()?;
        let user_stake = &mut ctx.accounts.user_stake;
        let pool = &ctx.accounts.pool;

        require!(user_stake.amount > 0, StakingError::NoStake);

        let rewards = calculate_rewards(
            user_stake.amount,
            pool.reward_rate,
            user_stake.last_claim,
            clock.unix_timestamp,
        )?;

        require!(rewards > 0, StakingError::NoRewards);

        // Mint rewards to user
        mint_rewards(
            &ctx.accounts.reward_mint,
            &ctx.accounts.user_reward_ata,
            &ctx.accounts.pool,
            &ctx.accounts.token_program,
            pool.bump,
            rewards,
        )?;

        // Update last claim time
        user_stake.last_claim = clock.unix_timestamp;

        msg!("Claimed {} reward tokens", rewards);
        Ok(())
    }

    /// Unstake tokens and claim all rewards
    pub fn unstake(ctx: Context<Unstake>, amount: u64) -> Result<()> {
        let clock = Clock::get()?;
        let user_stake = &mut ctx.accounts.user_stake;
        let pool = &mut ctx.accounts.pool;

        require!(amount > 0, StakingError::ZeroAmount);
        require!(user_stake.amount >= amount, StakingError::InsufficientStake);

        // Calculate and mint pending rewards
        let rewards = calculate_rewards(
            user_stake.amount,
            pool.reward_rate,
            user_stake.last_claim,
            clock.unix_timestamp,
        )?;

        if rewards > 0 {
            mint_rewards(
                &ctx.accounts.reward_mint,
                &ctx.accounts.user_reward_ata,
                &ctx.accounts.pool,
                &ctx.accounts.token_program,
                pool.bump,
                rewards,
            )?;
        }

        // Transfer staked tokens back to user
        let staking_mint_key = ctx.accounts.staking_mint.key();
        let seeds = &[
            b"pool",
            staking_mint_key.as_ref(),
            &[pool.bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.user_staking_ata.to_account_info(),
            authority: ctx.accounts.pool.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );
        anchor_spl::token::transfer(cpi_ctx, amount)?;

        // Update state
        user_stake.amount = user_stake.amount.checked_sub(amount).unwrap();
        user_stake.last_claim = clock.unix_timestamp;
        pool.total_staked = pool.total_staked.checked_sub(amount).unwrap();

        msg!("Unstaked {} tokens. Remaining: {}", amount, user_stake.amount);
        Ok(())
    }
}

/// Calculate rewards based on time elapsed
fn calculate_rewards(
    staked_amount: u64,
    reward_rate: u64,
    last_claim: i64,
    current_time: i64,
) -> Result<u64> {
    let time_elapsed = current_time
        .checked_sub(last_claim)
        .ok_or(StakingError::InvalidTimestamp)?;

    if time_elapsed <= 0 {
        return Ok(0);
    }

    // rewards = staked_amount * reward_rate * time_elapsed / 10^9
    // Using u128 to prevent overflow
    let rewards = (staked_amount as u128)
        .checked_mul(reward_rate as u128)
        .ok_or(StakingError::MathOverflow)?
        .checked_mul(time_elapsed as u128)
        .ok_or(StakingError::MathOverflow)?
        .checked_div(1_000_000_000)
        .ok_or(StakingError::MathOverflow)?;

    Ok(rewards as u64)
}

/// Mint rewards using pool PDA as authority
fn mint_rewards<'info>(
    reward_mint: &Account<'info, Mint>,
    user_reward_ata: &Account<'info, TokenAccount>,
    pool: &Account<'info, StakingPool>,
    token_program: &Program<'info, Token>,
    pool_bump: u8,
    amount: u64,
) -> Result<()> {
    let staking_mint_key = pool.staking_mint;
    let seeds = &[
        b"pool",
        staking_mint_key.as_ref(),
        &[pool_bump],
    ];
    let signer_seeds = &[&seeds[..]];

    let cpi_accounts = MintTo {
        mint: reward_mint.to_account_info(),
        to: user_reward_ata.to_account_info(),
        authority: pool.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        token_program.to_account_info(),
        cpi_accounts,
        signer_seeds,
    );
    anchor_spl::token::mint_to(cpi_ctx, amount)?;

    Ok(())
}

// ============ ACCOUNTS ============

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + StakingPool::INIT_SPACE,
        seeds = [b"pool", staking_mint.key().as_ref()],
        bump
    )]
    pub pool: Account<'info, StakingPool>,

    #[account(
        init,
        payer = authority,
        seeds = [b"vault", pool.key().as_ref()],
        bump,
        token::mint = staking_mint,
        token::authority = pool,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub staking_mint: Account<'info, Mint>,
    
    #[account(
        mut,
        constraint = reward_mint.mint_authority.unwrap() == pool.key() 
            @ StakingError::InvalidMintAuthority
    )]
    pub reward_mint: Account<'info, Mint>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(
        mut,
        seeds = [b"pool", staking_mint.key().as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, StakingPool>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + UserStake::INIT_SPACE,
        seeds = [b"stake", pool.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub user_stake: Account<'info, UserStake>,

    #[account(
        mut,
        seeds = [b"vault", pool.key().as_ref()],
        bump = pool.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub staking_mint: Account<'info, Mint>,
    
    #[account(mut)]
    pub reward_mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = staking_mint,
        associated_token::authority = user,
    )]
    pub user_staking_ata: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = reward_mint,
        associated_token::authority = user,
    )]
    pub user_reward_ata: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(
        seeds = [b"pool", pool.staking_mint.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, StakingPool>,

    #[account(
        mut,
        seeds = [b"stake", pool.key().as_ref(), user.key().as_ref()],
        bump = user_stake.bump,
        has_one = owner @ StakingError::InvalidOwner,
    )]
    pub user_stake: Account<'info, UserStake>,

    #[account(mut)]
    pub reward_mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = reward_mint,
        associated_token::authority = user,
    )]
    pub user_reward_ata: Account<'info, TokenAccount>,

    /// CHECK: Verified via user_stake.owner
    pub owner: AccountInfo<'info>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Unstake<'info> {
    #[account(
        mut,
        seeds = [b"pool", staking_mint.key().as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, StakingPool>,

    #[account(
        mut,
        seeds = [b"stake", pool.key().as_ref(), user.key().as_ref()],
        bump = user_stake.bump,
        has_one = owner @ StakingError::InvalidOwner,
    )]
    pub user_stake: Account<'info, UserStake>,

    #[account(
        mut,
        seeds = [b"vault", pool.key().as_ref()],
        bump = pool.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub staking_mint: Account<'info, Mint>,
    
    #[account(mut)]
    pub reward_mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = staking_mint,
        associated_token::authority = user,
    )]
    pub user_staking_ata: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = reward_mint,
        associated_token::authority = user,
    )]
    pub user_reward_ata: Account<'info, TokenAccount>,

    /// CHECK: Verified via user_stake.owner
    pub owner: AccountInfo<'info>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

// ============ STATE ============

#[account]
#[derive(InitSpace)]
pub struct StakingPool {
    pub authority: Pubkey,
    pub staking_mint: Pubkey,
    pub reward_mint: Pubkey,
    pub reward_rate: u64,
    pub total_staked: u64,
    pub bump: u8,
    pub vault_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct UserStake {
    pub owner: Pubkey,
    pub pool: Pubkey,
    pub amount: u64,
    pub last_claim: i64,
    pub bump: u8,
}

// ============ ERRORS ============

#[error_code]
pub enum StakingError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Insufficient staked balance")]
    InsufficientStake,
    #[msg("No stake found")]
    NoStake,
    #[msg("No rewards to claim")]
    NoRewards,
    #[msg("Invalid timestamp")]
    InvalidTimestamp,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Invalid owner")]
    InvalidOwner,
    #[msg("Pool must be mint authority for reward token")]
    InvalidMintAuthority,
}
```

### 2. Using the Clock Sysvar

```rust
use anchor_lang::solana_program::clock::Clock;

let clock = Clock::get()?;

// Available fields:
clock.slot              // Current slot (u64)
clock.epoch_start_timestamp  // When epoch started (i64)
clock.epoch             // Current epoch (u64)
clock.leader_schedule_epoch  // Next leader schedule epoch
clock.unix_timestamp    // Current Unix timestamp (i64) ← Most useful!
```

**Important:** `unix_timestamp` is set by validators. It's accurate to ~1-2 seconds but not millisecond-precise.

### 3. Fixed-Point Math

Solana doesn't have floating point. Use fixed-point arithmetic:

```rust
// Instead of: reward_rate = 0.0001 (float)
// Use: reward_rate = 100_000 (scaled by 10^9)

// Calculation:
// rewards = amount * rate * time / SCALE
let rewards = (amount as u128)
    .checked_mul(rate as u128)?
    .checked_mul(time as u128)?
    .checked_div(1_000_000_000)?;  // Divide by scale factor
```

**Always use `checked_*` operations to prevent overflow!**

## Security Considerations

1. **Overflow Protection**: Use `checked_add`, `checked_sub`, `checked_mul`
2. **Reward Minting**: Pool PDA must be mint authority for rewards
3. **User Verification**: `has_one` constraint ensures correct owner
4. **Time Manipulation**: Validators control timestamps - keep grace periods
5. **Reentrancy**: Claim rewards BEFORE updating state

## Common Gotchas

### 1. Using Block Number Instead of Timestamp
```rust
// ❌ Wrong: Solana doesn't have block.number like Ethereum
let elapsed = current_block - last_block;

// ✅ Correct: Use Clock sysvar
let clock = Clock::get()?;
let elapsed = clock.unix_timestamp - last_claim;
```

### 2. Integer Overflow
```rust
// ❌ Wrong: can overflow
let rewards = amount * rate * time;

// ✅ Correct: use u128 and checked math
let rewards = (amount as u128)
    .checked_mul(rate as u128)?
    .checked_mul(time as u128)?;
```

### 3. Forgetting to Update last_claim
```rust
// ❌ Wrong: user can claim infinite rewards
fn claim() {
    mint_rewards(calculated_rewards);
    // Forgot to update last_claim!
}

// ✅ Correct: always update timestamp
fn claim() {
    mint_rewards(calculated_rewards);
    user_stake.last_claim = clock.unix_timestamp;
}
```

### 4. Reward Token Without Pool Authority
```rust
// ❌ Wrong: pool can't mint rewards
// reward_mint has some other authority

// ✅ Correct: pool PDA is mint authority
#[account(
    constraint = reward_mint.mint_authority.unwrap() == pool.key()
)]
pub reward_mint: Account<'info, Mint>,
```

## What You've Learned

- [x] Time-based calculations with Clock sysvar
- [x] Fixed-point arithmetic in Rust
- [x] Staking pool architecture
- [x] Per-user stake tracking with PDAs
- [x] Reward minting via CPI
- [x] Checked math to prevent overflow

## Next Steps

**Challenge 5: Token-2022** - Explore modern token extensions!

## Builder Checklist

- [ ] Created staking pool PDA
- [ ] Implemented stake instruction
- [ ] Implemented claim instruction
- [ ] Implemented unstake instruction
- [ ] Used Clock sysvar for timestamps
- [ ] Used checked math everywhere
- [ ] Set pool as reward mint authority
- [ ] Tested full staking flow
- [ ] (Bonus) Added minimum stake amount
- [ ] (Bonus) Added lockup period
- [ ] (Bonus) Added APY calculation helper
