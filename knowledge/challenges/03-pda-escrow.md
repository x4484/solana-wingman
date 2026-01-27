# Challenge 3: PDA Escrow

## TLDR

Build an escrow program that holds tokens until conditions are met. This challenge teaches you to truly master PDAs - the most important pattern in Solana development.

## Core Concepts

### What You're Building

A token escrow where:
1. Alice deposits Token A, wants Token B
2. Bob deposits Token B, wants Token A
3. Program swaps automatically when both sides are funded
4. Either party can cancel before completion

### Why PDAs Are Essential

PDAs (Program Derived Addresses) solve the "who holds the money?" problem:

```
❌ Without PDAs:
   - Someone's wallet must hold escrow funds
   - That person could run away with the money
   - No trustless custody possible

✅ With PDAs:
   - Program-owned account holds funds
   - No private key exists
   - Only program logic can release funds
   - Truly trustless!
```

### The Escrow Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    ESCROW STATE (PDA)                    │
│  seeds = ["escrow", maker.key()]                        │
├─────────────────────────────────────────────────────────┤
│  maker: Pubkey          │  Alice's wallet               │
│  maker_token_a: Pubkey  │  Token A mint                 │
│  taker_token_b: Pubkey  │  Token B mint she wants       │
│  amount_a: u64          │  How much A she's offering    │
│  amount_b: u64          │  How much B she wants         │
│  bump: u8               │  PDA bump seed                │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    VAULT (PDA Token Account)             │
│  seeds = ["vault", escrow.key()]                        │
├─────────────────────────────────────────────────────────┤
│  mint: Token A                                          │
│  owner: vault_authority PDA                             │
│  amount: 100 Token A (Alice's deposit)                  │
└─────────────────────────────────────────────────────────┘
```

## Code Walkthrough

### 1. The Full Escrow Program

```rust
use anchor_lang::prelude::*;
use anchor_spl::{
    token::{Mint, Token, TokenAccount, Transfer, CloseAccount},
    associated_token::AssociatedToken,
};

declare_id!("YOUR_PROGRAM_ID");

#[program]
pub mod escrow {
    use super::*;

    /// Maker creates an escrow, depositing Token A
    pub fn make(
        ctx: Context<Make>,
        amount_a: u64,      // Amount of Token A to deposit
        amount_b: u64,      // Amount of Token B wanted
    ) -> Result<()> {
        // Initialize escrow state
        let escrow = &mut ctx.accounts.escrow;
        escrow.maker = ctx.accounts.maker.key();
        escrow.mint_a = ctx.accounts.mint_a.key();
        escrow.mint_b = ctx.accounts.mint_b.key();
        escrow.amount_a = amount_a;
        escrow.amount_b = amount_b;
        escrow.bump = ctx.bumps.escrow;
        escrow.vault_bump = ctx.bumps.vault;

        // Transfer Token A from maker to vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.maker_ata_a.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.maker.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
        );
        anchor_spl::token::transfer(cpi_ctx, amount_a)?;

        msg!("Escrow created! Deposited {} Token A", amount_a);
        Ok(())
    }

    /// Taker completes the escrow by providing Token B
    pub fn take(ctx: Context<Take>) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        
        // Transfer Token B from taker to maker
        let cpi_accounts = Transfer {
            from: ctx.accounts.taker_ata_b.to_account_info(),
            to: ctx.accounts.maker_ata_b.to_account_info(),
            authority: ctx.accounts.taker.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
        );
        anchor_spl::token::transfer(cpi_ctx, escrow.amount_b)?;

        // Transfer Token A from vault to taker (PDA signs!)
        let maker_key = ctx.accounts.maker.key();
        let seeds = &[
            b"escrow",
            maker_key.as_ref(),
            &[escrow.bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.taker_ata_a.to_account_info(),
            authority: ctx.accounts.escrow.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );
        anchor_spl::token::transfer(cpi_ctx, escrow.amount_a)?;

        // Close vault and return rent to maker
        let cpi_accounts = CloseAccount {
            account: ctx.accounts.vault.to_account_info(),
            destination: ctx.accounts.maker.to_account_info(),
            authority: ctx.accounts.escrow.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );
        anchor_spl::token::close_account(cpi_ctx)?;

        msg!("Escrow completed! Swapped tokens successfully");
        Ok(())
    }

    /// Maker cancels the escrow and gets Token A back
    pub fn cancel(ctx: Context<Cancel>) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        
        // Return Token A from vault to maker (PDA signs!)
        let maker_key = ctx.accounts.maker.key();
        let seeds = &[
            b"escrow",
            maker_key.as_ref(),
            &[escrow.bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.maker_ata_a.to_account_info(),
            authority: ctx.accounts.escrow.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );
        anchor_spl::token::transfer(cpi_ctx, ctx.accounts.vault.amount)?;

        // Close vault
        let cpi_accounts = CloseAccount {
            account: ctx.accounts.vault.to_account_info(),
            destination: ctx.accounts.maker.to_account_info(),
            authority: ctx.accounts.escrow.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );
        anchor_spl::token::close_account(cpi_ctx)?;

        msg!("Escrow cancelled! Tokens returned to maker");
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Make<'info> {
    #[account(
        init,
        payer = maker,
        space = 8 + Escrow::INIT_SPACE,
        seeds = [b"escrow", maker.key().as_ref()],
        bump
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        init,
        payer = maker,
        seeds = [b"vault", escrow.key().as_ref()],
        bump,
        token::mint = mint_a,
        token::authority = escrow,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub mint_a: Account<'info, Mint>,
    pub mint_b: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint_a,
        associated_token::authority = maker,
    )]
    pub maker_ata_a: Account<'info, TokenAccount>,

    #[account(mut)]
    pub maker: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Take<'info> {
    #[account(
        mut,
        close = maker,
        seeds = [b"escrow", maker.key().as_ref()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        mut,
        seeds = [b"vault", escrow.key().as_ref()],
        bump = escrow.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub mint_a: Account<'info, Mint>,
    pub mint_b: Account<'info, Mint>,

    #[account(
        init_if_needed,
        payer = taker,
        associated_token::mint = mint_a,
        associated_token::authority = taker,
    )]
    pub taker_ata_a: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint_b,
        associated_token::authority = taker,
    )]
    pub taker_ata_b: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = taker,
        associated_token::mint = mint_b,
        associated_token::authority = maker,
    )]
    pub maker_ata_b: Account<'info, TokenAccount>,

    /// CHECK: Maker receives rent back
    #[account(mut)]
    pub maker: AccountInfo<'info>,

    #[account(mut)]
    pub taker: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Cancel<'info> {
    #[account(
        mut,
        close = maker,
        seeds = [b"escrow", maker.key().as_ref()],
        bump = escrow.bump,
        has_one = maker,
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        mut,
        seeds = [b"vault", escrow.key().as_ref()],
        bump = escrow.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = escrow.mint_a,
        associated_token::authority = maker,
    )]
    pub maker_ata_a: Account<'info, TokenAccount>,

    #[account(mut)]
    pub maker: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[account]
