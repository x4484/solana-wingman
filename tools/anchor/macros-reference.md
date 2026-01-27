# Anchor Macros Reference

## TLDR

Anchor macros generate boilerplate code at compile time. Understanding what they expand to helps you debug issues and write more efficient programs.

## Core Macros

### #[program]

Defines your program's entry point and instruction handlers.

```rust
#[program]
pub mod my_program {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, data: u64) -> Result<()> {
        // Your logic here
        Ok(())
    }
}
```

**What it generates:**
- Instruction discriminators (first 8 bytes of instruction data)
- Entrypoint function
- Instruction routing based on discriminator
- Automatic deserialization of accounts and args

**Discriminator calculation:**
```rust
// sha256("global:initialize")[..8]
// Each instruction gets unique 8-byte prefix
```

---

### #[derive(Accounts)]

Defines account validation for an instruction.

```rust
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = user, space = 8 + 32)]
    pub my_account: Account<'info, MyAccount>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}
```

**What it generates:**
- Account deserialization
- Constraint checking (before your code runs)
- Lifetime management for account references

---

### #[account]

Marks a struct as an Anchor account (stored on-chain).

```rust
#[account]
pub struct MyAccount {
    pub authority: Pubkey,
    pub data: u64,
    pub bump: u8,
}
```

**What it generates:**
- `BorshSerialize` and `BorshDeserialize` implementations
- 8-byte discriminator (sha256("account:MyAccount")[..8])
- `Owner` trait implementation (owner = your program)

**Account data layout:**
```
[0..8]   - Discriminator
[8..]    - BorshSerialize(your_fields)
```

---

### #[account(zero_copy)]

For large accounts (>10KB) that shouldn't be copied to heap.

```rust
#[account(zero_copy)]
#[repr(C)]  // Required!
pub struct LargeAccount {
    pub data: [u64; 1000],
}
```

**Requirements:**
- Must use `#[repr(C)]` for memory layout
- All fields must be `Copy` (no String, Vec)
- Use `AccountLoader` instead of `Account`

**Usage:**
```rust
#[derive(Accounts)]
pub struct UseLarge<'info> {
    #[account(mut)]
    pub large: AccountLoader<'info, LargeAccount>,
}

pub fn process(ctx: Context<UseLarge>) -> Result<()> {
    let large = ctx.accounts.large.load_mut()?;
    large.data[0] = 42;
    Ok(())
}
```

---

### #[error_code]

Defines custom errors.

```rust
#[error_code]
pub enum MyError {
    #[msg("The value provided is too large")]
    ValueTooLarge,
    
    #[msg("Unauthorized access attempt")]
    Unauthorized,
    
    #[msg("Arithmetic overflow")]
    Overflow,
}
```

**Usage:**
```rust
require!(value <= 100, MyError::ValueTooLarge);
return Err(MyError::Unauthorized.into());
```

**Error format:**
- Base error code: 6000
- Your errors: 6000 + index (e.g., ValueTooLarge = 6000, Unauthorized = 6001)

---

### #[event]

Defines an event that can be emitted and indexed.

```rust
#[event]
pub struct TransferEvent {
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
    #[index]
    pub timestamp: i64,
}
```

**Emitting:**
```rust
emit!(TransferEvent {
    from: ctx.accounts.from.key(),
    to: ctx.accounts.to.key(),
    amount,
    timestamp: Clock::get()?.unix_timestamp,
});
```

**Client-side listening:**
```typescript
program.addEventListener("TransferEvent", (event, slot) => {
    console.log("Transfer:", event.amount);
});
```

---

### #[derive(InitSpace)]

Auto-calculates space for account initialization.

```rust
#[account]
#[derive(InitSpace)]
pub struct UserProfile {
    pub authority: Pubkey,
    #[max_len(32)]
    pub username: String,
    #[max_len(10)]
    pub scores: Vec<u64>,
    pub active: bool,
}
```

**Usage:**
```rust
#[account(
    init,
    payer = user,
    space = 8 + UserProfile::INIT_SPACE,  // 8 = discriminator
)]
pub profile: Account<'info, UserProfile>,
```

**Annotations:**
- `#[max_len(N)]` - Required for String and Vec

---

### declare_id!

Sets your program's address.

```rust
declare_id!("YourProgramId111111111111111111111111111111");
```

**What it generates:**
- `ID` constant
- `id()` function
- `check_id()` function

---

## Attribute Macros on Fields

### Account Attributes

| Attribute | Purpose | Example |
|-----------|---------|---------|
| `#[account(mut)]` | Account will be modified | `#[account(mut)] pub user: Signer<'info>` |
| `#[account(init, ...)]` | Create new account | See constraints reference |
| `#[account(seeds = [...], bump)]` | PDA validation | See constraints reference |
| `#[account(close = target)]` | Close account, send lamports | `#[account(mut, close = user)]` |

### Instruction Arguments

```rust
#[derive(Accounts)]
#[instruction(amount: u64, data: String)]  // Access instruction args in constraints
pub struct Transfer<'info> {
    #[account(
        constraint = vault.balance >= amount @ MyError::InsufficientFunds
    )]
    pub vault: Account<'info, Vault>,
}
```

---

## Macro Debugging

### Expand macros to see generated code:

```bash
# Install cargo-expand
cargo install cargo-expand

# View expanded code
cargo expand --lib
```

### Common expansion issues:

**"cannot find type `Context`"**
```rust
// WRONG: Missing prelude import
#[program]
pub mod my_program {
    pub fn init(ctx: Context<Init>) -> Result<()> { Ok(()) }
}

// RIGHT: Import prelude
use anchor_lang::prelude::*;
```

**"the trait `Accounts` is not implemented"**
```rust
// WRONG: Missing derive
pub struct MyAccounts<'info> { ... }

// RIGHT: Add derive
#[derive(Accounts)]
pub struct MyAccounts<'info> { ... }
```

---

## Space Calculation Quick Reference

| Type | Space | Notes |
|------|-------|-------|
| Discriminator | 8 | Always first for Anchor accounts |
| `bool` | 1 | |
| `u8`/`i8` | 1 | |
| `u16`/`i16` | 2 | |
| `u32`/`i32` | 4 | |
| `u64`/`i64` | 8 | |
| `u128`/`i128` | 16 | |
| `Pubkey` | 32 | |
| `String` | 4 + len | 4-byte prefix |
| `Vec<T>` | 4 + (len × size(T)) | 4-byte prefix |
| `Option<T>` | 1 + size(T) | 1-byte discriminant |
| `[T; N]` | N × size(T) | Fixed array |

---

## Related Docs

- **[constraints-cheatsheet.md](./constraints-cheatsheet.md)** - Account constraints
- **[../foundations/07-anchor-framework.md](../foundations/07-anchor-framework.md)** - Full Anchor guide
