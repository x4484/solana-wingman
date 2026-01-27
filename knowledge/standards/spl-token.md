# SPL Token Standard

## TLDR

SPL Token is Solana's original fungible token standard - the ERC-20 equivalent. Every token (USDC, BONK, JUP) uses this program. Understand mints, token accounts, and ATAs to work with any Solana token.

## Core Concepts

### The Token Model

```
┌─────────────────────────────────────────────────────────┐
│                   SPL Token Architecture                │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  MINT ACCOUNT                                           │
│  ├── supply: 1,000,000,000                             │
│  ├── decimals: 6                                        │
│  ├── mint_authority: <pubkey> (can mint more)          │
│  └── freeze_authority: <pubkey> (can freeze accounts)  │
│                                                         │
│           ↓ owns tokens ↓                              │
│                                                         │
│  TOKEN ACCOUNT (User A)    TOKEN ACCOUNT (User B)      │
│  ├── mint: <mint_pubkey>   ├── mint: <mint_pubkey>    │
│  ├── owner: <user_a>       ├── owner: <user_b>        │
│  ├── amount: 500,000       ├── amount: 300,000        │
│  └── delegate: null        └── delegate: null         │
│                                                         │
│  Unlike ETH: balances are NOT stored on the mint!      │
│  Each user has a separate TOKEN ACCOUNT.               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Associated Token Accounts (ATAs)

**Problem:** Token accounts have random addresses. How do you find someone's USDC account?

**Solution:** ATAs are deterministically derived from (wallet, mint):

```typescript
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

// Deterministic: same inputs = same address
const ata = getAssociatedTokenAddressSync(
  usdcMint,      // Which token
  userWallet,    // Whose wallet
);
// Result: The ONE canonical USDC account for this user
```

## Code Examples

### Create a Token (Mint)

```typescript
import {
  createMint,
  getMint,
} from "@solana/spl-token";

const mint = await createMint(
  connection,
  payer,              // Who pays for the account
  mintAuthority,      // Who can mint more tokens
  freezeAuthority,    // Who can freeze (null for no freeze)
  6,                  // Decimals (6 = like USDC)
);

console.log("Mint created:", mint.toBase58());
```

### Create Token Account (ATA)

```typescript
import {
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddress,
} from "@solana/spl-token";

// Get or create ATA for user
const userAta = await getOrCreateAssociatedTokenAccount(
  connection,
  payer,        // Who pays if creating
  mint,         // Token mint
  userWallet,   // Token owner
);

console.log("ATA:", userAta.address.toBase58());
console.log("Balance:", userAta.amount);
```

### Mint Tokens

```typescript
import { mintTo } from "@solana/spl-token";

await mintTo(
  connection,
  payer,            // Payer
  mint,             // Mint address
  destinationAta,   // Where to mint to
  mintAuthority,    // Must be mint authority
  1_000_000_000,    // Amount (with decimals!)
);

// Minted 1000 tokens (assuming 6 decimals)
```

### Transfer Tokens

```typescript
import { transfer } from "@solana/spl-token";

await transfer(
  connection,
  payer,          // Payer
  fromAta,        // Source token account
  toAta,          // Destination token account
  owner,          // Owner of source account
  500_000_000,    // Amount
);
```

### Burn Tokens

```typescript
import { burn } from "@solana/spl-token";

await burn(
  connection,
  payer,
  tokenAccount,   // Account holding tokens
  mint,           // Token mint
  owner,          // Owner of token account
  100_000_000,    // Amount to burn
);
```

### Anchor Integration

```rust
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer, MintTo, Burn};

#[derive(Accounts)]
pub struct TransferTokens<'info> {
    #[account(mut)]
    pub from: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub to: Account<'info, TokenAccount>,
    
    pub authority: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

pub fn transfer_tokens(ctx: Context<TransferTokens>, amount: u64) -> Result<()> {
    let cpi_accounts = Transfer {
        from: ctx.accounts.from.to_account_info(),
        to: ctx.accounts.to.to_account_info(),
        authority: ctx.accounts.authority.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    
    token::transfer(cpi_ctx, amount)?;
    Ok(())
}
```

### Create ATA in Anchor

```rust
use anchor_spl::associated_token::AssociatedToken;

#[derive(Accounts)]
pub struct CreateAta<'info> {
    #[account(
        init,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = owner,
    )]
    pub token_account: Account<'info, TokenAccount>,
    
    pub mint: Account<'info, Mint>,
    
    /// CHECK: Just the owner pubkey
    pub owner: AccountInfo<'info>,
    
    #[account(mut)]
    pub payer: Signer<'info>,
    
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}
```

## Key Addresses

```typescript
const SPL_TOKEN = {
  // Original Token Program
  PROGRAM_ID: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  
  // Associated Token Account Program
  ATA_PROGRAM: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  
  // Common token mints
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  SOL: "So11111111111111111111111111111111111111112", // Wrapped SOL
};
```

## Common Mistakes

### ❌ Forgetting Decimals

```typescript
// WRONG: "100 USDC" as 100
const amount = 100; // ❌ This is 0.0001 USDC!

// RIGHT: Account for decimals
const USDC_DECIMALS = 6;
const amount = 100 * 10 ** USDC_DECIMALS; // ✅ 100_000_000
```

### ❌ Transferring to Mint Instead of ATA

```typescript
// WRONG: Sending to mint address
await transfer(connection, payer, fromAta, mintAddress, owner, amount);
// ❌ Fails! Mint is not a token account

// RIGHT: Send to token account (ATA)
const toAta = getAssociatedTokenAddressSync(mint, recipient);
await transfer(connection, payer, fromAta, toAta, owner, amount);
```

### ❌ Not Creating Destination ATA

```typescript
// WRONG: Assuming ATA exists
const toAta = getAssociatedTokenAddressSync(mint, recipient);
await transfer(..., toAta, ...); // ❌ Fails if ATA doesn't exist!

// RIGHT: Create if needed
const toAta = await getOrCreateAssociatedTokenAccount(
  connection, payer, mint, recipient
);
await transfer(..., toAta.address, ...); // ✅
```

### ❌ Using Deprecated Functions

```typescript
// DEPRECATED: Old Token class
import { Token } from "@solana/spl-token"; // ❌ Old API

// CURRENT: Use standalone functions
import { createMint, mintTo, transfer } from "@solana/spl-token"; // ✅
```

## Account Sizes

| Account | Size (bytes) | Rent-exempt |
|---------|-------------|-------------|
| Mint | 82 | ~0.00145 SOL |
| Token Account | 165 | ~0.00203 SOL |
| Multisig | 355 | ~0.00281 SOL |

## When to Use Token-2022 Instead

| Feature | SPL Token | Token-2022 |
|---------|-----------|------------|
| Basic transfers | ✅ | ✅ |
| Transfer fees | ❌ | ✅ |
| Interest-bearing | ❌ | ✅ |
| Non-transferable | ❌ | ✅ |
| Metadata | Separate program | ✅ Built-in |
| Ecosystem support | Universal | Growing |

**Use SPL Token when:** Maximum compatibility is needed, no special features required.

**Use Token-2022 when:** You need transfer fees, interest, or built-in metadata.

## Resources

- **Docs**: https://spl.solana.com/token
- **SDK**: https://github.com/solana-labs/solana-program-library/tree/master/token/js
- **Explorer**: https://explorer.solana.com/?cluster=mainnet

## Related

- **[../challenges/01-spl-token.md](../challenges/01-spl-token.md)** - Build tokens
- **[./token-2022.md](./token-2022.md)** - Modern token standard
