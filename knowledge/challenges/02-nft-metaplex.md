# Challenge 2: NFT with Metaplex

## TLDR

Create NFTs on Solana using the Metaplex standard. Learn about metadata accounts, collections, and the difference between Solana NFTs and Ethereum's ERC-721.

## Core Concepts

### What You're Building

A program that:
1. Creates an NFT collection
2. Mints NFTs with metadata (name, image, attributes)
3. Manages collection verification
4. Demonstrates Metaplex Token Metadata standard

### Solana NFTs vs Ethereum NFTs

| Aspect | Ethereum (ERC-721) | Solana (Metaplex) |
|--------|-------------------|-------------------|
| Storage | Contract storage | Separate accounts |
| Metadata | tokenURI → off-chain | On-chain metadata account |
| Standard | Single contract | Multiple programs |
| Minting | Contract function | SPL Token + Metadata |

### The Anatomy of a Solana NFT

```
┌─────────────────────┐
│     Token Mint      │  ← SPL Token with supply = 1, decimals = 0
│   (unique address)  │
└──────────┬──────────┘
           │
    ┌──────┴──────┐
    ▼             ▼
┌─────────┐  ┌──────────────────┐
│  ATA    │  │  Metadata PDA    │  ← Derived from mint address
│ (owner) │  │  - name          │
└─────────┘  │  - symbol        │
             │  - uri           │
             │  - creators[]    │
             │  - collection    │
             └──────────────────┘
                    │
                    ▼ (optional)
             ┌──────────────────┐
             │  Master Edition  │  ← For 1/1s or limited editions
             │  - supply        │
             │  - max_supply    │
             └──────────────────┘
```

### Key Metaplex Concepts

1. **Metadata Account**: PDA storing name, symbol, URI, creators, royalties
2. **Master Edition**: Proves it's an original (not a print), limits supply
3. **Collection**: Groups NFTs together, verified on-chain
4. **Creators**: Array of addresses with royalty shares (must sum to 100%)
5. **URI**: Points to off-chain JSON with image, attributes, etc.

## Project Setup

```bash
# Add Metaplex dependencies
cargo add mpl-token-metadata anchor-spl

# Or in Cargo.toml
[dependencies]
mpl-token-metadata = "4.1.0"
anchor-spl = { version = "0.30.0", features = ["metadata"] }
```

## Code Walkthrough

### 1. Create Collection NFT

