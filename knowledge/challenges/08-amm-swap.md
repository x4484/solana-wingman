# Challenge 8: AMM Swap

## TLDR

Build a constant product Automated Market Maker (AMM) like Uniswap/Raydium. Learn liquidity pools, the x*y=k formula, slippage, and swap mechanics.

## Core Concepts

### What You're Building

A decentralized exchange (DEX) that:
1. Creates liquidity pools for token pairs
2. Allows users to add/remove liquidity
3. Enables token swaps using constant product formula
4. Charges fees to liquidity providers

### The Constant Product Formula

```
x × y = k (constant)

Where:
- x = amount of Token A in pool
- y = amount of Token B in pool  
- k = constant product (invariant)

Example:
Pool has 1000 SOL and 150,000 USDC
k = 1000 × 150,000 = 150,000,000

To buy 10 SOL:
- New SOL in pool: 1000 - 10 = 990
- New USDC needed: k / 990 = 151,515.15
- Cost: 151,515.15 - 150,000 = 1,515.15 USDC
- Effective price: 151.51 USDC per SOL (vs spot 150)
- Slippage: ~1%
```

### AMM Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      POOL STATE (PDA)                    │
│  seeds = ["pool", token_a_mint, token_b_mint]           │
├─────────────────────────────────────────────────────────┤
│  token_a_mint: Pubkey     │  First token                │
│  token_b_mint: Pubkey     │  Second token               │
│  token_a_vault: Pubkey    │  Pool's Token A account     │
│  token_b_vault: Pubkey    │  Pool's Token B account     │
│  lp_mint: Pubkey          │  LP token mint              │
│  fee_bps: u16             │  Fee in basis points (30=0.3%)│
│  bump: u8                 │  PDA bump                   │
└─────────────────────────────────────────────────────────┘
           │
           ├──────────────────────────────────────┐
           ▼                                      ▼
┌─────────────────────┐              ┌─────────────────────┐
│   Token A Vault     │              │   Token B Vault     │
│   (PDA owned)       │              │   (PDA owned)       │
│   balance: 1000 SOL │              │   balance: 150k USDC│
└─────────────────────┘              └─────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────┐
│                      LP TOKEN MINT                       │
│  Represents share of pool liquidity                     │
│  Total supply = √(token_a × token_b) initially         │
└─────────────────────────────────────────────────────────┘
```

## Code Walkthrough

### 1. The AMM Program

```rust
use anchor_lang::prelude::*;
use anchor_spl::{
    token::{Mint, Token, TokenAccount, Transfer, MintTo, Burn},
    associated_token::AssociatedToken,
};

declare_id!("YOUR_PROGRAM_ID");

// Fee: 0.3% (30 basis points) - standard for most DEXs
const FEE_BPS: u16 = 30;
const BPS_DENOMINATOR: u64 = 10000;

#[program]
pub mod amm {
    use super::*;

    /// Initialize a new liquidity pool
    pub fn initialize_pool(ctx: Context<InitializePool>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        
        pool.token_a_mint = ctx.accounts.token_a_mint.key();
        pool.token_b_mint = ctx.accounts.token_b_mint.key();
        pool.token_a_vault = ctx.accounts.token_a_vault.key();
        pool.token_b_vault = ctx.accounts.token_b_vault.key();
        pool.lp_mint = ctx.accounts.lp_mint.key();
        pool.fee_bps = FEE_BPS;
        pool.bump = ctx.bumps.pool;

        msg!("Pool initialized for {}/{}", 
            ctx.accounts.token_a_mint.key(),
            ctx.accounts.token_b_mint.key()
        );
        Ok(())
    }

