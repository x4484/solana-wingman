---
name: solana-security-auditor
description: Audit Anchor programs for common vulnerabilities. Reentrancy, PDA collisions, missing signer checks, and pre-deploy security checklists.
triggers:
  - audit solana
  - solana security
  - anchor vulnerability
  - smart contract audit
  - program exploit
  - sealevel attack
  - account validation
  - PDA collision
  - reentrancy solana
  - CPI safety
metadata: {"clawdbot":{"emoji":"🛡️","homepage":"https://github.com/x4484/Solana-Security-Auditor"}}
---

# Solana Security Auditor

Systematic security review skill for Solana/Anchor programs.

## Audit Workflow

When asked to audit a program:

1. **Scope** - Identify all instructions and accounts
2. **Access Control** - Check signer/authority requirements
3. **Account Validation** - Verify constraints and ownership
4. **PDA Safety** - Review seeds and bump handling
5. **Arithmetic** - Check for overflow/precision issues
6. **CPI Safety** - Analyze cross-program invocations
7. **State Management** - Review initialization and closing

## Critical Checks

### 1. Missing Signer Checks
```rust
// ❌ VULNERABLE - No authority verification
pub fn admin_action(ctx: Context<AdminAction>) -> Result<()> {
    // Anyone can call
}

// ✅ SAFE
#[derive(Accounts)]
pub struct AdminAction<'info> {
    #[account(has_one = admin)]
    pub config: Account<'info, Config>,
    pub admin: Signer<'info>,
}
```

### 2. Missing Owner Checks
```rust
// VULNERABLE - raw AccountInfo, no ownership check
/// CHECK: unchecked
pub user_data: UncheckedAccount<'info>,

// SAFE - Account<> verifies owner automatically
pub user_data: Account<'info, UserData>,
```

### 3. PDA Seed Collisions
```rust
// VULNERABLE - generic prefix risks collisions
seeds = [b"vault", user.key().as_ref()]

// SAFER - unique prefix prevents cross-instruction collisions
seeds = [b"user_vault", user.key().as_ref()]
bump = vault.bump,  // Store and reuse canonical bump
```

### 4. Reinitialization
```rust
// RISKY - init_if_needed allows reinitialization of closed accounts
#[account(init_if_needed, payer = user, space = 8 + 64)]
pub data: Account<'info, Data>,

// SAFE - init prevents reinitialization entirely
#[account(init, payer = user, space = 8 + 64)]
pub data: Account<'info, Data>,
```

### 5. Arithmetic Overflow
```rust
// VULNERABLE
let total = amount1 + amount2;  // Can overflow

// SAFE
let total = amount1.checked_add(amount2).ok_or(ErrorCode::Overflow)?;
```

> **Note:** Anchor enables `overflow-checks = true` in release builds by default,
> so basic arithmetic (`+`, `-`, `*`) panics on overflow instead of wrapping.
> However, `checked_*` is still preferred because panics produce unhelpful
> error messages to users, while explicit error handling gives actionable context.

### 6. Closing Accounts Safely
```rust
// Anchor's close zeroes data and transfers lamports automatically
#[account(mut, close = recipient)]
pub data: Account<'info, Data>,

// REMAINING RISK: Within the same transaction, another instruction
// can refund lamports to "revive" the closed account.
// Anchor sets CLOSED_ACCOUNT_DISCRIMINATOR to mitigate this.
```

### 7. Type Cosplay / Account Confusion
```rust
// ❌ VULNERABLE - Wrong account type accepted
pub vault: AccountInfo<'info>,

// ✅ SAFE - Strong typing
pub vault: Account<'info, Vault>,
```

### 8. Arbitrary CPI
```rust
// VULNERABLE - Arbitrary program called
invoke(&ix, &accounts)?;

// SAFE - Verify program ID
require_keys_eq!(
    ctx.accounts.token_program.key(),
    spl_token::ID,
    ErrorCode::InvalidProgram
);
```

