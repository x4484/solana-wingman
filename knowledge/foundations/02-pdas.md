# Program Derived Addresses (PDAs)

## TLDR

PDAs are special addresses that only your program can sign for. They're derived from seeds (like a username or token mint) and your program ID. No private key exists for a PDA - your program IS the authority. This enables trustless escrows, vaults, and program-controlled accounts.

## Core Concepts

### What Makes PDAs Special

Regular keypairs: `private key → public key`
PDAs: `seeds + program_id + bump → address (no private key)`

```
┌─────────────────────────────────────────────────────────┐
│                   PDA Derivation                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   seeds: ["vault", user_pubkey]                        │
│              +                                          │
│   program_id: YourProgram111...                        │
│              +                                          │
│   bump: 254 (first valid)                              │
│              ↓                                          │
│   PDA: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU    │
│                                                         │
│   ⚠️ No private key exists for this address!           │
│   Only YourProgram can sign for it via CPI             │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### The Bump Explained

PDAs must be **off the ed25519 curve** (no valid private key). The bump is a number (255→0) that "bumps" the address off the curve:

```rust
// Solana tries bump = 255, 254, 253... until finding valid PDA
let (pda, bump) = Pubkey::find_program_address(
    &[b"vault", user.key().as_ref()],
    &program_id
);

// bump is the FIRST value that produces a valid PDA
// This is the "canonical bump" - always use it
```

### Why Use PDAs?

| Use Case | Why PDA? |
|----------|----------|
| **Escrow** | Hold funds that only the program can release |
| **Vault** | Store tokens without a wallet private key |
| **Config** | Global settings with deterministic address |
| **Authority** | Program signs for token transfers |
| **Mapping** | Derive account from known inputs (user → profile) |

## Code Examples

### Deriving a PDA (Client-Side)

```typescript
import { PublicKey } from "@solana/web3.js";

const [vaultPda, bump] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("vault"),
    userPubkey.toBuffer(),
  ],
  programId
);

console.log("Vault PDA:", vaultPda.toBase58());
console.log("Bump:", bump);
```

### Using PDAs in Anchor

```rust
use anchor_lang::prelude::*;

#[account]
pub struct Vault {
    pub authority: Pubkey,
    pub balance: u64,
    pub bump: u8,  // Store the bump!
}

#[derive(Accounts)]
pub struct CreateVault<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 8 + 1,
        seeds = [b"vault", authority.key().as_ref()],
        bump  // Anchor finds and validates the bump
    )]
    pub vault: Account<'info, Vault>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn create_vault(ctx: Context<CreateVault>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    vault.authority = ctx.accounts.authority.key();
    vault.balance = 0;
    vault.bump = ctx.bumps.vault;  // Save the bump for later
    Ok(())
}
```

### PDA as Signer (CPI)

```rust
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    let authority = ctx.accounts.authority.key();
    let bump = ctx.accounts.vault.bump;
    
    // Seeds for PDA signer
    let seeds = &[
        b"vault",
        authority.as_ref(),
        &[bump],
    ];
    let signer_seeds = &[&seeds[..]];
    
    // CPI: PDA signs the transfer
    let cpi_accounts = Transfer {
        from: ctx.accounts.vault_token_account.to_account_info(),
        to: ctx.accounts.user_token_account.to_account_info(),
        authority: ctx.accounts.vault.to_account_info(),  // PDA is authority
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
    
    token::transfer(cpi_ctx, amount)?;
    
    Ok(())
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        seeds = [b"vault", authority.key().as_ref()],
        bump = vault.bump,
        has_one = authority
    )]
    pub vault: Account<'info, Vault>,
    
    #[account(mut)]
    pub vault_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    
    pub authority: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}
```

### Multi-Seed PDAs

```rust
// User's token vault for a specific mint
#[account(
    seeds = [
        b"user_vault",
        user.key().as_ref(),
        mint.key().as_ref(),
    ],
    bump
)]
pub user_vault: Account<'info, UserVault>,

// Lookup: given user + mint, find their vault
// Deterministic and unique per user-mint pair
```

## Common Mistakes

### ❌ Not Storing the Bump

```rust
// WRONG: Recalculating bump every time is expensive
let (pda, bump) = Pubkey::find_program_address(&seeds, &program_id);

// RIGHT: Store bump in account, use it directly
#[account]
pub struct Vault {
    pub bump: u8,  // Store once, reuse forever
}

// Then use stored bump
seeds = [b"vault", authority.as_ref(), &[vault.bump]];
```

### ❌ Using Non-Canonical Bumps

```rust
// WRONG: Using arbitrary bump
let seeds = [b"vault", user.as_ref(), &[100_u8]];  // ❌ Might not be canonical

// RIGHT: Always use find_program_address result
let (_, canonical_bump) = Pubkey::find_program_address(&seeds, &program_id);
let seeds = [b"vault", user.as_ref(), &[canonical_bump]];  // ✅
```

### ❌ Forgetting PDA Seeds Are Public

```rust
// WRONG: Thinking seeds are secret
seeds = [b"vault", secret_password.as_ref()];  // ❌ Seeds are visible on-chain!

// RIGHT: Use PDAs for determinism, not security
// Anyone can derive the same PDA from the same seeds
```

### ❌ Wrong Seed Order

```rust
// These produce DIFFERENT PDAs:
seeds = [b"vault", user.as_ref(), mint.as_ref()];  // PDA #1
seeds = [b"vault", mint.as_ref(), user.as_ref()];  // PDA #2 (different!)

// Be consistent with seed ordering across your program
```

### ❌ Seed Length Collisions

```rust
// DANGER: These could collide!
seeds = [user_a.as_ref(), user_b.as_ref()];  // 64 bytes total
seeds = [some_64_byte_value.as_ref()];        // Also 64 bytes!

// SAFE: Use prefixes or length markers
seeds = [b"pair", user_a.as_ref(), user_b.as_ref()];
```

## PDA Patterns

### Global Singleton

```rust
// One config account for the entire program
seeds = [b"config"]
```

### Per-User Account

```rust
// Each user gets one account
seeds = [b"profile", user.key().as_ref()]
```

### Per-User-Per-Asset

```rust
// User's position in a specific market
seeds = [b"position", user.key().as_ref(), market.key().as_ref()]
```

### Counter/Sequence

```rust
// Incrementing IDs
seeds = [b"item", &item_id.to_le_bytes()]
```

## Related Challenges

- **[03-pda-escrow](../challenges/03-pda-escrow.md)** - PDA-controlled escrow
- **[04-staking-program](../challenges/04-staking-program.md)** - PDA vaults for staking
- **[08-amm-swap](../challenges/08-amm-swap.md)** - Pool PDAs

## Key Takeaways

1. **No private key** - PDAs are program-controlled addresses
2. **Deterministic** - Same seeds always produce same address
3. **Store the bump** - Calculate once, store, reuse
4. **Use canonical bumps** - Always use `find_program_address`
5. **Seeds are public** - Anyone can derive PDAs from known inputs
6. **Unique per program** - Same seeds with different program IDs = different PDAs