    /// Add liquidity to the pool
    pub fn add_liquidity(
        ctx: Context<AddLiquidity>,
        amount_a: u64,
        amount_b: u64,
        min_lp_tokens: u64,
    ) -> Result<()> {
        let pool = &ctx.accounts.pool;
        
        let vault_a_balance = ctx.accounts.token_a_vault.amount;
        let vault_b_balance = ctx.accounts.token_b_vault.amount;
        let lp_supply = ctx.accounts.lp_mint.supply;

        // Calculate LP tokens to mint
        let lp_tokens_to_mint = if lp_supply == 0 {
            // Initial liquidity: LP tokens = sqrt(amount_a * amount_b)
            integer_sqrt(amount_a.checked_mul(amount_b).unwrap())
        } else {
            // Subsequent: proportional to existing liquidity
            // LP tokens = min(amount_a/vault_a, amount_b/vault_b) * lp_supply
            let ratio_a = amount_a
                .checked_mul(lp_supply).unwrap()
                .checked_div(vault_a_balance).unwrap();
            let ratio_b = amount_b
                .checked_mul(lp_supply).unwrap()
                .checked_div(vault_b_balance).unwrap();
            ratio_a.min(ratio_b)
        };

        require!(lp_tokens_to_mint >= min_lp_tokens, AmmError::SlippageExceeded);

        // Transfer tokens from user to vaults
        transfer_tokens(
            &ctx.accounts.user_token_a,
            &ctx.accounts.token_a_vault,
            &ctx.accounts.user,
            &ctx.accounts.token_program,
            amount_a,
        )?;

        transfer_tokens(
            &ctx.accounts.user_token_b,
            &ctx.accounts.token_b_vault,
            &ctx.accounts.user,
            &ctx.accounts.token_program,
            amount_b,
        )?;

        // Mint LP tokens to user
        let seeds = &[
            b"pool",
            pool.token_a_mint.as_ref(),
            pool.token_b_mint.as_ref(),
            &[pool.bump],
        ];
        let signer_seeds = &[&seeds[..]];

        anchor_spl::token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.lp_mint.to_account_info(),
                    to: ctx.accounts.user_lp_token.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                signer_seeds,
            ),
            lp_tokens_to_mint,
        )?;

        msg!("Added liquidity: {} A, {} B, minted {} LP", 
            amount_a, amount_b, lp_tokens_to_mint);
        Ok(())
    }

    /// Remove liquidity from the pool
    pub fn remove_liquidity(
        ctx: Context<RemoveLiquidity>,
        lp_tokens: u64,
        min_amount_a: u64,
        min_amount_b: u64,
    ) -> Result<()> {
        let pool = &ctx.accounts.pool;
        
        let vault_a_balance = ctx.accounts.token_a_vault.amount;
        let vault_b_balance = ctx.accounts.token_b_vault.amount;
        let lp_supply = ctx.accounts.lp_mint.supply;

        // Calculate tokens to return
        let amount_a = lp_tokens
            .checked_mul(vault_a_balance).unwrap()
            .checked_div(lp_supply).unwrap();
        let amount_b = lp_tokens
            .checked_mul(vault_b_balance).unwrap()
            .checked_div(lp_supply).unwrap();

        require!(amount_a >= min_amount_a, AmmError::SlippageExceeded);
        require!(amount_b >= min_amount_b, AmmError::SlippageExceeded);

        // Burn LP tokens
        anchor_spl::token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.lp_mint.to_account_info(),
                    from: ctx.accounts.user_lp_token.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            lp_tokens,
        )?;

        // Transfer tokens from vaults to user
        let seeds = &[
            b"pool",
            pool.token_a_mint.as_ref(),
            pool.token_b_mint.as_ref(),
            &[pool.bump],
        ];
        let signer_seeds = &[&seeds[..]];

        anchor_spl::token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.token_a_vault.to_account_info(),
                    to: ctx.accounts.user_token_a.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                signer_seeds,
            ),
            amount_a,
        )?;

        anchor_spl::token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.token_b_vault.to_account_info(),
                    to: ctx.accounts.user_token_b.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                signer_seeds,
            ),
            amount_b,
        )?;

        msg!("Removed liquidity: {} LP -> {} A, {} B", 
            lp_tokens, amount_a, amount_b);
        Ok(())
    }

    /// Swap tokens
    pub fn swap(
        ctx: Context<Swap>,
        amount_in: u64,
        min_amount_out: u64,
        a_to_b: bool,  // true = swap A for B, false = swap B for A
    ) -> Result<()> {
        let pool = &ctx.accounts.pool;

        let (vault_in, vault_out, user_in, user_out) = if a_to_b {
            (
                &ctx.accounts.token_a_vault,
                &ctx.accounts.token_b_vault,
                &ctx.accounts.user_token_a,
                &ctx.accounts.user_token_b,
            )
        } else {
            (
                &ctx.accounts.token_b_vault,
                &ctx.accounts.token_a_vault,
                &ctx.accounts.user_token_b,
                &ctx.accounts.user_token_a,
            )
        };

        let reserve_in = vault_in.amount;
        let reserve_out = vault_out.amount;

        // Calculate amount out using constant product formula
        // amount_out = (reserve_out * amount_in_after_fee) / (reserve_in + amount_in_after_fee)
        let amount_in_after_fee = amount_in
            .checked_mul(BPS_DENOMINATOR - pool.fee_bps as u64).unwrap()
            .checked_div(BPS_DENOMINATOR).unwrap();

        let numerator = reserve_out
            .checked_mul(amount_in_after_fee).unwrap();
        let denominator = reserve_in
            .checked_add(amount_in_after_fee).unwrap();
        let amount_out = numerator.checked_div(denominator).unwrap();

        require!(amount_out >= min_amount_out, AmmError::SlippageExceeded);

        // Verify constant product is maintained (or increased due to fees)
        let k_before = (reserve_in as u128).checked_mul(reserve_out as u128).unwrap();
        let k_after = ((reserve_in + amount_in) as u128)
            .checked_mul((reserve_out - amount_out) as u128).unwrap();
        require!(k_after >= k_before, AmmError::InvariantViolated);

        // Execute swap
        // 1. Transfer tokens in from user
        anchor_spl::token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: user_in.to_account_info(),
                    to: vault_in.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount_in,
        )?;

        // 2. Transfer tokens out to user (PDA signs)
        let seeds = &[
            b"pool",
            pool.token_a_mint.as_ref(),
            pool.token_b_mint.as_ref(),
            &[pool.bump],
        ];
        let signer_seeds = &[&seeds[..]];

        anchor_spl::token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: vault_out.to_account_info(),
                    to: user_out.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                signer_seeds,
            ),
            amount_out,
        )?;

        msg!("Swapped {} in -> {} out (fee: {}bps)", 
            amount_in, amount_out, pool.fee_bps);
        Ok(())
    }
}