### 9. Remaining Lamports Attack (Account Revival)
```rust
// VULNERABLE - Closed account can be revived in same transaction
// if another instruction refunds its lamports before tx ends
#[account(mut, close = recipient)]
pub data: Account<'info, Data>,

// SAFER - Check discriminator on all account reads
// Anchor does this automatically with CLOSED_ACCOUNT_DISCRIMINATOR
```

### 10. Account Reloading After CPI
```rust
// VULNERABLE - stale data after CPI
invoke(&transfer_ix, &accounts)?;
// vault_account still has old balance in memory!
let balance = vault_account.amount; // STALE

// SAFE - reload after CPI
invoke(&transfer_ix, &accounts)?;
ctx.accounts.vault_account.reload()?;
let balance = ctx.accounts.vault_account.amount; // FRESH
```

### 11. Duplicate Account Passing
```rust
// VULNERABLE - same account passed for two params
pub fn transfer(ctx: Context<Transfer>) -> Result<()> {
    // If source == destination, tokens appear from thin air
}

// SAFE - verify accounts are different
require_keys_neq!(
    ctx.accounts.source.key(),
    ctx.accounts.destination.key(),
    ErrorCode::DuplicateAccounts
);
```

### 12. Cross-Program Reentrancy
```rust
// Solana prevents recursive reentrancy (A calls A)
// But cross-program reentrancy is possible (A calls B calls A)
// Apply checks-effects-interactions pattern:
// 1. Validate all inputs (checks)
// 2. Update state (effects)
// 3. Make CPIs last (interactions)
```

## Pre-Deploy Checklist

- [ ] All instructions have appropriate signer checks
- [ ] All accounts validated with correct owner
- [ ] PDA seeds are unique and collision-resistant
- [ ] Bump seeds stored and reused (not recalculated)
- [ ] No arithmetic overflow possible (use checked_*)
- [ ] Accounts closed safely (close constraint used)
- [ ] CPI targets verified
- [ ] No reinitialization vulnerabilities (no unguarded init_if_needed)
- [ ] Closed accounts protected from revival (discriminator checked)
- [ ] Account data reloaded after CPIs that mutate state
- [ ] No duplicate account passing exploits (source != destination)
- [ ] Checks-effects-interactions pattern followed for CPI calls
- [ ] Error codes are descriptive
- [ ] Events emitted for important state changes
- [ ] Admin functions have timelock/multisig (if applicable)
- [ ] Upgrade authority handled appropriately
- [ ] Tests cover edge cases and attack vectors

## Severity Levels

- **CRITICAL** - Direct fund loss, privilege escalation
- **HIGH** - Potential fund loss under specific conditions
- **MEDIUM** - Griefing, DoS, or economic issues
- **LOW** - Best practice violations, code quality
- **INFO** - Suggestions, optimizations

## Output Format

When reporting findings:

```
## [SEVERITY] Finding Title

**Location:** `program/src/instructions/withdraw.rs:45`

**Description:** Brief explanation of the vulnerability

**Impact:** What an attacker could do

**Recommendation:** How to fix it

**Code:**
\`\`\`rust
// Before (vulnerable)
...

// After (fixed)
...
\`\`\`
```

## References

- [Sealevel Attacks](https://github.com/coral-xyz/sealevel-attacks) - Common vulnerability patterns (archived, still useful)
- [Anchor Security](https://www.anchor-lang.com/docs/references/security-exploits)
- [Solana Security Best Practices](https://solana.com/docs/programs/security)
- [Helius Security Guide](https://www.helius.dev/blog/a-hitchhikers-guide-to-solana-program-security)
- [Neodyme Audits](https://blog.neodyme.io/) - Real-world exploit writeups

## Cross-References

- `../../knowledge/gotchas/historical-hacks.md` - Real-world exploit case studies
- `../../tools/security/pre-production-checklist.md` - Full pre-deploy checklist
