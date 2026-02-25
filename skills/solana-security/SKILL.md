---
name: solana-security-auditor
description: Audit Anchor programs for common vulnerabilities. Reentrancy, PDA collisions, missing signer checks, and pre-deploy security checklists.
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
// ❌ VULNERABLE - Accepts any account
pub fn process(ctx: Context<Process>) -> Result<()> {
    let data = &ctx.accounts.user_data;
    // Could be wrong program's account!
}

// ✅ SAFE - Anchor checks owner automatically
#[derive(Accounts)]
pub struct Process<'info> {
    #[account(owner = crate::ID)]  // Explicit, or use Account<>
    pub user_data: Account<'info, UserData>,
}
```

### 3. PDA Seed Collisions
```rust
// ❌ VULNERABLE - Seeds could collide
seeds = [b"vault", user.key().as_ref()]

// ✅ SAFER - Include discriminator
seeds = [b"user_vault", user.key().as_ref(), &[bump]]
```

### 4. Reinitialization
```rust
// ❌ VULNERABLE - Can reinitialize
#[account(init, ...)]
pub data: Account<'info, Data>,

// ✅ SAFE - Use init_if_needed carefully or check is_initialized
#[account(
    init,
    constraint = !data.is_initialized @ ErrorCode::AlreadyInitialized,
    ...
)]
```

### 5. Arithmetic Overflow
```rust
// ❌ VULNERABLE
let total = amount1 + amount2;  // Can overflow

// ✅ SAFE
let total = amount1.checked_add(amount2).ok_or(ErrorCode::Overflow)?;
```

### 6. Closing Accounts Safely
```rust
// ❌ VULNERABLE - Data still accessible in same tx
#[account(mut, close = recipient)]
pub data: Account<'info, Data>,

// ✅ SAFER - Zero out data before closing
data.is_initialized = false;
// Then close
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
// ❌ VULNERABLE - Arbitrary program called
invoke(&ix, &accounts)?;

// ✅ SAFE - Verify program ID
require_keys_eq!(
    ctx.accounts.token_program.key(),
    spl_token::ID,
    ErrorCode::InvalidProgram
);
```

## Pre-Deploy Checklist

- [ ] All instructions have appropriate signer checks
- [ ] All accounts validated with correct owner
- [ ] PDA seeds are unique and collision-resistant
- [ ] Bump seeds stored and reused (not recalculated)
- [ ] No arithmetic overflow possible (use checked_*)
- [ ] Accounts closed safely with data zeroed
- [ ] CPI targets verified
- [ ] No reinitialization vulnerabilities
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

- [Sealevel Attacks](https://github.com/coral-xyz/sealevel-attacks) - Common vulnerability patterns
- [Anchor Security](https://book.anchor-lang.com/anchor_in_depth/security.html)
- [Solana Security Best Practices](https://solana.com/docs/programs/security)
- [Neodyme Audits](https://blog.neodyme.io/) - Real-world exploit writeups
