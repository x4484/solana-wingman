# Transactions & Instructions

## TLDR

A transaction is a bundle of instructions that execute atomically - all succeed or all fail. Each instruction calls a program with specific accounts. Understanding transaction anatomy helps you design efficient programs, debug failures, and avoid hitting compute/size limits.

## Core Concepts

### Transaction Anatomy

```
┌─────────────────────────────────────────────────────────┐
│                     Transaction                         │
├─────────────────────────────────────────────────────────┤
│  Signatures: [sig1, sig2, ...]                         │
│  (All signers must sign before submission)              │
├─────────────────────────────────────────────────────────┤
│  Message:                                               │
│  ├── Header                                             │
│  │   ├── num_required_signatures                       │
│  │   ├── num_readonly_signed_accounts                  │
│  │   └── num_readonly_unsigned_accounts                │
│  ├── Account Keys: [key1, key2, ...]                   │
│  ├── Recent Blockhash                                   │
│  └── Instructions: [ix1, ix2, ...]                     │
└─────────────────────────────────────────────────────────┘

Each Instruction:
┌─────────────────────────────────────────────────────────┐
│  program_id_index: u8 (which program to call)          │
│  account_indexes: [u8] (which accounts to pass)        │
│  data: [u8] (instruction data/arguments)               │
└─────────────────────────────────────────────────────────┘
```

### Signers vs Non-Signers

```rust
// Signer: Must sign the transaction
#[account(mut)]
pub user: Signer<'info>,  // ✅ Proves ownership/authorization

// Non-signer: Just data being read or modified
pub config: Account<'info, Config>,  // No signature required

// PDA: Can "sign" via program
#[account(
    seeds = [b"vault"],
    bump
)]
pub vault: Account<'info, Vault>,  // Program signs in CPI
```

### Writable vs Readonly

| Type | Writable | Can Modify | Parallel Execution |
|------|----------|------------|-------------------|
| `mut` | Yes | Yes | No (exclusive lock) |
| readonly | No | No | Yes (shared lock) |

```rust
#[account(mut)]  // Writable - will modify this account
pub user_profile: Account<'info, Profile>,

#[account()]     // Readonly - just reading
pub config: Account<'info, Config>,
```

### Compute Units

Every instruction has a compute budget:

| Limit | Default | Max |
|-------|---------|-----|
| Compute Units | 200,000 | 1,400,000 |
| Heap Size | 32 KB | 256 KB |
| Stack Depth | 64 | 64 |
| Call Depth (CPI) | 4 | 4 |

```rust
// Expensive operations:
// - Logging (msg!)
// - Serialization/deserialization
// - CPI calls
// - Cryptographic operations (verify signature, hash)

// Request more compute if needed (client-side):
const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
  units: 400_000
});
```

## Code Examples

### Building a Transaction (Client)

```typescript
import {
  Connection,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const connection = new Connection("https://api.devnet.solana.com");

// Create instructions
const ix1 = await program.methods
  .initialize()
  .accounts({ ... })
  .instruction();

const ix2 = await program.methods
  .doSomething(42)
  .accounts({ ... })
  .instruction();

// Bundle into transaction
const tx = new Transaction().add(ix1, ix2);

// Send and confirm
const signature = await sendAndConfirmTransaction(
  connection,
  tx,
  [payer, otherSigner]
);
```

### Versioned Transactions (V0)

```typescript
import {
  TransactionMessage,
  VersionedTransaction,
  AddressLookupTableAccount,
} from "@solana/web3.js";

// Lookup tables allow more accounts (up to 256 vs 35)
const lookupTableAccount = await connection
  .getAddressLookupTable(lookupTableAddress)
  .then(res => res.value);

// Build V0 message
const messageV0 = new TransactionMessage({
  payerKey: payer.publicKey,
  recentBlockhash: blockhash,
  instructions: [ix1, ix2, ix3],
}).compileToV0Message([lookupTableAccount]);

// Create versioned transaction
const txV0 = new VersionedTransaction(messageV0);
txV0.sign([payer]);

// Send
const sig = await connection.sendTransaction(txV0);
```

### Requesting Compute Budget

```typescript
import { ComputeBudgetProgram } from "@solana/web3.js";

// Request more compute units
const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
  units: 400_000,
});

// Set priority fee (for faster inclusion)
const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
  microLamports: 1000,  // 0.001 lamports per CU
});

const tx = new Transaction()
  .add(modifyComputeUnits)
  .add(addPriorityFee)
  .add(yourInstruction);
```