#[derive(InitSpace)]
pub struct Escrow {
    pub maker: Pubkey,
    pub mint_a: Pubkey,
    pub mint_b: Pubkey,
    pub amount_a: u64,
    pub amount_b: u64,
    pub bump: u8,
    pub vault_bump: u8,
}
```

### 2. Understanding PDA Signing

The magic happens when the escrow PDA "signs" to release tokens:

```rust
// The PDA seeds - same as used to derive the address
let seeds = &[
    b"escrow",
    maker_key.as_ref(),
    &[escrow.bump],  // The bump makes it a valid PDA
];
let signer_seeds = &[&seeds[..]];

// CpiContext::new_with_signer allows PDA to "sign"
let cpi_ctx = CpiContext::new_with_signer(
    token_program,
    transfer_accounts,
    signer_seeds,  // <-- This is the "signature"
);
```

**How it works:**
1. Runtime re-derives PDA from seeds + program ID
2. If derived address matches the "signer", it's valid
3. No private key involved - pure math!

### 3. Test File

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Escrow } from "../target/types/escrow";
import {
    createMint,
    createAccount,
    mintTo,
    getAccount,
} from "@solana/spl-token";
import { expect } from "chai";

describe("escrow", () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const program = anchor.workspace.Escrow as Program<Escrow>;

    const maker = anchor.web3.Keypair.generate();
    const taker = anchor.web3.Keypair.generate();
    
    let mintA: anchor.web3.PublicKey;
    let mintB: anchor.web3.PublicKey;
    let makerAtaA: anchor.web3.PublicKey;
    let takerAtaB: anchor.web3.PublicKey;

    before(async () => {
        // Airdrop SOL to maker and taker
        await provider.connection.confirmTransaction(
            await provider.connection.requestAirdrop(
                maker.publicKey,
                2 * anchor.web3.LAMPORTS_PER_SOL
            )
        );
        await provider.connection.confirmTransaction(
            await provider.connection.requestAirdrop(
                taker.publicKey,
                2 * anchor.web3.LAMPORTS_PER_SOL
            )
        );

        // Create mints
        mintA = await createMint(
            provider.connection,
            maker,
            maker.publicKey,
            null,
            6
        );
        mintB = await createMint(
            provider.connection,
            taker,
            taker.publicKey,
            null,
            6
        );

        // Create token accounts and mint
        makerAtaA = await createAccount(
            provider.connection,
            maker,
            mintA,
            maker.publicKey
        );
        await mintTo(
            provider.connection,
            maker,
            mintA,
            makerAtaA,
            maker,
            1000_000_000 // 1000 tokens
        );

        takerAtaB = await createAccount(
            provider.connection,
            taker,
            mintB,
            taker.publicKey
        );
        await mintTo(
            provider.connection,
            taker,
            mintB,
            takerAtaB,
            taker,
            500_000_000 // 500 tokens
        );
    });

    it("Makes and takes escrow", async () => {
        const [escrowPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("escrow"), maker.publicKey.toBuffer()],
            program.programId
        );
        const [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("vault"), escrowPda.toBuffer()],
            program.programId
        );

        // Make escrow: offer 100 Token A for 50 Token B
        await program.methods
            .make(new anchor.BN(100_000_000), new anchor.BN(50_000_000))
            .accounts({
                escrow: escrowPda,
                vault: vaultPda,
                mintA,
                mintB,
                makerAtaA,
                maker: maker.publicKey,
            })
            .signers([maker])
            .rpc();

        // Verify vault received tokens
        const vaultAccount = await getAccount(provider.connection, vaultPda);
        expect(vaultAccount.amount.toString()).to.equal("100000000");

        // Take escrow
        // ... (complete the take instruction)
    });
});
```

