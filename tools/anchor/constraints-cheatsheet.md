# Anchor Constraints Cheatsheet

## Quick Reference Table

| Constraint | Purpose | Example |
|------------|---------|---------|
| `mut` | Mark account as writable | `#[account(mut)]` |
| `init` | Create new account | `#[account(init, payer = x, space = n)]` |
| `init_if_needed` | Create if doesn't exist | `#[account(init_if_needed, ...)]` |
| `seeds` | Verify/derive PDA | `#[account(seeds = [b"x"], bump)]` |
| `bump` | PDA bump seed | `#[account(seeds = [...], bump)]` |
| `has_one` | Verify account relationship | `#[account(has_one = authority)]` |
| `constraint` | Custom validation | `#[account(constraint = x > 0)]` |
| `close` | Close account | `#[account(close = recipient)]` |
| `realloc` | Resize account | `#[account(realloc = n, ...)]` |
| `token::*` | Token account checks | `#[account(token::mint = m)]` |
| `associated_token::*` | ATA checks | `#[account(associated_token::...)]` |

---

## Initialization Constraints

### Basic Init

```rust
#[account(
    init,
    payer = user,           // Who pays for rent
    space = 8 + 32 + 8,     // Discriminator + fields
)]
pub my_account: Account<'info, MyAccount>,
```

### Init with PDA

```rust
#[account(
    init,
    payer = user,
    space = 8 + MyAccount::LEN,
    seeds = [b"vault", user.key().as_ref()],
    bump,
)]
pub vault: Account<'info, Vault>,
```

### Init If Needed (Idempotent)

```rust
// ⚠️ Requires: anchor-lang = { features = ["init-if-needed"] }
#[account(
    init_if_needed,
    payer = user,
    space = 8 + UserProfile::LEN,
    seeds = [b"profile", user.key().as_ref()],
    bump,
)]
pub profile: Account<'info, UserProfile>,
```

---

## PDA Constraints

### Find Bump (Slower)

```rust
#[account(
    seeds = [b"config"],
    bump,  // Anchor finds bump via find_program_address
)]
pub config: Account<'info, Config>,
```

### Use Stored Bump (Faster)

```rust
#[account(
    seeds = [b"config"],
    bump = config.bump,  // Use bump stored in account
)]
pub config: Account<'info, Config>,
```

### Multi-Seed PDA

```rust
#[account(
    seeds = [
        b"position",
        user.key().as_ref(),
        market.key().as_ref(),
    ],
    bump = position.bump,
)]
pub position: Account<'info, Position>,
```

### PDA with Different Program

```rust
#[account(
    seeds = [b"metadata", mint.key().as_ref()],
    bump,
    seeds::program = mpl_token_metadata::ID,  // External program's PDA
)]
pub metadata: Account<'info, MetadataAccount>,
```

---

## Relationship Constraints

### has_one

```rust
// Verifies: vault.authority == authority.key()
#[account(has_one = authority)]
pub vault: Account<'info, Vault>,
pub authority: Signer<'info>,
```

### has_one with Custom Error

```rust
#[account(
    has_one = authority @ MyError::WrongAuthority
)]
pub vault: Account<'info, Vault>,
```

### Multiple has_one

```rust
#[account(
    has_one = owner,
    has_one = mint,
)]
pub token_account: Account<'info, TokenAccount>,
```

---

## Custom Constraints

### Simple Constraint

```rust
#[account(constraint = amount > 0)]
pub data: Account<'info, Data>,
```

### Constraint with Error

```rust
#[account(
    constraint = data.value > 0 @ MyError::MustBePositive
)]
pub data: Account<'info, Data>,
```

### Complex Constraint

```rust
#[account(
    constraint = {
        let now = Clock::get()?.unix_timestamp;
        data.unlock_time <= now
    } @ MyError::StillLocked
)]
pub data: Account<'info, Data>,
```

### Comparing Accounts

