# Critical Gotchas for Solana Development

Every Solana developer must internalize these concepts. They're the source of most bugs and confusion.

---

## 1. Account Model ≠ EVM Storage

```
❌ Ethereum thinking: "My contract stores user balances internally"
✅ Solana reality: "My program reads/writes external account data"
```

**What this means:**
- Programs are **stateless** - just code, no storage
- All data lives in **accounts** passed to instructions
- You must define account structures explicitly
- Accounts must be passed to every instruction that uses them

**Anchor pattern:**
```rust
#[account]
pub struct UserData {
    pub owner: Pubkey,
    pub balance: u64,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + 32 + 8 + 1,  // discriminator + pubkey + u64 + u8
        seeds = [b"user", user.key().as_ref()],
        bump
    )]
    pub user_data: Account<'info, UserData>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}
```

---

## 2. PDAs Have No Private Key

**Program Derived Addresses** are derived deterministically from seeds. No one has the private key - not even the program!

```rust
// Deriving a PDA
let (pda, bump) = Pubkey::find_program_address(
    &[b"vault", user.key().as_ref()],
    program_id
);
```

**Key facts:**
- Same seeds + program = same address (deterministic)
- PDAs are "off-curve" - no valid private key exists
- Programs can "sign" for their PDAs in CPIs
- The `bump` ensures the address is off-curve

**Common patterns:**
```rust
// Config PDA (singleton)
seeds = [b"config"]

// Per-user PDA
seeds = [b"user_account", user.key().as_ref()]

// Per-user-per-token PDA  
seeds = [b"stake", user.key().as_ref(), mint.key().as_ref()]
```

**Gotcha:** If your seeds aren't unique, you'll get collisions!

---

## 3. Token Accounts Are Separate

```
❌ "Send 100 USDC to wallet ABC123"
✅ "Send 100 USDC to wallet ABC123's USDC token account"
```

**The model:**
- Wallets don't hold tokens directly
- Each token type needs a separate **token account**
- **Associated Token Accounts (ATAs)** are deterministic PDAs for convenience

```
Wallet: ABC123
├── SOL balance: 1.5 SOL (native)
├── USDC ATA: xyz789 (holds USDC)
├── BONK ATA: def456 (holds BONK)
└── (no ATA for tokens you've never received)
```

**Creating ATAs:**
```rust
use anchor_spl::associated_token::AssociatedToken;

#[derive(Accounts)]
pub struct Transfer<'info> {
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = recipient,
    )]
    pub recipient_ata: Account<'info, TokenAccount>,
    // ...
}
```

**Gotcha:** Always check if ATA exists before transferring!

---

## 4. Rent & Rent-Exemption

Accounts cost SOL to exist. No rent = account gets deleted.

```
Rent formula:
minimum_balance = account_size_bytes × 0.00000348 SOL × 2 years
```

**Examples:**
- 0 bytes (just exists): ~0.00089 SOL
- 165 bytes (token account): ~0.00203 SOL
- 1000 bytes: ~0.00756 SOL

**Best practice:** Always make accounts rent-exempt (pay 2 years upfront).

```rust
#[account(
    init,
    payer = user,
    space = 8 + 32 + 8,  // Calculate exact space needed
)]
pub my_account: Account<'info, MyData>,
```

**Recovering rent:** Close accounts to get SOL back:
```rust
#[account(
    mut,
    close = recipient,  // SOL goes to recipient
)]
pub account_to_close: Account<'info, MyData>,
```

---

## 5. CPIs (Cross-Program Invocations)

Programs call other programs via CPI. This is how composability works.

```rust
use anchor_lang::solana_program::program::invoke_signed;

// Transfer tokens via CPI
let cpi_accounts = Transfer {
    from: ctx.accounts.vault.to_account_info(),
    to: ctx.accounts.user_ata.to_account_info(),
    authority: ctx.accounts.vault_authority.to_account_info(),
};
let cpi_program = ctx.accounts.token_program.to_account_info();

// PDA signs for the transfer
let seeds = &[b"vault_authority", &[bump]];
let signer_seeds = &[&seeds[..]];

let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
token::transfer(cpi_ctx, amount)?;
```

