# Rent & Space

## TLDR

Every byte of account data costs rent. To keep an account alive, it must hold enough SOL to be "rent-exempt" (about 0.00089 SOL per KB). Calculate space carefully - too little and your account can't hold data, too much and you waste SOL.

## Core Concepts

### Rent Exemption

Solana accounts must pay "rent" to exist. If an account's balance falls below rent-exemption threshold, it can be garbage collected:

```
┌─────────────────────────────────────────────────────────┐
│                  Rent Economics                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Rent-exempt minimum = bytes × 0.00000348 SOL          │
│                                                         │
│  Examples:                                              │
│  ├── 100 bytes  → 0.00089 SOL (~$0.15)                │
│  ├── 1 KB       → 0.00739 SOL (~$1.25)                │
│  ├── 10 KB      → 0.07293 SOL (~$12.40)               │
│  └── 100 KB     → 0.72851 SOL (~$124)                  │
│                                                         │
│  * Prices at $170/SOL                                  │
└─────────────────────────────────────────────────────────┘
```

### Space Calculation

Every field has a size. Anchor adds an 8-byte discriminator:

| Type | Size (bytes) | Notes |
|------|-------------|-------|
| `bool` | 1 | |
| `u8`, `i8` | 1 | |
| `u16`, `i16` | 2 | |
| `u32`, `i32` | 4 | |
| `u64`, `i64` | 8 | |
| `u128`, `i128` | 16 | |
| `Pubkey` | 32 | |
| `String` | 4 + len | 4-byte prefix + UTF-8 bytes |
| `Vec<T>` | 4 + (len × size_of::<T>) | 4-byte prefix + elements |
| `Option<T>` | 1 + size_of::<T> | 1-byte discriminant + T |
| `[T; N]` | N × size_of::<T> | Fixed array |
| Anchor discriminator | 8 | Always first |

### The Realloc Pattern

Accounts can grow or shrink (within limits):

```rust
// Max realloc per instruction: 10 KB increase
// Total max account size: 10 MB

#[derive(Accounts)]
#[instruction(new_data_len: usize)]
pub struct Resize<'info> {
    #[account(
        mut,
        realloc = 8 + 32 + 4 + new_data_len,  // New size
        realloc::payer = payer,                // Who pays for increase
        realloc::zero = false,                 // Don't zero new bytes
    )]
    pub data_account: Account<'info, DataAccount>,
    
    #[account(mut)]
    pub payer: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}
```

## Code Examples

### Calculating Space (Explicit)

```rust
use anchor_lang::prelude::*;

#[account]
pub struct UserProfile {
    pub authority: Pubkey,      // 32 bytes
    pub username: String,       // 4 + max_len bytes
    pub score: u64,             // 8 bytes
    pub achievements: Vec<u64>, // 4 + (max_len × 8) bytes
    pub is_active: bool,        // 1 byte
    pub bump: u8,               // 1 byte
}

impl UserProfile {
    pub const MAX_USERNAME_LEN: usize = 32;
    pub const MAX_ACHIEVEMENTS: usize = 10;
    
    pub const LEN: usize = 8                        // Discriminator
        + 32                                         // authority
        + 4 + Self::MAX_USERNAME_LEN                // username
        + 8                                          // score  
        + 4 + (Self::MAX_ACHIEVEMENTS * 8)          // achievements
        + 1                                          // is_active
        + 1;                                         // bump
    // Total: 8 + 32 + 36 + 8 + 84 + 1 + 1 = 170 bytes
}
```

### Using InitSpace Macro

```rust
use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]  // Auto-calculate space
pub struct GameState {
    pub authority: Pubkey,
    #[max_len(50)]           // Required for String
    pub game_name: String,
    pub player_count: u32,
    #[max_len(100)]          // Required for Vec
    pub high_scores: Vec<u64>,
    pub is_active: bool,
}

#[derive(Accounts)]
pub struct CreateGame<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + GameState::INIT_SPACE,  // 8 = discriminator
    )]
    pub game: Account<'info, GameState>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}
```

### Getting Rent-Exempt Minimum (Client)

```typescript
import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";

const connection = new Connection("https://api.devnet.solana.com");

// Calculate minimum balance for space
const space = 170; // bytes
const rentExempt = await connection.getMinimumBalanceForRentExemption(space);

console.log(`Space: ${space} bytes`);
console.log(`Rent-exempt: ${rentExempt} lamports`);
console.log(`Rent-exempt: ${rentExempt / LAMPORTS_PER_SOL} SOL`);
```

