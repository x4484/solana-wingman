# Token-2022 (Token Extensions)

## TLDR

Token-2022 is the next-gen SPL Token with built-in extensions: transfer fees, interest-bearing tokens, non-transferable tokens, and more. Use it when you need features beyond basic transfers.

## Why Token-2022?

| Feature | SPL Token | Token-2022 |
|---------|-----------|------------|
| Transfer fees | ❌ | ✅ |
| Interest-bearing | ❌ | ✅ |
| Non-transferable (soulbound) | ❌ | ✅ |
| Permanent delegate | ❌ | ✅ |
| Confidential transfers | ❌ | ✅ |
| Memo required | ❌ | ✅ |
| Built-in metadata | ❌ | ✅ |
| Default account state | ❌ | ✅ |

## Extensions Overview

```
┌─────────────────────────────────────────────────────────┐
│               Token-2022 Extensions                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  MINT EXTENSIONS:                                       │
│  ├── TransferFee: Take fee on every transfer           │
│  ├── InterestBearing: Accrue interest over time        │
│  ├── NonTransferable: Soulbound tokens                 │
│  ├── PermanentDelegate: Protocol can always move       │
│  ├── MintCloseAuthority: Can close empty mint          │
│  ├── MetadataPointer: Built-in metadata                │
│  └── ConfidentialTransfer: Encrypted amounts           │
│                                                         │
│  ACCOUNT EXTENSIONS:                                    │
│  ├── MemoTransfer: Require memo on inbound transfers   │
│  ├── ImmutableOwner: Can't change owner                │
│  ├── DefaultAccountState: Frozen by default            │
│  └── CpiGuard: Restrict CPI calls                      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Code Examples

### Create Token with Transfer Fee

```typescript
import {
  createInitializeTransferFeeConfigInstruction,
  createInitializeMintInstruction,
  ExtensionType,
  getMintLen,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";

async function createTokenWithFee(
  feeBps: number,      // e.g., 100 = 1%
  maxFee: bigint,      // Max fee per transfer
  feeAuthority: PublicKey
) {
  const mintKeypair = Keypair.generate();
  
  // Calculate space needed
  const extensions = [ExtensionType.TransferFeeConfig];
  const mintLen = getMintLen(extensions);
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  const tx = new Transaction().add(
    // Create account
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    // Initialize transfer fee config
    createInitializeTransferFeeConfigInstruction(
      mintKeypair.publicKey,
      feeAuthority,          // Who can change fee
      feeAuthority,          // Who can withdraw fees
      feeBps,                // Fee in basis points
      maxFee,                // Maximum fee
      TOKEN_2022_PROGRAM_ID
    ),
    // Initialize mint
    createInitializeMintInstruction(
      mintKeypair.publicKey,
      6,                     // Decimals
      mintAuthority,
      freezeAuthority,
      TOKEN_2022_PROGRAM_ID
    )
  );

  await sendAndConfirmTransaction(connection, tx, [payer, mintKeypair]);
  return mintKeypair.publicKey;
}

// Create token with 1% fee, max 1000 tokens
const mint = await createTokenWithFee(100, BigInt(1000_000_000), authority);
```

### Transfer with Fee

```typescript
import {
  transferCheckedWithFee,
  getTransferFeeConfig,
} from "@solana/spl-token";

async function transferWithFee(
  from: PublicKey,
  to: PublicKey,
  amount: bigint
) {
  // Get fee config
  const mintInfo = await getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
  const feeConfig = getTransferFeeConfig(mintInfo);
  
  // Calculate fee
  const fee = (amount * BigInt(feeConfig.newerTransferFee.transferFeeBasisPoints)) / 10000n;
  const actualFee = fee > feeConfig.newerTransferFee.maximumFee 
    ? feeConfig.newerTransferFee.maximumFee 
    : fee;

  await transferCheckedWithFee(
    connection,
    payer,
    from,
    mint,
    to,
    owner,
    amount,
    6,           // Decimals
    actualFee,   // Fee amount
    [],          // Multisig signers
    undefined,   // Confirm options
    TOKEN_2022_PROGRAM_ID
  );
}
```

### Harvest/Withdraw Transfer Fees

```typescript
import {
  harvestWithheldTokensToMint,
  withdrawWithheldTokensFromMint,
} from "@solana/spl-token";

// Step 1: Collect fees from token accounts to mint
await harvestWithheldTokensToMint(
  connection,
  payer,
  mint,
  [tokenAccount1, tokenAccount2],  // Accounts with withheld fees
  undefined,
  TOKEN_2022_PROGRAM_ID
);

// Step 2: Withdraw collected fees from mint
await withdrawWithheldTokensFromMint(
  connection,
  payer,
  mint,
  feeReceiverAta,    // Where to send fees
  withdrawAuthority,
  [],
  undefined,
  TOKEN_2022_PROGRAM_ID
);
```

### Interest-Bearing Token

```typescript
import {
  createInitializeInterestBearingMintInstruction,
  updateRateInterestBearingMint,
  amountToUiAmount,
} from "@solana/spl-token";

// Initialize mint with interest
const extensions = [ExtensionType.InterestBearingConfig];
const mintLen = getMintLen(extensions);

const tx = new Transaction().add(
  SystemProgram.createAccount({...}),
  createInitializeInterestBearingMintInstruction(
    mintKeypair.publicKey,
    rateAuthority,
    500,  // 5% annual rate (basis points)
    TOKEN_2022_PROGRAM_ID
  ),
  createInitializeMintInstruction(...)
);

// Later: update interest rate
await updateRateInterestBearingMint(
  connection,
  payer,
  mint,
  rateAuthority,
  750,  // 7.5% new rate
  [],
  undefined,
  TOKEN_2022_PROGRAM_ID
);

// Get UI amount (includes accrued interest)
const displayAmount = amountToUiAmount(amount, mintInfo);
```

### Non-Transferable (Soulbound)

```typescript
import {
  createInitializeNonTransferableMintInstruction,
} from "@solana/spl-token";

// Tokens CANNOT be transferred after minting
const tx = new Transaction().add(
  SystemProgram.createAccount({...}),
  createInitializeNonTransferableMintInstruction(
    mintKeypair.publicKey,
    TOKEN_2022_PROGRAM_ID
  ),
  createInitializeMintInstruction(...)
);

// Transfers will fail - tokens are locked to original recipient
```

### Built-in Metadata

```typescript
import {
  createInitializeMetadataPointerInstruction,
  createInitializeInstruction as createInitializeMetadataInstruction,
} from "@solana/spl-token";

const extensions = [ExtensionType.MetadataPointer];

const tx = new Transaction().add(
  SystemProgram.createAccount({...}),
  createInitializeMetadataPointerInstruction(
    mintKeypair.publicKey,
    updateAuthority,
    mintKeypair.publicKey,  // Metadata stored on mint itself
    TOKEN_2022_PROGRAM_ID
  ),
  createInitializeMintInstruction(...),
  createInitializeMetadataInstruction({
    mint: mintKeypair.publicKey,
    metadata: mintKeypair.publicKey,
    mintAuthority: mintAuthority.publicKey,
    name: "My Token",
    symbol: "MTK",
    uri: "https://example.com/metadata.json",
    programId: TOKEN_2022_PROGRAM_ID,
  })
);
```

## Key Addresses

```typescript
const TOKEN_2022 = {
  PROGRAM_ID: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  
  // ATA program works with both Token and Token-2022
  ATA_PROGRAM: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
};
```

## Anchor Integration

```rust
use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022, TransferChecked};
use anchor_spl::token_interface::{Mint, TokenAccount};

