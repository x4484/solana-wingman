# Serialization & Borsh

## TLDR

Solana accounts store raw bytes. Borsh (Binary Object Representation Serializer for Hashing) converts your Rust structs to/from bytes. Anchor handles this automatically with `#[account]`, but understanding serialization helps you debug, optimize, and interoperate with non-Anchor programs.

## Core Concepts

### Why Borsh?

```
┌─────────────────────────────────────────────────────────┐
│                   Serialization Flow                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Rust Struct          Bytes on Chain                   │
│  ┌──────────┐         ┌──────────────────────┐        │
│  │ score: 42│  ─────► │ 2A 00 00 00 00 00 00 00 │      │
│  │ name: "a"│  Borsh  │ 01 00 00 00 61        │        │
│  └──────────┘         └──────────────────────┘         │
│                                                         │
│  Benefits:                                              │
│  • Deterministic (same input = same output)            │
│  • Compact (no field names, minimal overhead)          │
│  • Fast (direct byte manipulation)                     │
│  • Cross-language (JS/Python can serialize too)        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Anchor Discriminator

Anchor adds an 8-byte discriminator to every account - a hash of the account type name:

```rust
// Account data layout:
// [0..8]   - Discriminator (sha256("account:MyAccount")[..8])
// [8..]    - Your struct fields (Borsh serialized)

#[account]
pub struct MyAccount {
    pub value: u64,  // Starts at byte 8, not byte 0!
}
```

This prevents account confusion attacks - you can't pass a `TokenAccount` where a `GameState` is expected.

### Field Ordering Matters

Borsh serializes fields **in declaration order**:

```rust
// Version 1
#[account]
pub struct UserV1 {
    pub name: String,   // Offset 8
    pub score: u64,     // Offset 8 + 4 + name.len()
}

// Version 2 - BREAKING CHANGE!
#[account]
pub struct UserV2 {
    pub score: u64,     // Offset 8 (different!)
    pub name: String,   // Offset 16 (different!)
}

// Old accounts will deserialize incorrectly with V2!
```

## Code Examples

### Manual Borsh Serialization

```rust
use borsh::{BorshSerialize, BorshDeserialize};

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct GameState {
    pub player: [u8; 32],
    pub score: u64,
    pub level: u8,
}

// Serialize
let state = GameState {
    player: [1u8; 32],
    score: 100,
    level: 5,
};
let bytes = state.try_to_vec()?;
// bytes: [1,1,1,...(32 ones)..., 100,0,0,0,0,0,0,0, 5]

// Deserialize
let recovered = GameState::try_from_slice(&bytes)?;
```

### Reading Non-Anchor Account Data

```rust
use anchor_lang::prelude::*;
use borsh::BorshDeserialize;

// If you need to read a non-Anchor program's account:
#[derive(BorshDeserialize)]
pub struct ExternalData {
    pub field1: u64,
    pub field2: Pubkey,
}

pub fn read_external(ctx: Context<ReadExternal>) -> Result<()> {
    let data = &ctx.accounts.external_account.data.borrow();
    
    // Skip discriminator if it's an Anchor account, or parse directly
    let external: ExternalData = ExternalData::try_from_slice(data)?;
    
    msg!("Field1: {}", external.field1);
    Ok(())
}
```

### Zero-Copy for Large Accounts

```rust
use anchor_lang::prelude::*;

// For large accounts (> 10KB), use zero-copy to avoid heap allocation
#[account(zero_copy)]
#[repr(C)]  // Required: C memory layout for direct access
pub struct LargeAccount {
    pub authority: Pubkey,
    pub data: [u64; 1000],  // 8KB of data
}

// Access without copying entire account
pub fn update_large(ctx: Context<UpdateLarge>, index: usize, value: u64) -> Result<()> {
    let account = &mut ctx.accounts.large_account.load_mut()?;
    account.data[index] = value;
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateLarge<'info> {
    #[account(mut)]
    pub large_account: AccountLoader<'info, LargeAccount>,
}
```

### Type Conversions

```rust
// Pubkey ↔ bytes
let pubkey = Pubkey::new_unique();
let bytes: [u8; 32] = pubkey.to_bytes();
let recovered = Pubkey::new_from_array(bytes);

// u64 ↔ bytes (little-endian)
let num: u64 = 12345;
let bytes = num.to_le_bytes();  // [57, 48, 0, 0, 0, 0, 0, 0]
let recovered = u64::from_le_bytes(bytes);