### Zero-Copy for Large Accounts

```rust
use anchor_lang::prelude::*;

// For accounts > 10 KB, use zero-copy to avoid stack/heap limits
#[account(zero_copy)]
#[repr(C)]  // Required for zero-copy
pub struct LargeState {
    pub authority: Pubkey,
    pub data: [u64; 1000],  // 8000 bytes - must be fixed size
}

#[derive(Accounts)]
pub struct UseLargeState<'info> {
    #[account(
        mut,
        // Use AccountLoader instead of Account for zero-copy
    )]
    pub state: AccountLoader<'info, LargeState>,
}

pub fn process(ctx: Context<UseLargeState>) -> Result<()> {
    // Load and lock the account
    let state = ctx.accounts.state.load_mut()?;
    state.data[0] = 42;
    Ok(())
}
```

### Closing Accounts (Reclaim Rent)

```rust
#[derive(Accounts)]
pub struct CloseAccount<'info> {
    #[account(
        mut,
        close = recipient,  // Send lamports to recipient
        has_one = authority,
    )]
    pub account_to_close: Account<'info, UserProfile>,
    
    #[account(mut)]
    pub recipient: SystemAccount<'info>,  // Receives the lamports
    
    pub authority: Signer<'info>,
}

// The account will be zeroed and lamports transferred to recipient
```

## Common Mistakes

### ❌ Forgetting the Discriminator

```rust
// WRONG: Missing 8-byte discriminator
pub const LEN: usize = 32 + 8 + 1;  // ❌ 41 bytes

// RIGHT: Include discriminator
pub const LEN: usize = 8 + 32 + 8 + 1;  // ✅ 49 bytes
```

### ❌ Not Accounting for String/Vec Prefix

```rust
// WRONG: Forgetting the 4-byte length prefix
pub const LEN: usize = 8 + 32;  // Just the content

// RIGHT: Include prefix
pub const LEN: usize = 8 + 4 + 32;  // 4-byte prefix + content
```

### ❌ Underestimating Space

```rust
// WRONG: Using actual string length
let username = "alice";
space = 8 + 4 + username.len();  // ❌ Only 5 bytes for username!

// RIGHT: Use MAXIMUM expected length
pub const MAX_USERNAME_LEN: usize = 32;
space = 8 + 4 + MAX_USERNAME_LEN;  // ✅ Room for any username
```

### ❌ Account Too Small for Data

```rust
// WRONG: Trying to store more than allocated
pub fn update(ctx: Context<Update>, new_data: Vec<u64>) -> Result<()> {
    let account = &mut ctx.accounts.data;
    account.items = new_data;  // ❌ Might overflow if new_data is larger!
    Ok(())
}

// RIGHT: Validate before storing
require!(new_data.len() <= MAX_ITEMS, MyError::TooManyItems);
```

### ❌ Closing Account to Wrong Recipient

```rust
// WRONG: Closing to attacker-controlled address
#[account(mut, close = attacker)]  // ❌ Where did this come from?

// RIGHT: Close to known safe destination
#[account(
    mut,
    close = authority,  // Return rent to the authority
    has_one = authority,
)]
```

## Space Reference Table

Quick reference for common account patterns:

| Pattern | Space Calculation |
|---------|-------------------|
| Simple config | `8 + 32 + 8 + 1` = 49 bytes |
| User profile (32-char name) | `8 + 32 + 4 + 32 + 8 + 1` = 85 bytes |
| Token account (SPL) | 165 bytes (fixed) |
| NFT metadata | ~679 bytes (varies) |
| Escrow | `8 + 32 + 32 + 8 + 8 + 1` = 89 bytes |

## Related Challenges

- **[00-hello-solana](../challenges/00-hello-solana.md)** - Basic account creation
- **[01-spl-token](../challenges/01-spl-token.md)** - Token account space
- **[06-compressed-nfts](../challenges/06-compressed-nfts.md)** - State compression to save space

## Key Takeaways

1. **Every byte costs SOL** - ~0.00089 SOL per 100 bytes
2. **Include discriminator** - Always add 8 bytes for Anchor
3. **Use max lengths** - Allocate for worst case, not current data
4. **String/Vec have prefixes** - Add 4 bytes for length prefix
5. **Close to reclaim** - Use `close = recipient` to get rent back
6. **Zero-copy for large** - Use `AccountLoader` for accounts > 10 KB
7. **Realloc carefully** - Max 10 KB increase per instruction