### Anchor Instruction Handler

```rust
use anchor_lang::prelude::*;

#[program]
pub mod my_program {
    use super::*;
    
    pub fn transfer_tokens(
        ctx: Context<TransferTokens>,
        amount: u64,
    ) -> Result<()> {
        // Validate
        require!(amount > 0, MyError::InvalidAmount);
        
        // Execute
        let from = &mut ctx.accounts.from;
        let to = &mut ctx.accounts.to;
        
        from.balance = from.balance.checked_sub(amount)
            .ok_or(MyError::InsufficientFunds)?;
        to.balance = to.balance.checked_add(amount)
            .ok_or(MyError::Overflow)?;
        
        // Log for indexers
        msg!("Transferred {} tokens", amount);
        
        Ok(())
    }
}

#[derive(Accounts)]
pub struct TransferTokens<'info> {
    #[account(mut, has_one = owner)]
    pub from: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub to: Account<'info, TokenAccount>,
    
    pub owner: Signer<'info>,
}
```

## Common Mistakes

### ❌ Transaction Too Large

```typescript
// WRONG: Too many accounts (legacy tx limit: ~35 accounts)
const tx = new Transaction().add(
  ix1, ix2, ix3, ix4, ix5, ...  // With 50+ accounts total
);  // ❌ Transaction too large

// RIGHT: Use versioned transactions with lookup tables
const messageV0 = new TransactionMessage({...})
  .compileToV0Message([lookupTable]);  // ✅ Up to 256 accounts
```

### ❌ Running Out of Compute

```rust
// WRONG: Heavy operations without compute budget
for i in 0..1000 {
    msg!("Processing {}", i);  // ❌ Each msg! costs ~100 CU
}

// RIGHT: Minimize logging, request more compute
// Client-side: add ComputeBudgetProgram.setComputeUnitLimit
// Program-side: batch operations, reduce logging
```

### ❌ Missing Signers

```typescript
// WRONG: Forgot to sign
const tx = new Transaction().add(ix);
await sendAndConfirmTransaction(connection, tx, [payer]);
// ❌ Fails if ix requires another signer

// RIGHT: Include all required signers
await sendAndConfirmTransaction(connection, tx, [payer, authority, otherSigner]);
```

### ❌ Stale Blockhash

```typescript
// WRONG: Using old blockhash
const { blockhash } = await connection.getLatestBlockhash();
// ... time passes (> 150 blocks ≈ 60 seconds)
await sendAndConfirmTransaction(...);  // ❌ Blockhash expired

// RIGHT: Get fresh blockhash just before sending
const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
tx.recentBlockhash = blockhash;
await sendAndConfirmTransaction(...);
```

### ❌ Not Handling Partial Failures

```rust
// All instructions in a transaction are atomic
// But if you're doing multiple transactions...

// WRONG: Assuming all txs succeed
await sendTx(tx1);
await sendTx(tx2);  // If this fails, tx1 already committed!

// RIGHT: Design for failure, use atomic operations when possible
// Or implement rollback logic
```

## Transaction Lifecycle

```
1. Build     → Create instructions, set accounts
2. Sign      → All signers add signatures  
3. Submit    → Send to RPC node
4. Process   → Leader validates, executes
5. Confirm   → Wait for commitment level
     │
     ├── processed: Seen by connected node
     ├── confirmed: Voted on by supermajority  
     └── finalized: ~32 slots old, irreversible
```

## Priority Fees

```typescript
// Calculate priority fee based on recent fees
const recentFees = await connection.getRecentPrioritizationFees();
const avgFee = recentFees.reduce((a, b) => a + b.prioritizationFee, 0) / recentFees.length;

// Set competitive fee
const priorityFee = ComputeBudgetProgram.setComputeUnitPrice({
  microLamports: Math.ceil(avgFee * 1.2),  // 20% above average
});
```

## Related Challenges

- **[00-hello-solana](../challenges/00-hello-solana.md)** - Basic instructions
- **[03-pda-escrow](../challenges/03-pda-escrow.md)** - Multi-instruction flows
- **[09-blinks-actions](../challenges/09-blinks-actions.md)** - Transaction URLs

## Key Takeaways

1. **Atomic execution** - All instructions succeed or all fail
2. **Signers must sign** - No signature = no authorization
3. **Compute is limited** - 200K default, 1.4M max per tx
4. **Versioned transactions** - Use V0 for more accounts (lookup tables)
5. **Priority fees** - Pay more for faster inclusion during congestion
6. **Blockhash expires** - ~60 seconds validity window
