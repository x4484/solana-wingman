# Challenge 1: SPL Token

## TLDR

Create and manage your own fungible token on Solana. Learn the SPL Token program, minting, token accounts, and the critical concept of Associated Token Accounts (ATAs).

## Core Concepts

### What You're Building

A program that:
1. Creates a new token mint
2. Mints tokens to users
3. Allows token transfers
4. Demonstrates the SPL Token standard

### Key Mechanics

1. **Token Mint**: The "factory" that creates tokens. Defines decimals and authorities.

2. **Token Accounts**: Separate accounts that hold token balances. Each wallet needs one per token type!

3. **Associated Token Accounts (ATAs)**: Deterministic token accounts derived from wallet + mint. The standard way to hold tokens.

4. **Authorities**:
   - **Mint Authority**: Can create new tokens
   - **Freeze Authority**: Can freeze token accounts
   - **Owner**: Can transfer tokens from their account

### The Mental Model

```
                    ┌─────────────────┐
                    │   Token Mint    │
                    │  (decimals: 9)  │
                    │  mint_authority │
                    └────────┬────────┘
                             │ mints to
            ┌────────────────┼────────────────┐
            ▼                ▼                ▼
    ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
    │  Alice's ATA  │ │  Bob's ATA    │ │ Program Vault │
    │  balance: 100 │ │  balance: 50  │ │  balance: 1M  │
    │  owner: Alice │ │  owner: Bob   │ │  owner: PDA   │
    └───────────────┘ └───────────────┘ └───────────────┘
```

## Project Setup

```bash
# Add SPL token dependencies to Cargo.toml
[dependencies]
anchor-lang = "0.30.0"
anchor-spl = "0.30.0"
```

## Code Walkthrough

### 1. Create a Token Mint

```rust
use anchor_lang::prelude::*;
use anchor_spl::{
    token::{Mint, Token, TokenAccount, MintTo, Transfer},
    associated_token::AssociatedToken,
};

declare_id!("YOUR_PROGRAM_ID");

#[program]
pub mod spl_token_example {
    use super::*;

    pub fn create_mint(ctx: Context<CreateMint>, decimals: u8) -> Result<()> {
        // Mint is initialized by Anchor's `init` constraint
        // We just need to log success
        msg!("Token mint created with {} decimals", decimals);
        Ok(())
    }

    pub fn mint_tokens(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
        let cpi_accounts = MintTo {
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.token_account.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        
        anchor_spl::token::mint_to(cpi_ctx, amount)?;
        
        msg!("Minted {} tokens", amount);
        Ok(())
    }

    pub fn transfer_tokens(ctx: Context<TransferTokens>, amount: u64) -> Result<()> {
        let cpi_accounts = Transfer {
            from: ctx.accounts.from.to_account_info(),
            to: ctx.accounts.to.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        
        anchor_spl::token::transfer(cpi_ctx, amount)?;
        
        msg!("Transferred {} tokens", amount);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateMint<'info> {
    #[account(
        init,
        payer = payer,
        mint::decimals = 9,
        mint::authority = authority,
        mint::freeze_authority = authority,
    )]
    pub mint: Account<'info, Mint>,
    
    /// CHECK: This is the mint authority
    pub authority: AccountInfo<'info>,
    
    #[account(mut)]
    pub payer: Signer<'info>,
    
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct MintTokens<'info> {
    #[account(mut)]
    pub mint: Account<'info, Mint>,
    
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = recipient,
    )]
    pub token_account: Account<'info, TokenAccount>,
    
    /// CHECK: Token recipient
    pub recipient: AccountInfo<'info>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(mut)]
    pub payer: Signer<'info>,
    
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
pub struct TransferTokens<'info> {
    #[account(mut)]
    pub from: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub to: Account<'info, TokenAccount>,
    
    pub authority: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}
```

### 2. Understanding Decimals

Solana tokens use integer math. Decimals are just display formatting.

```
Token with 9 decimals:
- 1 token = 1,000,000,000 (1e9) smallest units
- 0.5 tokens = 500,000,000 smallest units

Token with 6 decimals (like USDC):
- 1 token = 1,000,000 (1e6) smallest units
- 0.01 tokens = 10,000 smallest units
```

**Gotcha**: Always work with the smallest unit in your program!

```rust
// ❌ Wrong: trying to mint "1.5 tokens"
let amount = 1.5;  // Rust doesn't allow this for u64!

// ✅ Correct: mint 1.5 tokens worth of smallest units (9 decimals)
let amount: u64 = 1_500_000_000;  // 1.5 * 10^9
```