#[derive(Accounts)]
pub struct TransferWithFee<'info> {
    #[account(mut)]
    pub from: InterfaceAccount<'info, TokenAccount>,
    
    #[account(mut)]
    pub to: InterfaceAccount<'info, TokenAccount>,
    
    pub mint: InterfaceAccount<'info, Mint>,
    
    pub authority: Signer<'info>,
    
    pub token_program: Program<'info, Token2022>,
}

pub fn transfer(ctx: Context<TransferWithFee>, amount: u64) -> Result<()> {
    let cpi_accounts = TransferChecked {
        from: ctx.accounts.from.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.to.to_account_info(),
        authority: ctx.accounts.authority.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    
    token_2022::transfer_checked(
        CpiContext::new(cpi_program, cpi_accounts),
        amount,
        ctx.accounts.mint.decimals,
    )
}
```

## Common Mistakes

### ❌ Using Wrong Program ID

```typescript
// WRONG: Using SPL Token program ID
await transfer(..., TOKEN_PROGRAM_ID); // ❌ Fails for Token-2022 tokens!

// RIGHT: Use Token-2022 program
await transfer(..., TOKEN_2022_PROGRAM_ID); // ✅
```

### ❌ Not Accounting for Transfer Fee

```typescript
// WRONG: Expecting recipient to get full amount
await transfer(from, to, 1000);
// Recipient gets 1000 - fee, not 1000!

// RIGHT: Calculate fee and adjust
const feeConfig = getTransferFeeConfig(mintInfo);
const fee = calculateFee(amount, feeConfig);
const netAmount = amount - fee;
```

### ❌ Forgetting Extension Space

```typescript
// WRONG: Using standard mint length
const mintLen = 82; // ❌ Base mint only!

// RIGHT: Calculate with extensions
const extensions = [ExtensionType.TransferFeeConfig, ExtensionType.MetadataPointer];
const mintLen = getMintLen(extensions); // ✅ Includes extension space
```

## Extension Compatibility

| Extension | Jupiter | Raydium | MarginFi | Orca |
|-----------|---------|---------|----------|------|
| TransferFee | ✅ | ⚠️ | ❌ | ✅ |
| InterestBearing | ⚠️ | ❌ | ❌ | ⚠️ |
| NonTransferable | N/A | N/A | N/A | N/A |
| Metadata | ✅ | ✅ | ✅ | ✅ |

**⚠️** = Partial support, test thoroughly

## Resources

- **Docs**: https://spl.solana.com/token-2022
- **Extension Guide**: https://spl.solana.com/token-2022/extensions
- **SDK**: @solana/spl-token (same package, different functions)

## Related

- **[../challenges/05-token-2022.md](../challenges/05-token-2022.md)** - Build with extensions
- **[./spl-token.md](./spl-token.md)** - Original token standard