```rust
use anchor_lang::prelude::*;
use anchor_spl::{
    token::{Mint, Token, TokenAccount},
    metadata::{
        create_metadata_accounts_v3,
        create_master_edition_v3,
        CreateMetadataAccountsV3,
        CreateMasterEditionV3,
        Metadata,
    },
    associated_token::AssociatedToken,
};
use mpl_token_metadata::types::{DataV2, Creator, Collection};

declare_id!("YOUR_PROGRAM_ID");

#[program]
pub mod nft_metaplex {
    use super::*;

    pub fn create_collection(
        ctx: Context<CreateCollection>,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        // 1. Mint exactly 1 token to creator's ATA
        anchor_spl::token::mint_to(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.token_account.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
            1,
        )?;

        // 2. Create metadata account
        let creators = vec![Creator {
            address: ctx.accounts.authority.key(),
            verified: true,
            share: 100,
        }];

        create_metadata_accounts_v3(
            CpiContext::new(
                ctx.accounts.token_metadata_program.to_account_info(),
                CreateMetadataAccountsV3 {
                    metadata: ctx.accounts.metadata.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    mint_authority: ctx.accounts.authority.to_account_info(),
                    payer: ctx.accounts.authority.to_account_info(),
                    update_authority: ctx.accounts.authority.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                    rent: ctx.accounts.rent.to_account_info(),
                },
            ),
            DataV2 {
                name,
                symbol,
                uri,
                seller_fee_basis_points: 500, // 5% royalty
                creators: Some(creators),
                collection: None, // This IS the collection
                uses: None,
            },
            true,  // is_mutable
            true,  // update_authority_is_signer
            None,  // collection_details (for collections, use Some(CollectionDetails::V1 { size: 0 }))
        )?;

        // 3. Create master edition (makes it a true NFT)
        create_master_edition_v3(
            CpiContext::new(
                ctx.accounts.token_metadata_program.to_account_info(),
                CreateMasterEditionV3 {
                    edition: ctx.accounts.master_edition.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    update_authority: ctx.accounts.authority.to_account_info(),
                    mint_authority: ctx.accounts.authority.to_account_info(),
                    payer: ctx.accounts.authority.to_account_info(),
                    metadata: ctx.accounts.metadata.to_account_info(),
                    token_program: ctx.accounts.token_program.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                    rent: ctx.accounts.rent.to_account_info(),
                },
            ),
            Some(0), // max_supply: 0 = unlimited prints, None = 1/1
        )?;

        msg!("Collection NFT created!");
        Ok(())
    }

    pub fn mint_nft(
        ctx: Context<MintNft>,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        // Similar to create_collection, but with collection field set
        
        // Mint 1 token
        anchor_spl::token::mint_to(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.token_account.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
            1,
        )?;

        let creators = vec![Creator {
            address: ctx.accounts.authority.key(),
            verified: true,
            share: 100,
        }];

        // Set collection reference (unverified initially)
        let collection = Collection {
            verified: false,
            key: ctx.accounts.collection_mint.key(),
        };

        create_metadata_accounts_v3(
            CpiContext::new(
                ctx.accounts.token_metadata_program.to_account_info(),
                CreateMetadataAccountsV3 {
                    metadata: ctx.accounts.metadata.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    mint_authority: ctx.accounts.authority.to_account_info(),
                    payer: ctx.accounts.authority.to_account_info(),
                    update_authority: ctx.accounts.authority.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                    rent: ctx.accounts.rent.to_account_info(),
                },
            ),
            DataV2 {
                name,
                symbol,
                uri,
                seller_fee_basis_points: 500,
                creators: Some(creators),
                collection: Some(collection),
                uses: None,
            },
            true,
            true,
            None,
        )?;

        create_master_edition_v3(
            CpiContext::new(
                ctx.accounts.token_metadata_program.to_account_info(),
                CreateMasterEditionV3 {
                    edition: ctx.accounts.master_edition.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    update_authority: ctx.accounts.authority.to_account_info(),
                    mint_authority: ctx.accounts.authority.to_account_info(),
                    payer: ctx.accounts.authority.to_account_info(),
                    metadata: ctx.accounts.metadata.to_account_info(),
                    token_program: ctx.accounts.token_program.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                    rent: ctx.accounts.rent.to_account_info(),
                },
            ),
            Some(0),
        )?;

        msg!("NFT minted!");
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateCollection<'info> {
    #[account(
        init,
        payer = authority,
        mint::decimals = 0,
        mint::authority = authority,
        mint::freeze_authority = authority,
    )]
    pub mint: Account<'info, Mint>,
    
    #[account(
        init,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = authority,
    )]
    pub token_account: Account<'info, TokenAccount>,
    
    /// CHECK: Validated by Metaplex
    #[account(mut)]
    pub metadata: UncheckedAccount<'info>,
    
    /// CHECK: Validated by Metaplex
    #[account(mut)]
    pub master_edition: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_metadata_program: Program<'info, Metadata>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct MintNft<'info> {
    #[account(
        init,
        payer = authority,
        mint::decimals = 0,
        mint::authority = authority,
        mint::freeze_authority = authority,
    )]
    pub mint: Account<'info, Mint>,
    
    #[account(
        init,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = authority,
    )]
    pub token_account: Account<'info, TokenAccount>,
    
    /// CHECK: Validated by Metaplex
    #[account(mut)]
    pub metadata: UncheckedAccount<'info>,
    
    /// CHECK: Validated by Metaplex
    #[account(mut)]
    pub master_edition: UncheckedAccount<'info>,
    
    /// The collection this NFT belongs to
    pub collection_mint: Account<'info, Mint>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_metadata_program: Program<'info, Metadata>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}
```

