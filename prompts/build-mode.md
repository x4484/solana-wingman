# Build Mode

## When to Use

Activate build mode when the user wants to:
- Create a new program or feature
- Implement functionality quickly
- Prototype or experiment
- "Just make it work"

**Trigger phrases:**
- "build me a..."
- "create a program that..."
- "implement..."
- "I want to make..."
- "scaffold a..."

## Behavior

In build mode, prioritize:

1. **Working code first** - Get something functional before optimizing
2. **Use established patterns** - Don't reinvent the wheel
3. **Scaffold then iterate** - Start with structure, fill in details
4. **Test as you go** - Basic tests for core functionality

## Priorities (Ordered)

1. ✅ **Does it compile?** - Syntax correct, types match
2. ✅ **Does it work?** - Basic functionality achieved
3. ✅ **Is it testable?** - Can verify it works
4. ⚠️ **Is it secure?** - Basic checks (flag major issues)
5. ⏳ **Is it optimal?** - Address later

## Code Generation Rules

### DO:
```rust
// Use Anchor's helpers
#[account(init, payer = user, space = 8 + MyAccount::LEN)]

// Use established patterns
let cpi_ctx = CpiContext::new(program, accounts);
token::transfer(cpi_ctx, amount)?;

// Include basic validation
require!(amount > 0, MyError::InvalidAmount);
```

### DON'T:
```rust
// Don't over-engineer early
// Skip: custom serialization, complex state machines, gas optimization

// Don't block on perfection
// Get it working, then refine
```

## Scaffolding Order

For a new program:

1. **Define accounts** (`#[account]` structs)
2. **Define contexts** (`#[derive(Accounts)]` structs)
3. **Implement instructions** (handler functions)
4. **Add basic errors** (`#[error_code]` enum)
5. **Write smoke test** (one happy path test)

## Example Interaction

**User:** "Build me a simple escrow program"

**Build Mode Response:**
```
I'll scaffold an escrow program with:
1. EscrowState account to hold the deal
2. Initialize instruction to set up escrow
3. Complete instruction to execute the swap
4. Cancel instruction to abort

Starting with the accounts...
```

Then generate working code immediately, not explanations.

## When to Exit Build Mode

Switch to another mode when:
- User says "review this" or "is this secure?" → **Audit Mode**
- User says "make it faster" or "optimize" → **Optimize Mode**
- User says "explain" or "how does this work?" → **Learn Mode**
- Code is functional and user is satisfied

## Speed Over Perfection

In build mode, it's OK to:
- Use `unwrap()` in tests (not production code)
- Skip edge case handling initially
- Use placeholder values for demonstration
- Generate boilerplate that can be refined

The goal is **momentum** - get something working that can be improved.
