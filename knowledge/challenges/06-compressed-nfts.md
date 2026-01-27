# Challenge 6: Compressed NFTs

## TLDR

Mint millions of NFTs at a fraction of the cost using Solana's state compression. Learn Merkle trees, Bubblegum, and how to work with compressed NFTs (cNFTs).

## Core Concepts

### What You're Building

A compressed NFT collection that:
1. Creates a Merkle tree to store NFT data
2. Mints thousands of NFTs for pennies
3. Transfers cNFTs using proofs
4. Decompresses NFTs when needed

### Why Compression?

| Aspect | Regular NFT | Compressed NFT |
|--------|-------------|----------------|
| Cost to mint | ~$2-3 | ~$0.0001 |
| 10,000 NFTs | ~$25,000 | ~$100 |
| 1,000,000 NFTs | ~$2.5M | ~$500 |
| Storage | On-chain accounts | Merkle tree + indexer |
| Transfer | Simple | Requires proof |

### How State Compression Works

```
                    ┌──────────────┐
                    │  Merkle Root │  ← Stored on-chain (32 bytes)
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
           ┌─────┐      ┌─────┐      ┌─────┐
           │Hash │      │Hash │      │Hash │
           └──┬──┘      └──┬──┘      └──┬──┘
              │            │            │
         ┌────┴────┐  ┌────┴────┐  ┌────┴────┐
         ▼         ▼  ▼         ▼  ▼         ▼
       ┌───┐    ┌───┐┌───┐   ┌───┐┌───┐   ┌───┐
       │NFT│    │NFT││NFT│   │NFT││NFT│   │NFT│
       │ 1 │    │ 2 ││ 3 │   │ 4 ││ 5 │   │ 6 │
       └───┘    └───┘└───┘   └───┘└───┘   └───┘
         ↑
         └── NFT data stored off-chain (indexer)
             Only hashes go on-chain!
```

### Key Components

1. **Merkle Tree Account**: Holds the tree structure on-chain
2. **Bubblegum Program**: Metaplex program for cNFT operations
3. **Concurrent Merkle Tree**: Allows multiple simultaneous updates
4. **Indexer**: Off-chain service storing full NFT data (Helius, Triton, etc.)

## Project Setup

```bash
# Dependencies
cargo add mpl-bubblegum spl-account-compression anchor-spl

# Cargo.toml
[dependencies]
anchor-lang = "0.30.0"
mpl-bubblegum = "1.4"
spl-account-compression = "0.3"
```

## Code Walkthrough

### 1. Create Merkle Tree

