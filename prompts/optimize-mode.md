# Optimize Mode

## When to Use

Activate optimize mode when the user wants to:
- Reduce compute unit usage
- Minimize account sizes
- Improve transaction efficiency
- Lower costs for users

**Trigger phrases:**
- "optimize this"
- "make it faster"
- "reduce compute units"
- "it's using too much CU"
- "make it cheaper"
- "fit in one transaction"

## Behavior

In optimize mode, prioritize:

1. **Measure first** - Know current CU usage before optimizing
2. **Low-hanging fruit** - Easy wins first
3. **Maintain correctness** - Don't break functionality
4. **Document tradeoffs** - What are you sacrificing?

## Optimization Priorities

1. ✅ **Reduce CPI calls** - Each CPI is expensive
2. ✅ **Minimize account size** - Less rent, faster serialization
3. ✅ **Use zero-copy for large accounts** - Avoid heap allocation
4. ✅ **Batch operations** - One tx instead of many
5. ⚠️ **Reduce logging** - Each `msg!` costs CU

## Compute Unit Reference

| Operation | Approximate CU |
|-----------|---------------|
| Basic instruction | ~1,000 |
| Simple account read | ~100 |
| Account write | ~1,000 |
| CPI call | ~1,000-5,000 |
| Token transfer CPI | ~4,000 |
| `msg!` logging | ~100 per call |
| SHA256 hash | ~85 per 64 bytes |
| Ed25519 verify | ~25,000 |

## Optimization Techniques

### 1. Reduce Account Size

```rust
// BEFORE: Wastes space
#[account]
pub struct UserState {
    pub authority: Pubkey,        // 32 bytes
    pub name: String,             // Variable - hard to predict
    pub created_at: i64,          // 8 bytes
    pub is_active: bool,          // 1 byte
    pub padding: [u8; 256],       // 256 bytes wasted!
}

// AFTER: Right-sized
#[account]
pub struct UserState {
    pub authority: Pubkey,        // 32 bytes
    pub name: [u8; 32],           // Fixed 32 bytes
    pub created_at: i64,          // 8 bytes
    pub flags: u8,                // 1 byte (use bits for bools)
}
// Saved: ~250 bytes
```

### 2. Zero-Copy for Large Accounts

```rust
// BEFORE: Copies entire account to heap
#[account]
pub struct LargeState {
    pub data: [u64; 1000],  // 8KB - expensive to copy!
}

// AFTER: Zero-copy, direct memory access
#[account(zero_copy)]
#[repr(C)]
pub struct LargeState {
    pub data: [u64; 1000],  // Direct access, no copy
}

// Use AccountLoader instead of Account
pub large: AccountLoader<'info, LargeState>,
```

### 3. Batch CPI Calls

```rust
// BEFORE: Multiple transactions
// tx1: transfer A
// tx2: transfer B  
// tx3: transfer C

// AFTER: Single transaction with multiple CPIs
pub fn batch_transfer(ctx: Context<BatchTransfer>, amounts: Vec<u64>) -> Result<()> {
    for (i, amount) in amounts.iter().enumerate() {
        // All transfers in one tx
        token::transfer(ctx.accounts.get_cpi_context(i), *amount)?;
    }
    Ok(())
}
```

### 4. Reduce Logging

```rust
// BEFORE: Verbose logging
msg!("Starting transfer");
msg!("Amount: {}", amount);
msg!("From: {}", from.key());
msg!("To: {}", to.key());
msg!("Transfer complete");
// ~500 CU wasted

// AFTER: Minimal logging (or use events)
emit!(TransferEvent { from, to, amount });
// Or no logging at all in production
```

### 5. Use Native Programs Efficiently

```rust
// BEFORE: Manual SOL transfer
let ix = system_instruction::transfer(from, to, amount);
invoke(&ix, accounts)?;  // CPI overhead

// AFTER: Direct lamport manipulation (when you own both accounts)
**from.try_borrow_mut_lamports()? -= amount;
**to.try_borrow_mut_lamports()? += amount;
// No CPI needed!
```

### 6. Reuse PDA Calculations

```rust
// BEFORE: Derive PDA in every instruction
let (pda, bump) = Pubkey::find_program_address(&seeds, &program_id);

// AFTER: Store bump, use create_program_address
let pda = Pubkey::create_program_address(
    &[seeds, &[stored_bump]],
    &program_id
)?;
// Saves ~1,500 CU per derivation
```

## Measurement

Always measure before and after:

```typescript
// Get compute units used
const simulation = await program.methods
  .myInstruction()
  .accounts({...})
  .simulate();

console.log("Compute units:", simulation.unitsConsumed);
```

```bash
# Or check in logs
solana logs | grep "consumed"
```

## Optimization Report Format

```markdown
## Optimization Summary

### Before
- Compute units: 85,000
- Account size: 1,024 bytes
- Transactions needed: 3

### After
- Compute units: 42,000 (↓51%)
- Account size: 256 bytes (↓75%)
- Transactions needed: 1 (↓67%)

### Changes Made
1. Switched to zero-copy for state account
2. Batched token transfers into single tx
3. Removed debug logging
4. Stored PDA bump instead of recalculating
```

## When to Exit Optimize Mode

Switch to another mode when:
- User wants to add new features → **Build Mode**
- User wants security review of changes → **Audit Mode**
- User wants to understand the optimizations → **Learn Mode**

## Correctness Over Speed

In optimize mode:
- Don't sacrifice security for performance
- Test after every optimization
- Keep changes reversible
- Document what you changed and why

The goal is **efficiency** - do the same work with less resources.
