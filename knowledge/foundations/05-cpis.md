# Cross-Program Invocations (CPIs)

## TLDR

CPIs let your program call other programs - essential for composability. Your escrow can transfer tokens, your game can mint NFTs, your DAO can execute governance. But CPIs have rules: signer privileges pass through, account ownership is enforced, and there's a 4-level depth limit.

## Core Concepts

### What is a CPI?

```
┌─────────────────────────────────────────────────────────┐
│                Cross-Program Invocation                 │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  User → Your Program → Token Program → (returns)       │
│                  │                                      │
│                  CPI                                    │
│                                                         │
│  Your program "invokes" the Token Program              │
│  Token Program sees your program as the "caller"       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### invoke vs invoke_signed

| Function | When to Use | Signer |
|----------|-------------|--------|
| `invoke` | User is signer | User's signature passes through |
| `invoke_signed` | PDA is signer | Program provides PDA seeds |

```rust
// invoke: User signed the transaction, their signature passes through
invoke(
    &instruction,
    &[user_account.clone(), other_accounts...],
)?;

// invoke_signed: PDA needs to "sign" - provide seeds
invoke_signed(
    &instruction,
    &[pda_account.clone(), other_accounts...],
    &[&[b"vault", user.key.as_ref(), &[bump]]],  // Seeds for PDA signer
)?;
```

### Signer Privileges

When you do a CPI, signer privileges pass through:

```
Original Transaction:
  Signers: [User]
  
Your Program receives:
  User: is_signer = true ✅
  
CPI to Token Program:
  User: is_signer = true ✅  (privilege passed through!)
```

But you can't CREATE new signers - only pass existing ones or use PDAs:

```rust
// ❌ WRONG: Can't make random account a signer
let fake_signer = AccountInfo { is_signer: true, ... };  // Won't work

// ✅ RIGHT: Pass existing signer or use PDA
invoke(&ix, &[existing_signer.clone()])?;  // User already signed tx
invoke_signed(&ix, &[pda.clone()], &[seeds])?;  // PDA signs via program
```

## Code Examples

### Basic CPI (Token Transfer)

```rust
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

pub fn transfer_tokens(ctx: Context<TransferTokens>, amount: u64) -> Result<()> {
    // Build CPI accounts
    let cpi_accounts = Transfer {
        from: ctx.accounts.from.to_account_info(),
        to: ctx.accounts.to.to_account_info(),
        authority: ctx.accounts.authority.to_account_info(),
    };
    
    // CPI context (no signer seeds - user signed the tx)
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
    );
    
    // Execute CPI
    token::transfer(cpi_ctx, amount)?;
    
    Ok(())
}

#[derive(Accounts)]
pub struct TransferTokens<'info> {
    #[account(mut)]
    pub from: Account<'info, TokenAccount>,
    #[account(mut)]
    pub to: Account<'info, TokenAccount>,
    pub authority: Signer<'info>,  // User signed tx
    pub token_program: Program<'info, Token>,
}
```

### CPI with PDA Signer

```rust
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

pub fn vault_withdraw(ctx: Context<VaultWithdraw>, amount: u64) -> Result<()> {
    let authority = ctx.accounts.authority.key();
    let bump = ctx.accounts.vault.bump;
    
    // PDA seeds for signing
    let seeds = &[
        b"vault".as_ref(),
        authority.as_ref(),
        &[bump],
    ];
    let signer_seeds = &[&seeds[..]];
    
    // CPI accounts
    let cpi_accounts = Transfer {
        from: ctx.accounts.vault_token_account.to_account_info(),
        to: ctx.accounts.user_token_account.to_account_info(),
        authority: ctx.accounts.vault.to_account_info(),  // PDA is authority
    };
    
    // CPI context WITH signer seeds
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer_seeds,  // PDA "signs" via these seeds
    );
    
    token::transfer(cpi_ctx, amount)?;
    
    Ok(())
}

#[derive(Accounts)]
pub struct VaultWithdraw<'info> {
    #[account(
        mut,
        seeds = [b"vault", authority.key().as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,
    
    #[account(
        mut,
        token::authority = vault,  // Vault PDA owns this token account
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}
```

### Raw CPI (Non-Anchor Programs)

```rust
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    program::invoke_signed,
    instruction::{AccountMeta, Instruction},
};

