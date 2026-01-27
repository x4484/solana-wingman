# Historical Solana Exploits

## TLDR

Learn from others' expensive mistakes. These exploits cost hundreds of millions of dollars and exposed patterns every Solana developer should understand. Each hack teaches a lesson that applies to your code today.

## Why Study Hacks?

```
┌─────────────────────────────────────────────────────────┐
│               The Value of Postmortems                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Wormhole: $320M          "Verify all signatures"      │
│  Mango Markets: $100M     "Don't trust single oracle"  │
│  Cashio: $50M             "Validate all input accounts"│
│  Crema Finance: $9M       "Check account ownership"    │
│                                                         │
│  Total lost: ~$500M+                                   │
│  Your lesson cost: $0 (just read this doc)             │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Major Exploits

---

### Wormhole Bridge ($320M) - February 2022

**The Largest Solana Hack**

**What happened:**
Wormhole is a cross-chain bridge. An attacker minted 120,000 wETH on Solana without depositing ETH on Ethereum.

**Root cause:**
The Solana program used a deprecated function (`load_instruction_at`) that didn't verify if the instruction actually came from the System Program. The attacker crafted a fake "verification" instruction.

**The vulnerable pattern:**
```rust
// VULNERABLE: Assumed instruction came from trusted source
let instruction = load_instruction_at(instruction_index, ...)?;
// Attacker could inject their own instruction that "verified" the guardian signatures
```

**The fix:**
```rust
// SECURE: Verify the instruction's program ID
let instruction = load_instruction_at_checked(instruction_index, ...)?;
require!(
    instruction.program_id == expected_program_id,
    ErrorCode::InvalidInstruction
);
```

**Your lesson:**
- Never trust instruction data without verifying its source
- Use `load_instruction_at_checked` not `load_instruction_at`
- Verify program IDs on all cross-program data

---

### Mango Markets ($100M) - October 2022

**Oracle Manipulation**

**What happened:**
Attacker manipulated MNGO token price on spot markets (low liquidity), then used inflated collateral value to borrow $100M+ across all assets.

**Root cause:**
Mango used spot price as collateral value without TWAP (Time-Weighted Average Price) or circuit breakers. Low-liquidity tokens could be manipulated.

**The vulnerable pattern:**
```rust
// VULNERABLE: Using instant spot price
let collateral_value = token_amount * oracle.get_price()?;
let borrow_limit = collateral_value * collateral_factor;
```

**The fix:**
```rust
// SECURE: Use TWAP and price bands
let current_price = oracle.get_price()?;
let twap_price = oracle.get_twap(3600)?;  // 1-hour TWAP

// Reject if price deviates too much from TWAP
let deviation = (current_price - twap_price).abs() / twap_price;
require!(deviation < MAX_DEVIATION, ErrorCode::PriceManipulation);

// Use more conservative price for borrowing
let safe_price = std::cmp::min(current_price, twap_price);
```

**Your lesson:**
- Never use spot prices for high-stakes decisions
- Implement TWAP for oracle prices
- Add circuit breakers for unusual price movements
- Consider liquidity when setting collateral factors

---

### Cashio ($50M) - March 2022

**Account Validation Bypass**

**What happened:**
Cashio's stablecoin protocol failed to validate that collateral accounts were actually legitimate. Attacker created fake accounts that passed superficial checks.

**Root cause:**
Checked that accounts had correct structure but not correct content/authority.

**The vulnerable pattern:**
```rust
// VULNERABLE: Only checking account type, not ownership
#[derive(Accounts)]
pub struct MintCash<'info> {
    pub collateral: Account<'info, TokenAccount>,  // Is it real collateral?
    // Missing: constraint to verify this is the REAL collateral vault
}
```

**The fix:**
```rust
// SECURE: Verify account relationships
#[derive(Accounts)]
pub struct MintCash<'info> {
    #[account(
        constraint = collateral.mint == config.accepted_collateral_mint,
        constraint = collateral.owner == vault_authority.key(),
    )]
    pub collateral: Account<'info, TokenAccount>,
    
    #[account(
        seeds = [b"vault_authority"],
        bump = config.vault_authority_bump,
    )]
    pub vault_authority: AccountInfo<'info>,
    
    #[account(
        constraint = config.is_initialized,
        constraint = !config.is_paused,
    )]
    pub config: Account<'info, Config>,
}
```

**Your lesson:**
- Validate EVERY account relationship
- Check ownership, not just structure
- Use PDAs for trusted authority accounts
- Never trust accounts just because they have the right type

---

### Slope Wallet ($8M) - August 2022

**Seed Phrase Logging**

**What happened:**
Slope wallet logged users' seed phrases to a centralized server. Server was compromised, attackers drained 9,000+ wallets.

**Root cause:**
Logging sensitive data that should never leave the client.

**The anti-pattern:**
```javascript
// NEVER DO THIS
console.log("User mnemonic:", mnemonic);
analytics.track("wallet_created", { seed: mnemonic });  // ❌❌❌
```

**Your lesson:**
- Never log secrets (seed phrases, private keys)
- Audit your logging code
- Treat mnemonics as radioactive
- For wallet apps: keep secrets client-side only

---

### Crema Finance ($9M) - July 2022

**Fake Account Injection**

**What happened:**
Attacker passed a fake tick account (DEX order book data) that wasn't validated, allowing them to manipulate swap calculations.

**Root cause:**
Program accepted account without verifying it was created by the program or derived correctly.

**The vulnerable pattern:**
```rust
// VULNERABLE: No verification of tick account origin
pub fn swap(ctx: Context<Swap>, amount: u64) -> Result<()> {
    let tick_data = &ctx.accounts.tick_account;  // Could be attacker-controlled!
    // ... used tick_data for price calculations
}
```

**The fix:**
```rust
// SECURE: Verify account is PDA owned by program
#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(
        seeds = [
            b"tick",
            pool.key().as_ref(),
            &tick_index.to_le_bytes()
        ],
        bump = tick_account.bump,
        constraint = tick_account.pool == pool.key(),
    )]
    pub tick_account: Account<'info, TickAccount>,
}
```

**Your lesson:**
- Use PDAs for all program-owned data
- Verify account derivation matches expected seeds
- Don't accept arbitrary accounts for critical calculations

---

### Solend (Donation Attack) ($1.26M) - November 2022

**Precision Loss Exploit**

**What happened:**
Attacker "donated" tokens to a lending pool, inflating share price. Due to rounding, small deposits got 0 shares while attacker redeemed their pre-existing shares at inflated value.

**Root cause:**
Integer division truncation in share calculation.

**The vulnerable pattern:**
```rust
// VULNERABLE: Integer division loses precision
let shares = (deposit_amount * total_shares) / total_assets;
// If total_assets is huge (after donation), shares rounds to 0
```

**The fix:**
```rust
// SECURE: Use higher precision, check for dust
let shares = u128::from(deposit_amount)
    .checked_mul(u128::from(total_shares))
    .ok_or(ErrorCode::Overflow)?
    .checked_div(u128::from(total_assets))
    .ok_or(ErrorCode::DivByZero)?;