```rust
use anchor_lang::prelude::*;
use mpl_bubblegum::{
    instructions::{CreateTreeConfigCpiBuilder, MintV1CpiBuilder},
    types::{Creator, MetadataArgs, TokenProgramVersion, TokenStandard},
};
use spl_account_compression::{
    program::SplAccountCompression,
    Noop,
};

declare_id!("YOUR_PROGRAM_ID");

#[program]
pub mod compressed_nfts {
    use super::*;

    /// Create a Merkle tree for compressed NFTs
    pub fn create_tree(
        ctx: Context<CreateTree>,
        max_depth: u32,        // Tree depth (e.g., 14 = 16,384 NFTs)
        max_buffer_size: u32,  // Concurrent updates (e.g., 64)
    ) -> Result<()> {
        // Calculate tree capacity: 2^max_depth
        let capacity = 2u64.pow(max_depth);
        msg!("Creating tree with capacity for {} NFTs", capacity);

        // Create tree config via Bubblegum
        CreateTreeConfigCpiBuilder::new(&ctx.accounts.bubblegum_program.to_account_info())
            .tree_config(&ctx.accounts.tree_config.to_account_info())
            .merkle_tree(&ctx.accounts.merkle_tree.to_account_info())
            .payer(&ctx.accounts.payer.to_account_info())
            .tree_creator(&ctx.accounts.tree_creator.to_account_info())
            .log_wrapper(&ctx.accounts.log_wrapper.to_account_info())
            .compression_program(&ctx.accounts.compression_program.to_account_info())
            .system_program(&ctx.accounts.system_program.to_account_info())
            .max_depth(max_depth)
            .max_buffer_size(max_buffer_size)
            .invoke()?;

        msg!("Merkle tree created successfully!");
        Ok(())
    }

    /// Mint a compressed NFT
    pub fn mint_cnft(
        ctx: Context<MintCnft>,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        let creators = vec![Creator {
            address: ctx.accounts.tree_creator.key(),
            verified: true,
            share: 100,
        }];

        let metadata = MetadataArgs {
            name,
            symbol,
            uri,
            seller_fee_basis_points: 500, // 5% royalty
            primary_sale_happened: false,
            is_mutable: true,
            edition_nonce: None,
            token_standard: Some(TokenStandard::NonFungible),
            collection: None, // Can add collection here
            uses: None,
            token_program_version: TokenProgramVersion::Original,
            creators,
        };

        MintV1CpiBuilder::new(&ctx.accounts.bubblegum_program.to_account_info())
            .tree_config(&ctx.accounts.tree_config.to_account_info())
            .leaf_owner(&ctx.accounts.leaf_owner.to_account_info())
            .leaf_delegate(&ctx.accounts.leaf_owner.to_account_info())
            .merkle_tree(&ctx.accounts.merkle_tree.to_account_info())
            .payer(&ctx.accounts.payer.to_account_info())
            .tree_creator_or_delegate(&ctx.accounts.tree_creator.to_account_info())
            .log_wrapper(&ctx.accounts.log_wrapper.to_account_info())
            .compression_program(&ctx.accounts.compression_program.to_account_info())
            .system_program(&ctx.accounts.system_program.to_account_info())
            .metadata(metadata)
            .invoke()?;

        msg!("Compressed NFT minted!");
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateTree<'info> {
    /// CHECK: Initialized by Bubblegum
    #[account(mut)]
    pub tree_config: UncheckedAccount<'info>,

    /// CHECK: Initialized by compression program
    #[account(mut)]
    pub merkle_tree: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub tree_creator: Signer<'info>,

    /// CHECK: Bubblegum program
    pub bubblegum_program: UncheckedAccount<'info>,

    pub log_wrapper: Program<'info, Noop>,
    pub compression_program: Program<'info, SplAccountCompression>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MintCnft<'info> {
    /// CHECK: Validated by Bubblegum
    #[account(mut)]
    pub tree_config: UncheckedAccount<'info>,

    /// CHECK: Validated by Bubblegum
    #[account(mut)]
    pub merkle_tree: UncheckedAccount<'info>,

    /// CHECK: NFT recipient
    pub leaf_owner: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub tree_creator: Signer<'info>,

    /// CHECK: Bubblegum program
    pub bubblegum_program: UncheckedAccount<'info>,

    pub log_wrapper: Program<'info, Noop>,
    pub compression_program: Program<'info, SplAccountCompression>,
    pub system_program: Program<'info, System>,
}
```

### 2. Tree Size Calculation

```rust
// Tree capacity = 2^max_depth
// Common configurations:

// Small collection (1,000 NFTs)
const MAX_DEPTH: u32 = 10;      // 2^10 = 1,024
const MAX_BUFFER_SIZE: u32 = 8;
// Cost: ~0.02 SOL

// Medium collection (16,000 NFTs)
const MAX_DEPTH: u32 = 14;       // 2^14 = 16,384
const MAX_BUFFER_SIZE: u32 = 64;
// Cost: ~0.16 SOL

// Large collection (1M NFTs)
const MAX_DEPTH: u32 = 20;       // 2^20 = 1,048,576
const MAX_BUFFER_SIZE: u32 = 256;
// Cost: ~1.5 SOL

// Calculate account size
fn calculate_tree_size(max_depth: u32, max_buffer_size: u32) -> usize {
    // Formula from SPL Account Compression
    let header_size = 32 + 32 + 8;  // authority + root + leaf_count
    let changelog_size = (32 + 32 + 4) * max_buffer_size as usize;
    let rightmost_proof_size = 32 * max_depth as usize;
    let canopy_size = (2usize.pow(max_depth) - 1) * 32;  // Optional canopy
    
    header_size + changelog_size + rightmost_proof_size + canopy_size
}
```

### 3. Transfer cNFT (Client-Side)

Transfers require a proof from an indexer:

```typescript
import { 
    getAsset, 
    getAssetProof,
    transfer,
} from "@metaplex-foundation/mpl-bubblegum";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";

async function transferCnft(
    umi: Umi,
    assetId: PublicKey,
    newOwner: PublicKey,
) {
    // 1. Get asset from indexer (Helius, Triton, etc.)
    const asset = await getAsset(umi, assetId);
    
    // 2. Get proof from indexer
    const proof = await getAssetProof(umi, assetId);
    
    // 3. Transfer using proof
    await transfer(umi, {
        leafOwner: asset.ownership.owner,
        newLeafOwner: newOwner,
        merkleTree: asset.compression.tree,
        root: proof.root,
        dataHash: asset.compression.dataHash,
        creatorHash: asset.compression.creatorHash,
        leafIndex: asset.compression.leafIndex,
        proof: proof.proof,
    }).sendAndConfirm(umi);
}
```

### 4. Fetch cNFTs from Indexer

