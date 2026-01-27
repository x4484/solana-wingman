# The Solana Account Model

## TLDR

Everything on Solana is an account. Programs don't store data internally - they read from and write to accounts. Understanding accounts is the foundation for everything else in Solana development.

## Core Concepts

### Accounts Are Data Containers

Unlike Ethereum where contracts hold their own state, Solana separates **code** (programs) from **data** (accounts):

```
┌─────────────────┐     ┌─────────────────┐
│    Program      │     │    Account      │
│   (stateless)   │────▶│   (has data)    │
│                 │     │                 │
│  - Code only    │     │  - lamports     │
│  - Executable   │     │  - data[]       │
│  - Immutable*   │     │  - owner        │
└─────────────────┘     │  - executable   │
                        │  - rent_epoch   │
                        └─────────────────┘
```

### Account Structure

Every account has these fields:

| Field | Type | Description |
|-------|------|-------------|
| `lamports` | u64 | Balance in lamports (1 SOL = 1B lamports) |
| `data` | Vec<u8> | Raw bytes, interpreted by the owner program |
| `owner` | Pubkey | Program that controls this account |
| `executable` | bool | Is this account a program? |
| `rent_epoch` | u64 | Next epoch rent is due |

### The Owner Controls Everything

**Critical concept**: Only the **owner program** can modify an account's data.

```rust
// This will FAIL if your program doesn't own the account
account.data.borrow_mut()[0] = 42;  // ❌ CPI guard violation

// Only the owner can write
// If owner == your_program_id, you can write
```

### Account Types

```
┌─────────────────────────────────────────────────────────┐
│                    Account Types                        │
├─────────────────────────────────────────────────────────┤
│  System Accounts     │  Owned by System Program         │
│  (wallets)           │  Can transfer SOL                │
├──────────────────────┼──────────────────────────────────┤
│  Program Accounts    │  Executable = true               │
│  (deployed code)     │  Owned by BPF Loader             │
├──────────────────────┼──────────────────────────────────┤
│  Data Accounts       │  Owned by your program           │
│  (your state)        │  You control the data format     │
├──────────────────────┼──────────────────────────────────┤
│  PDAs                │  Derived addresses               │
│  (program-controlled)│  No private key exists           │
└──────────────────────┴──────────────────────────────────┘
```

## Code Examples

### Creating an Account (Anchor)

```rust
use anchor_lang::prelude::*;

#[account]
pub struct UserProfile {
    pub authority: Pubkey,    // 32 bytes
    pub username: String,     // 4 + len bytes
    pub score: u64,           // 8 bytes
    pub bump: u8,             // 1 byte
}

impl UserProfile {
    // Always calculate space explicitly
    pub const LEN: usize = 8    // Anchor discriminator
        + 32                     // authority
        + 4 + 32                 // username (max 32 chars)
        + 8                      // score
        + 1;                     // bump
}

#[derive(Accounts)]
pub struct CreateProfile<'info> {
    #[account(
        init,
        payer = user,
        space = UserProfile::LEN,
        seeds = [b"profile", user.key().as_ref()],
        bump
    )]
    pub profile: Account<'info, UserProfile>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}
```

### Reading Account Data

```rust
pub fn get_score(ctx: Context<ReadProfile>) -> Result<u64> {
    let profile = &ctx.accounts.profile;
    
    // Anchor deserializes automatically
    Ok(profile.score)
}

#[derive(Accounts)]
pub struct ReadProfile<'info> {
    pub profile: Account<'info, UserProfile>,
}
```

### Modifying Account Data

```rust
pub fn update_score(ctx: Context<UpdateProfile>, new_score: u64) -> Result<()> {
    let profile = &mut ctx.accounts.profile;
    
    // Only works because our program owns this account
    profile.score = new_score;
    
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateProfile<'info> {
    #[account(
        mut,
        seeds = [b"profile", authority.key().as_ref()],
        bump = profile.bump,
        has_one = authority  // Verify caller is the authority
    )]
    pub profile: Account<'info, UserProfile>,
    
    pub authority: Signer<'info>,
}
```

## Common Mistakes

### ❌ Forgetting the Anchor Discriminator

```rust
// WRONG: Forgot the 8-byte discriminator
pub const LEN: usize = 32 + 8 + 1;

// RIGHT: Include discriminator
pub const LEN: usize = 8 + 32 + 8 + 1;
```

### ❌ Not Marking Accounts as `mut`

```rust
// WRONG: Can't modify without mut
#[account]
pub profile: Account<'info, UserProfile>,

// RIGHT: Mark mutable accounts
#[account(mut)]
pub profile: Account<'info, UserProfile>,
```

### ❌ Assuming Account Ownership

```rust
// WRONG: Assuming you can write to any account
pub fn steal_funds(ctx: Context<Steal>) -> Result<()> {
    let victim = &mut ctx.accounts.victim_account;
    victim.balance = 0;  // ❌ Will fail if you don't own it
    Ok(())
}

// Solana enforces: only owner can modify data
```

### ❌ Hardcoding Space for Strings

```rust
// WRONG: Strings have variable length
pub struct Bad {
    pub name: String,  // How many bytes?
}

// RIGHT: Use fixed-size arrays or explicit max length
pub struct Good {
    pub name: [u8; 32],  // Fixed 32 bytes
}

// Or document max length
pub const MAX_NAME_LEN: usize = 32;
pub const LEN: usize = 8 + 4 + MAX_NAME_LEN;  // discriminator + string prefix + max chars
```

## Related Challenges

- **[00-hello-solana](../challenges/00-hello-solana.md)** - Your first account
- **[01-spl-token](../challenges/01-spl-token.md)** - Token accounts, ATAs
- **[03-pda-escrow](../challenges/03-pda-escrow.md)** - Program-owned accounts

## Key Takeaways

1. **Programs are stateless** - All data lives in accounts
2. **Owner controls writes** - Only the owner program can modify data
3. **Space costs money** - Every byte requires rent
4. **Calculate space carefully** - Include discriminator, use explicit sizing
5. **Accounts are just bytes** - The owner program interprets them