// Reject if shares would be zero (dust attack protection)
require!(shares > 0, ErrorCode::DepositTooSmall);

// Consider minimum deposit requirements
require!(deposit_amount >= MIN_DEPOSIT, ErrorCode::BelowMinimum);
```

**Your lesson:**
- Use higher precision (u128) for intermediate calculations
- Check for zero results from division
- Implement minimum deposit amounts
- Consider share price manipulation vectors

---

## Vulnerability Categories

### 1. Missing Signer Verification
```rust
// ❌ VULNERABLE
pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
    // Anyone can call this!
}

// ✅ SECURE
#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut, has_one = authority)]
    pub vault: Account<'info, Vault>,
    pub authority: Signer<'info>,  // MUST sign
}
```

### 2. Missing Ownership Check
```rust
// ❌ VULNERABLE
pub account: Account<'info, SomeType>,  // Owned by... who?

// ✅ SECURE
#[account(constraint = account.owner == expected_owner.key())]
pub account: Account<'info, SomeType>,
```

### 3. Integer Overflow
```rust
// ❌ VULNERABLE
let total = amount1 + amount2;  // Can overflow!

// ✅ SECURE
let total = amount1.checked_add(amount2).ok_or(ErrorCode::Overflow)?;
```

### 4. Reentrancy (Yes, Even on Solana)
```rust
// ❌ VULNERABLE (state updated after CPI)
token::transfer(...)?;  // External call
vault.balance -= amount;  // State update AFTER

// ✅ SECURE (Checks-Effects-Interactions)
vault.balance -= amount;  // State update FIRST
token::transfer(...)?;    // External call LAST
```

### 5. Account Confusion
```rust
// ❌ VULNERABLE
pub account_a: Account<'info, TypeA>,
pub account_b: Account<'info, TypeA>,  // Could pass same account twice!

// ✅ SECURE
#[account(constraint = account_a.key() != account_b.key())]
pub account_a: Account<'info, TypeA>,
pub account_b: Account<'info, TypeA>,
```

## Security Checklist (From Hacks)

- [ ] All accounts validated (owner, seeds, relationships)
- [ ] All signers required are checked
- [ ] No accounts can be duplicated when they shouldn't be
- [ ] Arithmetic uses checked operations
- [ ] Oracle prices use TWAP or multiple sources
- [ ] State updates happen BEFORE external calls
- [ ] No sensitive data in logs
- [ ] Minimum amounts enforced to prevent dust attacks
- [ ] Account discriminators verified
- [ ] Program IDs verified on CPIs

## Resources

- **Neodyme Blog**: https://blog.neodyme.io - Security research
- **Rekt News**: https://rekt.news - Exploit postmortems
- **Solana Security TXT**: https://github.com/ArcticGrey/solana-security-txt
- **Sec3 Blog**: https://www.sec3.dev/blog - Audit insights

## Related Challenges

- **[03-pda-escrow](../challenges/03-pda-escrow.md)** - Safe escrow patterns
- **[07-oracle-pyth](../challenges/07-oracle-pyth.md)** - Oracle best practices
- **[08-amm-swap](../challenges/08-amm-swap.md)** - DEX security patterns