// String ↔ bytes
let s = "hello";
let bytes = s.as_bytes();  // [104, 101, 108, 108, 111]
let recovered = std::str::from_utf8(bytes)?;
```

### Discriminator Verification

```rust
use anchor_lang::prelude::*;
use anchor_lang::Discriminator;

pub fn verify_account_type(ctx: Context<Verify>) -> Result<()> {
    let data = ctx.accounts.some_account.data.borrow();
    
    // Check discriminator matches expected type
    let expected_discriminator = MyAccount::DISCRIMINATOR;
    let actual_discriminator = &data[..8];
    
    require!(
        actual_discriminator == expected_discriminator,
        MyError::InvalidAccountType
    );
    
    Ok(())
}
```

## Common Mistakes

### ❌ Changing Field Order

```rust
// V1 - deployed to mainnet
#[account]
pub struct ConfigV1 {
    pub admin: Pubkey,    // bytes 8-40
    pub fee: u64,         // bytes 40-48
}

// V2 - WRONG! This breaks existing accounts
#[account]
pub struct ConfigV2 {
    pub fee: u64,         // bytes 8-16 (was admin!)
    pub admin: Pubkey,    // bytes 16-48 (was fee!)
}

// RIGHT: Add fields at the end only
#[account]
pub struct ConfigV2 {
    pub admin: Pubkey,    // bytes 8-40 (unchanged)
    pub fee: u64,         // bytes 40-48 (unchanged)
    pub new_field: u64,   // bytes 48-56 (added at end)
}
```

### ❌ Forgetting Borsh Overhead

```rust
// WRONG: Calculating space without Borsh overhead
// String is not just its content!
pub const SPACE: usize = 8 + 32;  // ❌ Missing 4-byte length prefix

// RIGHT: Include Borsh encoding overhead
pub const SPACE: usize = 8 + 4 + 32;  // ✅ 4-byte prefix for String/Vec
```

### ❌ Using Standard Derive for Serialization

```rust
// WRONG: serde won't work on-chain
#[derive(serde::Serialize, serde::Deserialize)]
pub struct MyData { ... }

// RIGHT: Use Borsh
#[derive(BorshSerialize, BorshDeserialize)]
pub struct MyData { ... }

// Or let Anchor handle it
#[account]
pub struct MyData { ... }
```

### ❌ Non-Deterministic Types

```rust
// WRONG: HashMap is not deterministic!
#[account]
pub struct Bad {
    pub mapping: HashMap<Pubkey, u64>,  // ❌ Serialization order undefined
}

// RIGHT: Use Vec of tuples or separate accounts
#[account]
pub struct Good {
    pub entries: Vec<(Pubkey, u64)>,  // ✅ Ordered
}
```

### ❌ Ignoring Alignment (Zero-Copy)

```rust
// WRONG: Fields not aligned properly
#[account(zero_copy)]
#[repr(C)]
pub struct BadAlignment {
    pub flag: bool,      // 1 byte
    pub value: u64,      // 8 bytes - misaligned!
}

// RIGHT: Order by size or add padding
#[account(zero_copy)]
#[repr(C)]
pub struct GoodAlignment {
    pub value: u64,      // 8 bytes
    pub flag: bool,      // 1 byte
    pub _padding: [u8; 7], // Explicit padding
}
```

## Borsh Type Sizes

| Rust Type | Borsh Size | Notes |
|-----------|------------|-------|
| `bool` | 1 | 0 or 1 |
| `u8`/`i8` | 1 | |
| `u16`/`i16` | 2 | Little-endian |
| `u32`/`i32` | 4 | Little-endian |
| `u64`/`i64` | 8 | Little-endian |
| `u128`/`i128` | 16 | Little-endian |
| `[T; N]` | N × size(T) | Fixed array |
| `Vec<T>` | 4 + len × size(T) | 4-byte length prefix |
| `String` | 4 + len | 4-byte length prefix + UTF-8 |
| `Option<T>` | 1 + size(T) | 1-byte discriminant |
| `Pubkey` | 32 | |

## Related Challenges

- **[00-hello-solana](../challenges/00-hello-solana.md)** - Basic account structures
- **[05-token-2022](../challenges/05-token-2022.md)** - Extension data layout

## Key Takeaways

1. **Borsh is deterministic** - Same data = same bytes
2. **Field order matters** - Never reorder existing fields
3. **Add fields at end** - Only way to safely upgrade
4. **Include overhead** - String/Vec have 4-byte prefixes
5. **8-byte discriminator** - Anchor adds it automatically
6. **Zero-copy for large** - Avoids heap allocation
7. **repr(C) for zero-copy** - Required for direct memory access