pub fn call_other_program(ctx: Context<CallOther>) -> Result<()> {
    // Build instruction manually
    let ix = Instruction {
        program_id: ctx.accounts.other_program.key(),
        accounts: vec![
            AccountMeta::new(ctx.accounts.target.key(), false),
            AccountMeta::new_readonly(ctx.accounts.authority.key(), true),
        ],
        data: vec![1, 2, 3],  // Your instruction data
    };
    
    // Invoke
    invoke_signed(
        &ix,
        &[
            ctx.accounts.target.to_account_info(),
            ctx.accounts.authority.to_account_info(),
        ],
        &[],  // No PDA signers needed
    )?;
    
    Ok(())
}
```

### CPI to System Program (Create Account)

```rust
use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, CreateAccount};

pub fn create_raw_account(ctx: Context<CreateRaw>, space: u64) -> Result<()> {
    let rent = Rent::get()?;
    let lamports = rent.minimum_balance(space as usize);
    
    let cpi_accounts = CreateAccount {
        from: ctx.accounts.payer.to_account_info(),
        to: ctx.accounts.new_account.to_account_info(),
    };
    
    let cpi_ctx = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        cpi_accounts,
    );
    
    system_program::create_account(
        cpi_ctx,
        lamports,
        space,
        &ctx.accounts.owner_program.key(),  // Who will own this account
    )?;
    
    Ok(())
}
```

## Common Mistakes

### ❌ Forgetting Signer Seeds

```rust
// WRONG: Using new() when PDA needs to sign
let cpi_ctx = CpiContext::new(program, accounts);  // ❌ No signer!

// RIGHT: Use new_with_signer() for PDA
let cpi_ctx = CpiContext::new_with_signer(program, accounts, signer_seeds);  // ✅
```

### ❌ Wrong Seed Order in invoke_signed

```rust
// WRONG: Seeds in wrong order
let seeds = &[&[bump][..], user.as_ref(), b"vault".as_ref()];  // ❌

// RIGHT: Same order as PDA derivation
let seeds = &[b"vault".as_ref(), user.as_ref(), &[bump]];  // ✅
```

### ❌ Missing bump in Seeds

```rust
// WRONG: Forgot the bump byte
let seeds = &[b"vault", user.as_ref()];  // ❌ Not a complete signer

// RIGHT: Include bump
let seeds = &[b"vault", user.as_ref(), &[bump]];  // ✅
```

### ❌ Exceeding CPI Depth

```rust
// CPIs can only go 4 levels deep
// A → B → C → D → E  ❌ (5 levels)
// A → B → C → D  ✅ (4 levels)

// If you hit this, restructure your program logic
```

### ❌ Not Passing All Required Accounts

```rust
// WRONG: Missing accounts in CPI
invoke(&ix, &[account1.clone()])?;  // ❌ Missing accounts

// RIGHT: Pass all accounts the target program needs
invoke(&ix, &[account1.clone(), account2.clone(), account3.clone()])?;  // ✅
```

## CPI Security Considerations

### Validate Return Data

```rust
// After CPI, the called program might have modified accounts
// Re-validate any assumptions

pub fn swap_and_check(ctx: Context<Swap>, min_out: u64) -> Result<()> {
    // Do the swap CPI
    do_swap_cpi(...)?;
    
    // Reload and verify
    ctx.accounts.user_token_out.reload()?;
    let received = ctx.accounts.user_token_out.amount;
    
    require!(received >= min_out, MyError::SlippageExceeded);
    
    Ok(())
}
```

### Check Program IDs

```rust
// Always verify you're calling the right program
#[derive(Accounts)]
pub struct SafeCpi<'info> {
    /// CHECK: Validated in constraint
    #[account(
        constraint = token_program.key() == spl_token::ID @ MyError::InvalidProgram
    )]
    pub token_program: AccountInfo<'info>,
}
```

## Related Challenges

- **[03-pda-escrow](../challenges/03-pda-escrow.md)** - Escrow with token CPIs
- **[04-staking-program](../challenges/04-staking-program.md)** - Staking with CPIs
- **[08-amm-swap](../challenges/08-amm-swap.md)** - Complex multi-CPI flow

## Key Takeaways

1. **invoke vs invoke_signed** - Use `invoke_signed` when PDA needs to sign
2. **Signer privileges pass through** - Existing signers stay signers
3. **Seeds must match exactly** - Same order, same values, include bump
4. **4-level depth limit** - Restructure if you hit it
5. **Validate after CPI** - The world might have changed
6. **Check program IDs** - Verify you're calling the right program