```rust
#[account(
    constraint = account_a.key() != account_b.key() @ MyError::DuplicateAccount
)]
pub account_a: Account<'info, Data>,
pub account_b: Account<'info, Data>,
```

---

## Token Constraints

### Token Account Validation

```rust
#[account(
    token::mint = mint,
    token::authority = owner,
)]
pub token_account: Account<'info, TokenAccount>,
```

### Initialize Token Account

```rust
#[account(
    init,
    payer = user,
    token::mint = mint,
    token::authority = user,
)]
pub user_token: Account<'info, TokenAccount>,
```

### Associated Token Account

```rust
#[account(
    associated_token::mint = mint,
    associated_token::authority = user,
)]
pub user_ata: Account<'info, TokenAccount>,
```

### Init ATA

```rust
#[account(
    init_if_needed,
    payer = user,
    associated_token::mint = mint,
    associated_token::authority = user,
)]
pub user_ata: Account<'info, TokenAccount>,
```

---

## Mutation Constraints

### Writable Account

```rust
#[account(mut)]
pub user: Signer<'info>,

#[account(mut)]
pub data: Account<'info, Data>,
```

### Reallocation

```rust
#[account(
    mut,
    realloc = 8 + new_size,
    realloc::payer = payer,
    realloc::zero = false,  // Don't zero new bytes
)]
pub growing_account: Account<'info, Data>,

#[account(mut)]
pub payer: Signer<'info>,
```

### Close Account

```rust
#[account(
    mut,
    close = recipient,  // Lamports go here
    has_one = authority,
)]
pub closing_account: Account<'info, Data>,

/// CHECK: Receives closed account lamports
#[account(mut)]
pub recipient: UncheckedAccount<'info>,

pub authority: Signer<'info>,
```

---

## Address Constraints

### Exact Address Match

```rust
#[account(address = ADMIN_PUBKEY)]
pub admin: Signer<'info>,
```

### Program ID Check

```rust
#[account(
    constraint = some_program.key() == expected_program::ID
)]
/// CHECK: Validated by constraint
pub some_program: UncheckedAccount<'info>,
```

---

## Instruction Arguments Access

```rust
#[derive(Accounts)]
#[instruction(amount: u64, name: String)]
pub struct Transfer<'info> {
    #[account(
        mut,
        constraint = vault.balance >= amount @ MyError::InsufficientFunds
    )]
    pub vault: Account<'info, Vault>,
    
    #[account(
        init,
        payer = user,
        space = 8 + 4 + name.len(),  // Use instruction arg
        seeds = [name.as_bytes()],
        bump,
    )]
    pub named_account: Account<'info, NamedAccount>,
}
```

---

## Common Patterns

### Owner Must Sign

```rust
#[account(
    mut,
    has_one = owner,
)]
pub data: Account<'info, Data>,
pub owner: Signer<'info>,
```

### Admin-Only Action

```rust
#[account(
    constraint = config.admin == admin.key() @ MyError::NotAdmin
)]
pub config: Account<'info, Config>,
pub admin: Signer<'info>,
```

### Not Paused Check

```rust
#[account(
    constraint = !config.is_paused @ MyError::Paused
)]
pub config: Account<'info, Config>,
```

### Deadline Check

```rust
#[derive(Accounts)]
#[instruction(deadline: i64)]
pub struct TimeSensitive<'info> {
    #[account(
        constraint = Clock::get()?.unix_timestamp <= deadline @ MyError::DeadlineExceeded
    )]
    pub data: Account<'info, Data>,
}
```

---

## Constraint Errors

Default anchor errors vs custom:

```rust
// Default error (generic)
#[account(has_one = authority)]  // "A has_one constraint was violated"

// Custom error (specific)
#[account(has_one = authority @ MyError::WrongAuthority)]  // Your message
```

**Always use custom errors for better debugging!**

---

## Related Docs

- **[macros-reference.md](./macros-reference.md)** - Anchor macros
- **[../foundations/07-anchor-framework.md](../foundations/07-anchor-framework.md)** - Full framework guide