### 3. ATAs vs Custom Token Accounts

**Associated Token Accounts (ATAs)** - Recommended:
```rust
#[account(
    init_if_needed,
    payer = payer,
    associated_token::mint = mint,
    associated_token::authority = owner,
)]
pub token_account: Account<'info, TokenAccount>,
```

**Custom Token Accounts** - For advanced use cases:
```rust
#[account(
    init,
    payer = payer,
    token::mint = mint,
    token::authority = custom_authority,
)]
pub custom_token_account: Account<'info, TokenAccount>,
```

### 4. The Test File

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { 
    getAssociatedTokenAddress, 
    getAccount,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID 
} from "@solana/spl-token";
import { expect } from "chai";

describe("spl_token_example", () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const program = anchor.workspace.SplTokenExample as Program;
    
    const mintKeypair = anchor.web3.Keypair.generate();
    const user = provider.wallet;
    
    it("Creates a token mint", async () => {
        await program.methods
            .createMint(9)  // 9 decimals
            .accounts({
                mint: mintKeypair.publicKey,
                authority: user.publicKey,
                payer: user.publicKey,
            })
            .signers([mintKeypair])
            .rpc();
            
        const mintAccount = await provider.connection.getAccountInfo(
            mintKeypair.publicKey
        );
        expect(mintAccount).to.not.be.null;
    });
    
    it("Mints tokens to user", async () => {
        const ata = await getAssociatedTokenAddress(
            mintKeypair.publicKey,
            user.publicKey
        );
        
        const amount = new anchor.BN(1_000_000_000); // 1 token
        
        await program.methods
            .mintTokens(amount)
            .accounts({
                mint: mintKeypair.publicKey,
                tokenAccount: ata,
                recipient: user.publicKey,
                authority: user.publicKey,
                payer: user.publicKey,
            })
            .rpc();
            
        const tokenAccount = await getAccount(provider.connection, ata);
        expect(tokenAccount.amount.toString()).to.equal("1000000000");
    });
});
```

## Security Considerations

1. **Mint Authority Control**: Whoever holds mint authority can create unlimited tokens
   ```rust
   // Consider removing mint authority after initial supply
   anchor_spl::token::set_authority(
       cpi_ctx,
       AuthorityType::MintTokens,
       None,  // Remove authority forever
   )?;
   ```

2. **Freeze Authority**: Can freeze any token account - use carefully or remove

3. **Token Account Ownership**: Only the owner can transfer tokens out

4. **Decimal Precision**: Always document expected decimals, check them!

## Common Gotchas

### 1. Token Account vs Wallet
```
❌ "Send tokens to 7abc..."  // This is a wallet address!
✅ "Send tokens to the ATA of 7abc... for mint xyz..."
```

### 2. ATA Doesn't Exist Yet
```rust
// ❌ Will fail if ATA doesn't exist
#[account(mut)]
pub token_account: Account<'info, TokenAccount>,

// ✅ Creates ATA if needed
#[account(
    init_if_needed,
    payer = payer,
    associated_token::mint = mint,
    associated_token::authority = owner,
)]
pub token_account: Account<'info, TokenAccount>,
```

### 3. Wrong Decimal Handling
```rust
// User wants to send 1.5 USDC (6 decimals)
// ❌ Wrong
let amount = 1;  // This is 0.000001 USDC!

// ✅ Correct  
let amount = 1_500_000;  // 1.5 * 10^6
```

### 4. Missing Associated Token Program
When creating ATAs:
```rust
pub associated_token_program: Program<'info, AssociatedToken>,
```

## What You've Learned

- [x] SPL Token program basics
- [x] Creating token mints
- [x] Minting tokens via CPI
- [x] Token accounts vs wallets
- [x] Associated Token Accounts (ATAs)
- [x] Decimal handling
- [x] Token transfers

## Next Steps

**Challenge 2: NFT Metaplex** - Create NFTs using the Metaplex standard!

## Builder Checklist

- [ ] Created token mint with custom decimals
- [ ] Minted tokens to an ATA
- [ ] Transferred tokens between accounts
- [ ] Handled decimal calculations correctly
- [ ] Used `init_if_needed` for ATAs
- [ ] Wrote passing tests
- [ ] (Bonus) Created a token with fixed supply (removed mint authority)