### 2. Metadata JSON Format

The `uri` field points to a JSON file:

```json
{
  "name": "Cool NFT #1",
  "symbol": "COOL",
  "description": "The first cool NFT in the collection",
  "image": "https://arweave.net/abc123",
  "animation_url": "https://arweave.net/video123",
  "external_url": "https://coolnfts.com/1",
  "attributes": [
    {
      "trait_type": "Background",
      "value": "Blue"
    },
    {
      "trait_type": "Rarity",
      "value": "Legendary"
    },
    {
      "trait_type": "Power",
      "value": 95,
      "display_type": "number"
    }
  ],
  "properties": {
    "files": [
      {
        "uri": "https://arweave.net/abc123",
        "type": "image/png"
      }
    ],
    "category": "image"
  }
}
```

### 3. Deriving Metadata PDAs

```typescript
import { PublicKey } from "@solana/web3.js";

const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

// Metadata PDA
const [metadataPda] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("metadata"),
    TOKEN_METADATA_PROGRAM_ID.toBuffer(),
    mint.toBuffer(),
  ],
  TOKEN_METADATA_PROGRAM_ID
);

// Master Edition PDA
const [masterEditionPda] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("metadata"),
    TOKEN_METADATA_PROGRAM_ID.toBuffer(),
    mint.toBuffer(),
    Buffer.from("edition"),
  ],
  TOKEN_METADATA_PROGRAM_ID
);
```

## Security Considerations

1. **Creator Verification**: Only verified creators receive royalties
2. **Update Authority**: Controls who can modify metadata
3. **Collection Verification**: Proves NFT belongs to official collection
4. **Royalty Enforcement**: Metaplex has optional royalty enforcement via hooks

## Common Gotchas

### 1. Metadata PDA Seeds
```rust
// ❌ Wrong seeds
seeds = [b"metadata", mint.key().as_ref()]

// ✅ Correct seeds (program ID in middle!)
seeds = [
    b"metadata",
    mpl_token_metadata::ID.as_ref(),
    mint.key().as_ref()
]
```

### 2. Decimal Must Be 0
```rust
// ❌ Wrong: NFT with decimals
mint::decimals = 9

// ✅ Correct: NFT has 0 decimals
mint::decimals = 0
```

### 3. Supply Must Be 1
```rust
// ❌ Wrong: minting multiple
anchor_spl::token::mint_to(..., 100)?;

// ✅ Correct: mint exactly 1
anchor_spl::token::mint_to(..., 1)?;
```

### 4. Creator Shares Must Sum to 100
```rust
// ❌ Wrong: doesn't sum to 100
let creators = vec![
    Creator { share: 50, ... },
    Creator { share: 30, ... },
];

// ✅ Correct: sums to 100
let creators = vec![
    Creator { share: 70, ... },
    Creator { share: 30, ... },
];
```

### 5. Collection Not Automatically Verified
```rust
// Creating NFT with collection sets verified: false
// Must call verify_collection separately!
```

## What You've Learned

- [x] Metaplex Token Metadata standard
- [x] Creating collection NFTs
- [x] Minting NFTs with metadata
- [x] Metadata JSON format
- [x] PDA derivation for metadata accounts
- [x] Creator royalties
- [x] Collection verification concept

## Next Steps

**Challenge 3: PDA Escrow** - Master PDAs through a practical escrow pattern!

## Builder Checklist

- [ ] Created collection NFT
- [ ] Minted NFT with metadata
- [ ] Set up proper creators array
- [ ] Configured royalties (seller_fee_basis_points)
- [ ] Uploaded metadata JSON to Arweave/IPFS
- [ ] Verified collection (optional)
- [ ] Tested on devnet
- [ ] (Bonus) Built a minting UI
