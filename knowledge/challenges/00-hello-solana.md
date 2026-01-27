# Challenge 0: Hello Solana

## TLDR

Your first step into Solana development - create an Anchor program that stores and updates a message. This challenge introduces the fundamental concepts of accounts, instructions, and the Anchor framework.

## Core Concepts

### What You're Building

A simple "Hello World" program that:
1. Initializes an account to store a message
2. Allows updating the message
3. Demonstrates the Solana account model

### Key Mechanics

1. **Programs Are Stateless**: Unlike Ethereum contracts, Solana programs don't store data internally. All data lives in separate accounts.

2. **Accounts Hold Everything**: 
   - Your message? Stored in an account.
   - User balance? Stored in an account.
   - Configuration? Stored in an account.

3. **Instructions = Function Calls**: Each "function" in your program is an instruction that operates on accounts.

### The Development Flow

```
1. Define account structures (#[account])
2. Define instruction contexts (#[derive(Accounts)])
3. Write instruction handlers (pub fn)
4. Build and deploy (anchor build && anchor deploy)
5. Test with TypeScript/Rust tests
```

## Project Setup

```bash
# Create new Anchor project
anchor init hello_solana
cd hello_solana

# Start local validator (in separate terminal)
solana-test-validator

# Configure for localhost
solana config set --url localhost

# Build the program
anchor build

# Run tests
anchor test
```

## Code Walkthrough

### 1. Define the Account Structure

```rust
// programs/hello_solana/src/lib.rs

use anchor_lang::prelude::*;

declare_id!("YOUR_PROGRAM_ID_HERE");

#[program]
pub mod hello_solana {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, message: String) -> Result<()> {
        let hello_account = &mut ctx.accounts.hello_account;
        hello_account.message = message;
        hello_account.bump = ctx.bumps.hello_account;
        Ok(())
    }

    pub fn update(ctx: Context<Update>, new_message: String) -> Result<()> {
        let hello_account = &mut ctx.accounts.hello_account;
        hello_account.message = new_message;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + 4 + 200 + 1,  // discriminator + string len + max chars + bump
        seeds = [b"hello", user.key().as_ref()],
        bump
    )]
    pub hello_account: Account<'info, HelloAccount>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Update<'info> {
    #[account(
        mut,
        seeds = [b"hello", user.key().as_ref()],
        bump = hello_account.bump
    )]
    pub hello_account: Account<'info, HelloAccount>,
    
    pub user: Signer<'info>,
}

#[account]
pub struct HelloAccount {
    pub message: String,
    pub bump: u8,
}
```

### 2. Understanding the Code

**`declare_id!`**: Your program's unique address on Solana. Generated when you run `anchor build`.

**`#[program]`**: Marks the module containing your instructions.

**`#[derive(Accounts)]`**: Defines what accounts an instruction needs. Anchor validates these automatically!

**`#[account]`**: Defines the structure of data stored in an account.

**Account Constraints:**
- `init` - Create new account
- `payer = user` - Who pays for rent
- `space = ...` - How many bytes to allocate
- `seeds = [...]` - PDA derivation seeds
- `bump` - PDA bump seed
- `mut` - Account will be modified

### 3. The Test File

```typescript
// tests/hello_solana.ts

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { HelloSolana } from "../target/types/hello_solana";
import { expect } from "chai";

describe("hello_solana", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.HelloSolana as Program<HelloSolana>;
  const user = provider.wallet;

  // Derive the PDA
  const [helloAccountPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("hello"), user.publicKey.toBuffer()],
    program.programId
  );

  it("Initializes with a message", async () => {
    const tx = await program.methods
      .initialize("Hello, Solana!")
      .accounts({
        helloAccount: helloAccountPda,
        user: user.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("Initialize tx:", tx);

    // Fetch the account
    const account = await program.account.helloAccount.fetch(helloAccountPda);
    expect(account.message).to.equal("Hello, Solana!");
  });

  it("Updates the message", async () => {
    const tx = await program.methods
      .update("Updated message!")
      .accounts({
        helloAccount: helloAccountPda,
        user: user.publicKey,
      })
      .rpc();

    console.log("Update tx:", tx);

    const account = await program.account.helloAccount.fetch(helloAccountPda);
    expect(account.message).to.equal("Updated message!");
  });
});
```

## Security Considerations

Even in this simple program, there are security aspects:

1. **PDA Ownership**: Only the original user can update their message (seeds include user's pubkey)

2. **Signer Validation**: Anchor's `Signer<'info>` ensures the user actually signed the transaction

3. **Space Calculation**: Always calculate exact space needed:
   ```
   8 (discriminator) + 4 (string length) + 200 (max string bytes) + 1 (bump) = 213 bytes
   ```

4. **Rent-Exemption**: `init` automatically makes accounts rent-exempt

## Common Gotchas

### 1. Forgetting the Discriminator
```
❌ space = 4 + 200 + 1  // Missing 8-byte discriminator!
✅ space = 8 + 4 + 200 + 1
```

### 2. String Space Calculation
Strings in Borsh serialization need 4 bytes for length + actual bytes:
```rust
// For a String with max 200 characters
space = 4 + 200  // 4 for length prefix, 200 for content
```

### 3. Missing System Program
When creating accounts, you MUST pass the System Program:
```rust
pub system_program: Program<'info, System>,
```

### 4. PDA Seeds Must Be Unique
If two users could create the same PDA, you have a collision:
```rust
// ❌ Bad: same PDA for everyone
seeds = [b"hello"]

// ✅ Good: unique per user
seeds = [b"hello", user.key().as_ref()]
```

## What You've Learned

After completing this challenge, you understand:

- [x] Solana programs are stateless - data lives in accounts
- [x] Anchor's account validation macros
- [x] PDA derivation with seeds and bump
- [x] Space calculation for accounts
- [x] Writing and running Anchor tests

## Next Steps

Move on to **Challenge 1: SPL Token** to learn how tokens work on Solana!

## Builder Checklist

- [ ] Created Anchor project with `anchor init`
- [ ] Defined account structure with `#[account]`
- [ ] Implemented `initialize` instruction
- [ ] Implemented `update` instruction
- [ ] Calculated correct space for account
- [ ] Used PDA for account address
- [ ] Wrote passing tests
- [ ] Deployed to localnet
- [ ] (Bonus) Deployed to devnet