// ============ HELPER FUNCTIONS ============

fn transfer_tokens<'info>(
    from: &Account<'info, TokenAccount>,
    to: &Account<'info, TokenAccount>,
    authority: &Signer<'info>,
    token_program: &Program<'info, Token>,
    amount: u64,
) -> Result<()> {
    anchor_spl::token::transfer(
        CpiContext::new(
            token_program.to_account_info(),
            Transfer {
                from: from.to_account_info(),
                to: to.to_account_info(),
                authority: authority.to_account_info(),
            },
        ),
        amount,
    )
}

/// Integer square root using Newton's method
fn integer_sqrt(n: u64) -> u64 {
    if n == 0 {
        return 0;
    }
    let mut x = n;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}

// ============ ACCOUNTS ============

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + Pool::INIT_SPACE,
        seeds = [b"pool", token_a_mint.key().as_ref(), token_b_mint.key().as_ref()],
        bump
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        init,
        payer = payer,
        seeds = [b"vault_a", pool.key().as_ref()],
        bump,
        token::mint = token_a_mint,
        token::authority = pool,
    )]
    pub token_a_vault: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = payer,
        seeds = [b"vault_b", pool.key().as_ref()],
        bump,
        token::mint = token_b_mint,
        token::authority = pool,
    )]
    pub token_b_vault: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = payer,
        mint::decimals = 9,
        mint::authority = pool,
    )]
    pub lp_mint: Account<'info, Mint>,

    pub token_a_mint: Account<'info, Mint>,
    pub token_b_mint: Account<'info, Mint>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddLiquidity<'info> {
    #[account(
        mut,
        seeds = [b"pool", pool.token_a_mint.as_ref(), pool.token_b_mint.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    #[account(mut)]
    pub token_a_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub token_b_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub lp_mint: Account<'info, Mint>,

    #[account(mut)]
    pub user_token_a: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_token_b: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = lp_mint,
        associated_token::authority = user,
    )]
    pub user_lp_token: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RemoveLiquidity<'info> {
    #[account(
        mut,
        seeds = [b"pool", pool.token_a_mint.as_ref(), pool.token_b_mint.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    #[account(mut)]
    pub token_a_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub token_b_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub lp_mint: Account<'info, Mint>,

    #[account(mut)]
    pub user_token_a: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_token_b: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_lp_token: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(
        seeds = [b"pool", pool.token_a_mint.as_ref(), pool.token_b_mint.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    #[account(mut)]
    pub token_a_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub token_b_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_token_a: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_token_b: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

// ============ STATE ============

#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub token_a_mint: Pubkey,
    pub token_b_mint: Pubkey,
    pub token_a_vault: Pubkey,
    pub token_b_vault: Pubkey,
    pub lp_mint: Pubkey,
    pub fee_bps: u16,
    pub bump: u8,
}

// ============ ERRORS ============

#[error_code]
pub enum AmmError {
    #[msg("Slippage tolerance exceeded")]
    SlippageExceeded,
    #[msg("Constant product invariant violated")]
    InvariantViolated,
    #[msg("Insufficient liquidity")]
    InsufficientLiquidity,
}
```

### 2. Price Impact & Slippage

```rust
/// Calculate expected output and price impact
pub fn get_swap_quote(
    reserve_in: u64,
    reserve_out: u64,
    amount_in: u64,
    fee_bps: u16,
) -> (u64, f64) {
    // Amount out after fee
    let amount_in_after_fee = amount_in
        .checked_mul(BPS_DENOMINATOR - fee_bps as u64).unwrap()
        .checked_div(BPS_DENOMINATOR).unwrap();

    let amount_out = reserve_out
        .checked_mul(amount_in_after_fee).unwrap()
        .checked_div(reserve_in.checked_add(amount_in_after_fee).unwrap())
        .unwrap();

    // Calculate price impact
    let spot_price = reserve_out as f64 / reserve_in as f64;
    let execution_price = amount_out as f64 / amount_in as f64;
    let price_impact = ((spot_price - execution_price) / spot_price) * 100.0;

    (amount_out, price_impact)
}
```

### 3. Client-Side Integration

```typescript
import * as anchor from "@coral-xyz/anchor";

async function swap(
    program: Program,
    pool: PublicKey,
    userTokenA: PublicKey,
    userTokenB: PublicKey,
    amountIn: number,
    minAmountOut: number,
    aToB: boolean,
) {
    // Get pool data to fetch vaults
    const poolData = await program.account.pool.fetch(pool);
    
    await program.methods
        .swap(new anchor.BN(amountIn), new anchor.BN(minAmountOut), aToB)
        .accounts({
            pool,
            tokenAVault: poolData.tokenAVault,
            tokenBVault: poolData.tokenBVault,
            userTokenA,
            userTokenB,
            user: wallet.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
}

// Calculate minimum output with slippage tolerance
function calculateMinOutput(expectedOutput: number, slippageBps: number): number {
    return Math.floor(expectedOutput * (10000 - slippageBps) / 10000);
}
```

## Security Considerations

1. **Slippage Protection**: Always require `min_amount_out`
2. **Invariant Check**: Verify k doesn't decrease after swap
3. **Front-Running**: Consider implementing commit-reveal for large swaps
4. **Flash Loan Attacks**: Be careful with price oracles based on pool reserves
5. **Reentrancy**: Transfer tokens after state updates

## Common Gotchas

### 1. Integer Division Rounds Down
```rust
// ❌ Problem: user gets less than expected
let amount_out = (reserve_out * amount_in) / reserve_in;

// ✅ Solution: account for rounding in min_amount_out
// Or use more precise calculation with u128
```

### 2. Forgetting Fees in Quote
```rust
// ❌ Wrong: quote without fee
let amount_out = reserve_out * amount_in / (reserve_in + amount_in);

// ✅ Correct: apply fee first
let amount_in_after_fee = amount_in * (10000 - fee_bps) / 10000;
let amount_out = reserve_out * amount_in_after_fee / (reserve_in + amount_in_after_fee);
```

### 3. LP Token Initial Supply
```rust
// ❌ Wrong: LP tokens = amount_a + amount_b (not proportional!)

// ✅ Correct: LP tokens = sqrt(amount_a * amount_b)
// This makes LP value independent of token ratio
```

### 4. Not Checking Invariant
```rust
// ❌ Dangerous: assuming formula is correct
// k could decrease due to rounding errors

// ✅ Safe: always verify
require!(k_after >= k_before, AmmError::InvariantViolated);
```

## What You've Learned

- [x] Constant product formula (x*y=k)
- [x] Liquidity pool mechanics
- [x] Adding/removing liquidity
- [x] Swap execution with fees
- [x] Slippage protection
- [x] Price impact calculation
- [x] LP token minting/burning

## Next Steps

**Challenge 9: Blinks & Actions** - Make your swaps shareable!

## Builder Checklist

- [ ] Created liquidity pool
- [ ] Implemented add_liquidity
- [ ] Implemented remove_liquidity
- [ ] Implemented swap with fees
- [ ] Added slippage protection
- [ ] Verified constant product invariant
- [ ] Calculated price impact
- [ ] Tested full swap flow
- [ ] (Bonus) Multi-hop routing
- [ ] (Bonus) Concentrated liquidity