## Security Considerations

1. **PDA Authority**: Vault is owned by escrow PDA - only program can move funds
2. **Maker Verification**: `has_one = maker` ensures only maker can cancel
3. **Atomic Swaps**: Both transfers happen in same transaction - all or nothing
4. **Rent Recovery**: Closing accounts returns SOL to maker

## Common Gotchas

### 1. Wrong Signer Seeds Order
```rust
// ❌ Wrong: bump in wrong position
let seeds = &[&[escrow.bump], b"escrow", maker_key.as_ref()];

// ✅ Correct: bump at the end
let seeds = &[b"escrow", maker_key.as_ref(), &[escrow.bump]];
```

### 2. Forgetting the Bump
```rust
// ❌ Wrong: no bump = won't match PDA
let seeds = &[b"escrow", maker_key.as_ref()];

// ✅ Correct: include bump
let seeds = &[b"escrow", maker_key.as_ref(), &[escrow.bump]];
```

### 3. Using Wrong Authority for Vault
```rust
// ❌ Wrong: maker as vault authority (can't sign for transfers!)
token::authority = maker

// ✅ Correct: escrow PDA as vault authority
token::authority = escrow
```

### 4. Not Closing Accounts
```rust
// ❌ Leaving accounts open = wasted rent

// ✅ Always close accounts when done
#[account(mut, close = maker)]
pub escrow: Account<'info, Escrow>,
```

## What You've Learned

- [x] PDAs as program-controlled authorities
- [x] CPI signing with PDAs
- [x] Escrow design pattern
- [x] Atomic multi-party swaps
- [x] Account closing and rent recovery
- [x] Security constraints (has_one, seeds validation)

## Next Steps

**Challenge 4: Staking Program** - Build a vault with time-based rewards!

## Builder Checklist

- [ ] Created escrow state PDA
- [ ] Created vault token account owned by PDA
- [ ] Implemented make instruction
- [ ] Implemented take instruction with PDA signing
- [ ] Implemented cancel instruction
- [ ] Closed accounts to recover rent
- [ ] Tested full escrow flow
- [ ] (Bonus) Added expiration time
- [ ] (Bonus) Supported partial fills
