# Anchor Framework

## TLDR

Anchor is the dominant Solana development framework. It provides macros that generate boilerplate, enforce security constraints, and handle serialization. Think of it as "Rails for Solana" - convention over configuration, with guardrails that prevent common mistakes.

## Core Concepts

### Anchor Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Anchor Program                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  #[program]                                             │
│  └── mod my_program {                                  │
│      └── pub fn instruction(ctx, args) -> Result<()>   │
│                                                         │
│  #[derive(Accounts)]                                    │
│  └── pub struct MyContext<'info> {                     │
│      └── account constraints here                      │
│                                                         │
│  #[account]                                             │
│  └── pub struct MyAccount {                            │
│      └── data fields here                              │
│                                                         │
│  #[error_code]                                          │
│  └── pub enum MyError {                                │
│      └── custom errors here                            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### The Derive(Accounts) Pattern

This is where the magic happens - constraints are checked BEFORE your code runs:

```rust
#[derive(Accounts)]
pub struct CreateUser<'info> {
    // init: Creates account with space, sets owner to this program
    // payer: Who pays for rent
    // space: How many bytes to allocate
    #[account(
        init,
        payer = authority,
        space = 8 + User::LEN,
    )]
    pub user: Account<'info, User>,
    
    // mut: Account will be modified (required for writes)
    // Signer: Must have signed the transaction
    #[account(mut)]
    pub authority: Signer<'info>,
    
    // Program accounts for CPIs
    pub system_program: Program<'info, System>,
}
```

### Account Types

| Type | Purpose | Validates |
|------|---------|-----------|
| `Account<'info, T>` | Your program's accounts | Discriminator + owner |
| `Signer<'info>` | Must sign transaction | Signature check |
| `Program<'info, T>` | Other programs | Executable + ID |
| `SystemAccount<'info>` | SOL wallets | Owner = System |
| `UncheckedAccount<'info>` | Any account | Nothing (⚠️ dangerous) |
| `AccountLoader<'info, T>` | Zero-copy accounts | Discriminator + owner |

## Code Examples

### Complete Program Structure

```rust
use anchor_lang::prelude::*;

declare_id!("YourProgramId111111111111111111111111111111");

#[program]
pub mod my_program {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, data: u64) -> Result<()> {
        let account = &mut ctx.accounts.my_account;
        account.data = data;
        account.authority = ctx.accounts.authority.key();
        account.bump = ctx.bumps.my_account;
        Ok(())
    }

    pub fn update(ctx: Context<Update>, new_data: u64) -> Result<()> {
        ctx.accounts.my_account.data = new_data;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + MyAccount::LEN,
        seeds = [b"my_account", authority.key().as_ref()],
        bump,
    )]
    pub my_account: Account<'info, MyAccount>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Update<'info> {
    #[account(
        mut,
        seeds = [b"my_account", authority.key().as_ref()],
        bump = my_account.bump,
        has_one = authority,
    )]
    pub my_account: Account<'info, MyAccount>,
    
    pub authority: Signer<'info>,
}

#[account]
pub struct MyAccount {
    pub data: u64,
    pub authority: Pubkey,
    pub bump: u8,
}

impl MyAccount {
    pub const LEN: usize = 8 + 32 + 1;
}

#[error_code]
pub enum MyError {
    #[msg("Data exceeds maximum allowed")]
    DataTooLarge,
    #[msg("Unauthorized access")]
    Unauthorized,
}
```

### Common Constraints Reference

```rust
#[derive(Accounts)]
pub struct ConstraintsExample<'info> {
    // === Initialization ===
    #[account(init, payer = user, space = 100)]
    pub new_account: Account<'info, Data>,
    
    #[account(init_if_needed, payer = user, space = 100)]
    pub maybe_new: Account<'info, Data>,

    // === PDA Constraints ===
    #[account(
        seeds = [b"prefix", user.key().as_ref()],
        bump,  // Find bump
    )]
    pub pda: Account<'info, Data>,
    
    #[account(
        seeds = [b"prefix", user.key().as_ref()],
        bump = pda.bump,  // Use stored bump (faster)
    )]
    pub pda_with_stored_bump: Account<'info, Data>,

    // === Ownership & Authority ===
    #[account(has_one = authority)]  // account.authority == authority.key()
    pub owned: Account<'info, Data>,
    
    #[account(
        has_one = authority @ MyError::WrongAuthority
    )]
    pub owned_custom_error: Account<'info, Data>,

    // === Custom Constraints ===
    #[account(constraint = data.value > 0)]
    pub positive_only: Account<'info, Data>,
    
    #[account(
        constraint = data.value > 0 @ MyError::MustBePositive
    )]
    pub positive_custom_error: Account<'info, Data>,

    // === Reallocation ===
    #[account(
        mut,
        realloc = 200,
        realloc::payer = user,
        realloc::zero = false,
    )]
    pub growing_account: Account<'info, Data>,

    // === Closing Accounts ===
    #[account(mut, close = user)]  // Send lamports to user
    pub closing: Account<'info, Data>,

    // === Token Constraints ===
    #[account(
        token::mint = mint,
        token::authority = user,
    )]
    pub token_account: Account<'info, TokenAccount>,
    
    #[account(
        associated_token::mint = mint,
        associated_token::authority = user,
    )]
    pub ata: Account<'info, TokenAccount>,

    // === Required Accounts ===
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}
```

### Events

```rust
use anchor_lang::prelude::*;

#[event]
pub struct TransferEvent {
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

pub fn transfer(ctx: Context<Transfer>, amount: u64) -> Result<()> {
    // ... do transfer ...
    
    emit!(TransferEvent {
        from: ctx.accounts.from.key(),
        to: ctx.accounts.to.key(),
        amount,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}
```

### Access Control Pattern

```rust
use anchor_lang::prelude::*;

#[account]
pub struct Config {
    pub admin: Pubkey,
    pub paused: bool,
}

// Reusable access control
fn only_admin(config: &Config, signer: &Pubkey) -> Result<()> {
    require!(config.admin == *signer, MyError::Unauthorized);
    Ok(())
}

fn not_paused(config: &Config) -> Result<()> {
    require!(!config.paused, MyError::Paused);
    Ok(())
}

pub fn admin_action(ctx: Context<AdminAction>) -> Result<()> {
    only_admin(&ctx.accounts.config, &ctx.accounts.admin.key())?;
    not_paused(&ctx.accounts.config)?;
    
    // ... do admin stuff ...
    Ok(())
}
```

## Common Mistakes

### ❌ Missing `mut` for Modified Accounts

```rust
// WRONG: Can't modify without mut
#[account]
pub user: Account<'info, User>,  // ❌

// RIGHT
#[account(mut)]
pub user: Account<'info, User>,  // ✅
```

### ❌ Using `init` Without `space`

```rust
// WRONG
#[account(init, payer = user)]  // ❌ How much space?

// RIGHT
#[account(init, payer = user, space = 8 + 32 + 8)]  // ✅
```

### ❌ Forgetting `has_one` for Authorization

```rust
// WRONG: Anyone can call this!
#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub vault: Account<'info, Vault>,  // ❌ No authority check
    pub user: Signer<'info>,
}

// RIGHT: Verify caller is authorized
#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut, has_one = authority)]
    pub vault: Account<'info, Vault>,  // ✅ Checks vault.authority == authority
    pub authority: Signer<'info>,
}
```

### ❌ Hardcoding Bump Instead of Storing It

```rust
// WRONG: Recalculates bump every time
#[account(
    seeds = [b"vault", user.key().as_ref()],
    bump,  // ❌ Expensive find_program_address on every call
)]

// RIGHT: Store and reuse
#[account]
pub struct Vault {
    pub bump: u8,  // Store once
}

#[account(
    seeds = [b"vault", user.key().as_ref()],
    bump = vault.bump,  // ✅ Direct lookup
)]
```

### ❌ UncheckedAccount Without Validation

```rust
// WRONG: No validation!
/// CHECK: This is fine
pub random_account: UncheckedAccount<'info>,  // ❌ Actually not fine

// RIGHT: Document why it's safe
/// CHECK: This account is only used as a destination for SOL transfer
/// and doesn't need to exist beforehand. We verify the amount is > 0.
pub recipient: UncheckedAccount<'info>,  // ✅ Explained
```

## Error Handling

```rust
#[error_code]
pub enum MyError {
    #[msg("The provided value is too large")]
    ValueTooLarge,
    
    #[msg("Unauthorized: signer is not the authority")]
    Unauthorized,
    
    #[msg("Arithmetic overflow")]
    Overflow,
}

// Using errors
pub fn validate(ctx: Context<Validate>, value: u64) -> Result<()> {
    require!(value <= 1000, MyError::ValueTooLarge);
    require_keys_eq!(ctx.accounts.user.key(), ctx.accounts.config.authority, MyError::Unauthorized);
    
    let result = value.checked_add(100).ok_or(MyError::Overflow)?;
    
    Ok(())
}
```

## Related Challenges

- **[00-hello-solana](../challenges/00-hello-solana.md)** - Anchor basics
- All challenges use Anchor patterns

## Key Takeaways

1. **Constraints run first** - Before your code executes
2. **Store bumps** - Avoid recalculating PDAs
3. **Use `has_one`** - For simple ownership checks
4. **Always `mut` for writes** - Anchor enforces this
5. **Document `UncheckedAccount`** - Explain why it's safe
6. **Emit events** - For indexing and monitoring
7. **Custom errors** - Make debugging easier