```typescript
import { DAS } from "helius-sdk";

// Using Helius DAS API
async function getCnftsByOwner(owner: string) {
    const url = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
    
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: "my-id",
            method: "getAssetsByOwner",
            params: {
                ownerAddress: owner,
                page: 1,
                limit: 100,
                displayOptions: {
                    showUnverifiedCollections: false,
                    showCollectionMetadata: true,
                },
            },
        }),
    });
    
    const { result } = await response.json();
    return result.items;
}
```

### 5. Decompress cNFT (When Needed)

```rust
/// Decompress a cNFT into a regular NFT
pub fn decompress(ctx: Context<Decompress>) -> Result<()> {
    // Decompression creates:
    // 1. Regular token mint
    // 2. Metadata account
    // 3. Master edition
    
    // This removes the NFT from the Merkle tree
    // and creates standard Metaplex accounts
    
    DecompressV1CpiBuilder::new(&ctx.accounts.bubblegum_program.to_account_info())
        .tree_config(&ctx.accounts.tree_config.to_account_info())
        .leaf_owner(&ctx.accounts.leaf_owner.to_account_info())
        .leaf_delegate(&ctx.accounts.leaf_delegate.to_account_info())
        .merkle_tree(&ctx.accounts.merkle_tree.to_account_info())
        .mint(&ctx.accounts.mint.to_account_info())
        .metadata(&ctx.accounts.metadata.to_account_info())
        .master_edition(&ctx.accounts.master_edition.to_account_info())
        // ... other accounts
        .invoke()?;

    msg!("cNFT decompressed to regular NFT");
    Ok(())
}
```

## Security Considerations

1. **Indexer Trust**: You depend on indexers for proofs - use reputable ones
2. **Tree Creator Authority**: Controls who can mint to the tree
3. **Proof Freshness**: Proofs can become stale after tree updates
4. **Concurrent Updates**: Buffer size limits simultaneous operations

## Common Gotchas

### 1. Forgetting the Proof
```typescript
// ❌ Wrong: no proof provided
await transfer(umi, { leafOwner, newLeafOwner, merkleTree });

// ✅ Correct: include proof from indexer
const proof = await getAssetProof(umi, assetId);
await transfer(umi, { 
    leafOwner, 
    newLeafOwner, 
    merkleTree,
    proof: proof.proof,  // Array of 32-byte hashes
    root: proof.root,
    // ... other required fields
});
```

### 2. Stale Proof After Tree Update
```typescript
// ❌ Wrong: using old proof after someone else minted
const proof = await getAssetProof(umi, assetId);
// ... time passes, tree updates ...
await transfer(umi, { proof });  // May fail!

// ✅ Correct: get fresh proof right before transfer
const freshProof = await getAssetProof(umi, assetId);
await transfer(umi, { proof: freshProof.proof, root: freshProof.root });
```

### 3. Tree Too Small
```rust
// ❌ Wrong: tree fills up
const MAX_DEPTH: u32 = 5;  // Only 32 NFTs!

// ✅ Correct: plan for growth
const MAX_DEPTH: u32 = 14;  // 16,384 NFTs
```

### 4. Missing Canopy
```typescript
// Without canopy: every transfer needs full proof (expensive)
// With canopy: proofs are shorter (cheaper)

// Canopy stores upper tree levels on-chain
// Larger canopy = shorter proofs = cheaper operations
```

## Cost Comparison

| Operation | Regular NFT | Compressed NFT |
|-----------|-------------|----------------|
| Create collection | ~0.015 SOL | ~0.5 SOL (tree) |
| Mint 1 NFT | ~0.015 SOL | ~0.00001 SOL |
| Mint 10,000 NFTs | ~150 SOL | ~0.6 SOL total |
| Transfer | ~0.000005 SOL | ~0.00001 SOL |

## What You've Learned

- [x] State compression with Merkle trees
- [x] Creating concurrent Merkle trees
- [x] Minting compressed NFTs via Bubblegum
- [x] Fetching cNFTs from indexers
- [x] Transferring with proofs
- [x] Tree sizing and cost calculation
- [x] Decompression when needed

## Next Steps

**Challenge 7: Oracle Integration (Pyth)** - Get real-world price data!

## Builder Checklist

- [ ] Created Merkle tree with appropriate size
- [ ] Minted compressed NFTs
- [ ] Fetched cNFTs from indexer (Helius/Triton)
- [ ] Transferred cNFT with proof
- [ ] Handled proof freshness
- [ ] Calculated costs for collection size
- [ ] (Bonus) Added collection verification
- [ ] (Bonus) Implemented batch minting
- [ ] (Bonus) Set up canopy for cheaper proofs
