# Audit Mode

## When to Use

Activate audit mode when the user wants to:
- Review code for security issues
- Prepare for a security audit
- Check for vulnerabilities
- Validate before mainnet deployment

**Trigger phrases:**
- "review this for security"
- "audit this code"
- "is this safe?"
- "check for vulnerabilities"
- "what could go wrong?"
- "prepare for audit"

## Behavior

In audit mode, prioritize:

1. **Assume adversarial users** - What if inputs are malicious?
2. **Check every assumption** - Verify, don't trust
3. **Document findings** - Clear severity levels
4. **Suggest fixes** - Don't just point out problems

## Security Checklist

### Account Validation
- [ ] All accounts have appropriate constraints
- [ ] PDAs verified with correct seeds
- [ ] `has_one` checks for ownership
- [ ] No duplicate account vulnerabilities
- [ ] Token accounts validated (mint, authority)

### Signer Checks
- [ ] All required signers are Signer type
- [ ] Authority patterns correctly implemented
- [ ] No missing signer checks on sensitive operations

### Arithmetic
- [ ] All math uses checked operations
- [ ] Overflow/underflow impossible or handled
- [ ] Division by zero handled
- [ ] Precision loss considered

### Economic Security
- [ ] Oracle prices validated (staleness, deviation)
- [ ] Slippage protection in place
- [ ] Flash loan resistance if applicable
- [ ] MEV considerations addressed

### Access Control
- [ ] Admin functions properly gated
- [ ] Upgrade authority secured
- [ ] Pause mechanism exists (if appropriate)

## Severity Levels

| Level | Description | Action |
|-------|-------------|--------|
| 🔴 **Critical** | Funds at immediate risk | Block deployment |
| 🟠 **High** | Significant vulnerability | Must fix before mainnet |
| 🟡 **Medium** | Potential issue under specific conditions | Should fix |
| 🟢 **Low** | Minor issues, best practice violations | Consider fixing |
| ℹ️ **Info** | Suggestions, gas optimizations | Optional |

## Review Format

For each finding:

```markdown
### [SEVERITY] Finding Title

**Location:** `lib.rs:42` or `TransferInstruction`

**Description:** 
What the issue is.

**Impact:**
What could happen if exploited.

**Recommendation:**
```rust
// Before (vulnerable)
account.amount = amount;

// After (fixed)
account.amount = account.amount.checked_add(amount)
    .ok_or(ErrorCode::Overflow)?;
```
```

## Common Vulnerabilities to Check

### Missing Signer Check
```rust
// VULNERABLE
pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
    // Anyone can call this!
}

// SECURE
#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut, has_one = authority)]
    pub vault: Account<'info, Vault>,
    pub authority: Signer<'info>,  // Must sign
}
```

### Integer Overflow
```rust
// VULNERABLE
let total = amount1 + amount2;

// SECURE
let total = amount1.checked_add(amount2).ok_or(ErrorCode::Overflow)?;
```

### Missing Account Ownership Check
```rust
// VULNERABLE - anyone's token account could be passed
pub token_account: Account<'info, TokenAccount>,

// SECURE - verify ownership
#[account(
    token::mint = expected_mint,
    token::authority = expected_owner,
)]
pub token_account: Account<'info, TokenAccount>,
```

### Reentrancy
```rust
// VULNERABLE - state updated after CPI
token::transfer(ctx, amount)?;
vault.balance -= amount;

// SECURE - Checks-Effects-Interactions
vault.balance -= amount;  // Update state first
token::transfer(ctx, amount)?;  // External call last
```

## Example Interaction

**User:** "Review this escrow program for security"

**Audit Mode Response:**
```markdown
## Security Audit: Escrow Program

### Summary
Reviewed 3 instructions across 150 lines.
Found: 1 High, 2 Medium, 1 Low severity issues.

### 🟠 HIGH: Missing signer check in cancel()

**Location:** `cancel` instruction

**Description:** 
The cancel function doesn't verify that the caller is the escrow maker.

**Impact:**
Anyone can cancel any escrow and steal deposited funds.

**Recommendation:**
[code fix]

---

### 🟡 MEDIUM: Unchecked arithmetic in calculate_fee()

[... continue for each finding ...]
```

## When to Exit Audit Mode

Switch to another mode when:
- All findings addressed and user says "build the fix" → **Build Mode**
- User wants to understand the issues → **Learn Mode**
- User wants to optimize the fixes → **Optimize Mode**

## Thoroughness Over Speed

In audit mode:
- Read every line of code
- Question every assumption
- Consider edge cases
- Think like an attacker
- Document everything

The goal is **security** - find issues before attackers do.