**Limits:**
- Max 4 levels of CPI depth
- Each CPI costs compute units
- All accounts must be passed through

---

## 6. Compute Units ≠ Gas

Solana uses **compute units (CU)**, not gas.

| Aspect | Ethereum Gas | Solana CU |
|--------|--------------|-----------|
| Default | Estimated | 200,000 per ix |
| Max | Block limit | 1,400,000 per tx |
| Price | Fluctuates | Priority fee optional |
| Refund | Unused refunded | No refund |

**Requesting more CU:**
```typescript
const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
    units: 400_000
});

const transaction = new Transaction()
    .add(modifyComputeUnits)
    .add(yourInstruction);
```

**Priority fees:**
```typescript
const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: 1_000  // Price per CU in micro-lamports
});
```

**Optimization tips:**
- Minimize account reads/writes
- Avoid unnecessary logging
- Use zero-copy for large accounts
- Batch operations when possible

---

## 7. Token-2022 Is Different

Token-2022 (Token Extensions) is a **separate program** from SPL Token!

| Feature | SPL Token | Token-2022 |
|---------|-----------|------------|
| Program ID | TokenkegQ... | TokenzQd... |
| Transfer hooks | ❌ | ✅ |
| Confidential | ❌ | ✅ |
| Transfer fees | ❌ | ✅ |
| Interest bearing | ❌ | ✅ |

**Gotcha:** You must use the correct program for each token!

```rust
// Check which program a mint uses
if mint.to_account_info().owner == &spl_token::ID {
    // SPL Token
} else if mint.to_account_info().owner == &spl_token_2022::ID {
    // Token-2022
}
```

---

## 8. Versioned Transactions & Lookup Tables

Legacy transactions have limits. Use v0 transactions for complex DeFi.

| Type | Max Accounts | Use Case |
|------|--------------|----------|
| Legacy | ~35 | Simple transfers |
| v0 + ALT | 256 | Complex DeFi, swaps |

**Address Lookup Tables (ALTs):**
```typescript
// Create lookup table
const [createIx, lookupTableAddress] = AddressLookupTableProgram.createLookupTable({
    authority: payer.publicKey,
    payer: payer.publicKey,
    recentSlot: slot,
});

// Extend with addresses
const extendIx = AddressLookupTableProgram.extendLookupTable({
    lookupTable: lookupTableAddress,
    authority: payer.publicKey,
    payer: payer.publicKey,
    addresses: [address1, address2, ...],
});
```

---

## 9. Clock Sysvar for Time

Solana doesn't have `block.timestamp` like Ethereum. Use the Clock sysvar.

```rust
use anchor_lang::solana_program::clock::Clock;

let clock = Clock::get()?;
let current_timestamp = clock.unix_timestamp;  // i64, seconds since epoch
let current_slot = clock.slot;
```

**Gotcha:** Timestamps are set by validators and can drift slightly. Don't rely on sub-second precision.

---

## 10. Signature Verification

Unlike Ethereum's `ecrecover`, Solana uses Ed25519.

```rust
// Check if an account signed the transaction
#[account(signer)]
pub authority: AccountInfo<'info>,

// Or with Anchor constraint
#[account(
    constraint = authority.key() == expected_signer @ ErrorCode::InvalidAuthority
)]
```

**For arbitrary message verification:**
```rust
use anchor_lang::solana_program::ed25519_program;
// Use Ed25519 program for signature verification
```

---

## Quick Reference Card

| Gotcha | Remember |
|--------|----------|
| Accounts | Programs are stateless; data lives in accounts |
| PDAs | Deterministic, no private key, programs can sign |
| Token accounts | Separate from wallet, need ATAs |
| Rent | Pay 2 years upfront = rent-exempt |
| CPIs | Max 4 depth, pass all accounts |
| Compute | 200k default, 1.4M max, no refund |
| Token-2022 | Different program ID than SPL Token |
| Transactions | Use v0 + ALTs for complex operations |
| Time | Clock sysvar, not block.timestamp |
| Signatures | Ed25519, not secp256k1 |
