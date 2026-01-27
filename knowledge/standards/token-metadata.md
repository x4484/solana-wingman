# Token Metadata (Legacy)

## TLDR

Token Metadata is Metaplex's original NFT standard - still widely used but superseded by Metaplex Core. Use it for compatibility with existing collections; use Core for new projects.

## ⚠️ When to Use

| Scenario | Use Token Metadata? |
|----------|-------------------|
| New NFT collection | ❌ Use Metaplex Core |
| Existing collection (already deployed) | ✅ Keep using it |
| Maximum marketplace compatibility | ⚠️ Both work now |
| Compressed NFTs | ❌ Use Bubblegum |
| Simple fungible token metadata | ⚠️ Consider Token-2022 |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Token Metadata Account Structure           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  For each NFT, you need:                               │
│                                                         │
│  1. MINT ACCOUNT (SPL Token)                           │
│     └── Supply: 1, Decimals: 0                         │
│                                                         │
│  2. TOKEN ACCOUNT (SPL Token)                          │
│     └── Holds the 1 token                              │
│                                                         │
│  3. METADATA PDA (Token Metadata)                      │
│     ├── seeds: ["metadata", program_id, mint]          │
│     ├── name, symbol, uri                              │
│     ├── seller_fee_basis_points                        │
│     ├── creators[]                                      │
│     └── collection                                      │
│                                                         │
│  4. MASTER EDITION PDA (Token Metadata)                │
│     ├── seeds: ["metadata", program_id, mint, "edition"]│
│     └── Proves this is the original (not a print)      │
│                                                         │
│  Total: 4 accounts, ~0.02 SOL                          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Code Examples

### Installation

```bash
npm install @metaplex-foundation/mpl-token-metadata @metaplex-foundation/umi
```

### Setup

```typescript
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";

const umi = createUmi("https://api.mainnet-beta.solana.com")
  .use(mplTokenMetadata());
```

### Create NFT

```typescript
import { 
  createNft,
  mplTokenMetadata,
} from "@metaplex-foundation/mpl-token-metadata";
import { generateSigner, percentAmount } from "@metaplex-foundation/umi";

const mint = generateSigner(umi);

await createNft(umi, {
  mint,
  name: "My NFT",
  symbol: "MNFT",
  uri: "https://example.com/metadata.json",
  sellerFeeBasisPoints: percentAmount(5),  // 5% royalty
  creators: [
    { address: umi.identity.publicKey, verified: true, share: 100 }
  ],
}).sendAndConfirm(umi);

console.log("NFT Mint:", mint.publicKey);
```

### Create Collection

```typescript
import { createNft } from "@metaplex-foundation/mpl-token-metadata";

const collectionMint = generateSigner(umi);

await createNft(umi, {
  mint: collectionMint,
  name: "My Collection",
  symbol: "MCOL",
  uri: "https://example.com/collection.json",
  sellerFeeBasisPoints: percentAmount(5),
  isCollection: true,
}).sendAndConfirm(umi);
```

### Mint NFT into Collection

```typescript
import { createNft, verifyCollectionV1 } from "@metaplex-foundation/mpl-token-metadata";

const mint = generateSigner(umi);

// Step 1: Create the NFT
await createNft(umi, {
  mint,
  name: "My NFT #1",
  uri: "https://example.com/nft/1.json",
  sellerFeeBasisPoints: percentAmount(5),
  collection: { key: collectionMint.publicKey, verified: false },
}).sendAndConfirm(umi);

// Step 2: Verify the collection (requires collection authority)
await verifyCollectionV1(umi, {
  metadata: findMetadataPda(umi, { mint: mint.publicKey }),
  collectionMint: collectionMint.publicKey,
  authority: umi.identity,  // Must be collection update authority
}).sendAndConfirm(umi);
```

### Update Metadata

```typescript
import { updateV1, findMetadataPda } from "@metaplex-foundation/mpl-token-metadata";

const metadata = findMetadataPda(umi, { mint: mintAddress });

await updateV1(umi, {
  mint: mintAddress,
  authority: umi.identity,
  data: {
    name: "Updated Name",
    symbol: "UPDT",
    uri: "https://example.com/updated.json",
    sellerFeeBasisPoints: 500,
    creators: null,  // Keep existing
  },
}).sendAndConfirm(umi);
```

### Fetch Metadata

```typescript
import { fetchDigitalAsset } from "@metaplex-foundation/mpl-token-metadata";

const asset = await fetchDigitalAsset(umi, mintAddress);

console.log("Name:", asset.metadata.name);
console.log("Symbol:", asset.metadata.symbol);
console.log("URI:", asset.metadata.uri);
console.log("Royalty:", asset.metadata.sellerFeeBasisPoints);
console.log("Creators:", asset.metadata.creators);
```

### Transfer NFT

```typescript
import { transferV1 } from "@metaplex-foundation/mpl-token-metadata";

await transferV1(umi, {
  mint: mintAddress,
  authority: umi.identity,
  tokenOwner: umi.identity.publicKey,
  destinationOwner: recipientAddress,
  tokenStandard: TokenStandard.NonFungible,
}).sendAndConfirm(umi);
```

## Key Addresses

```typescript
const TOKEN_METADATA = {
  PROGRAM_ID: "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
  
  // PDA derivation
  // Metadata: ["metadata", program_id, mint]
  // Master Edition: ["metadata", program_id, mint, "edition"]
  // Edition Marker: ["metadata", program_id, mint, "edition", edition_number]
};
```

## PDA Derivation

```typescript
import { findMetadataPda, findMasterEditionPda } from "@metaplex-foundation/mpl-token-metadata";

// Get metadata PDA
const metadataPda = findMetadataPda(umi, { mint: mintAddress });

// Get master edition PDA  
const masterEditionPda = findMasterEditionPda(umi, { mint: mintAddress });
```

## Common Mistakes

### ❌ Using Token Metadata for New Projects

```typescript
// WRONG: Legacy standard for new project
import { createNft } from "@metaplex-foundation/mpl-token-metadata";
await createNft(umi, {...});  // ❌ Use Core instead!

// RIGHT: Use Metaplex Core
import { create } from "@metaplex-foundation/mpl-core";
await create(umi, {...});  // ✅
```

### ❌ Forgetting to Verify Collection

```typescript
// WRONG: NFT in collection but unverified
await createNft(umi, {
  collection: { key: collectionMint, verified: false },  // ❌ Stays unverified!
});

// RIGHT: Verify after creation
await createNft(umi, {...});
await verifyCollectionV1(umi, {...});  // ✅ Now verified
```

### ❌ Incorrect Creator Shares

```typescript
// WRONG: Shares don't add to 100
creators: [
  { address: creator1, share: 50 },
  { address: creator2, share: 30 },  // ❌ Total is 80, not 100!
]

// RIGHT: Shares must total 100
creators: [
  { address: creator1, share: 70 },
  { address: creator2, share: 30 },  // ✅ Total is 100
]
```

### ❌ Not Setting First Creator as Verified

```typescript
// WRONG: First creator not verified
creators: [
  { address: creator1, verified: false, share: 100 },  // ❌
]

// RIGHT: If signing as creator, verify yourself
creators: [
  { address: umi.identity.publicKey, verified: true, share: 100 },  // ✅
]
```

## Metadata JSON Standard

```json
{
  "name": "My NFT #1",
  "symbol": "MNFT",
  "description": "Description of the NFT",
  "image": "https://example.com/images/1.png",
  "animation_url": "https://example.com/video/1.mp4",
  "external_url": "https://example.com/nft/1",
  "attributes": [
    { "trait_type": "Background", "value": "Blue" },
    { "trait_type": "Rarity", "value": "Legendary" }
  ],
  "properties": {
    "files": [
      { "uri": "https://example.com/1.png", "type": "image/png" }
    ],
    "category": "image",
    "creators": [
      { "address": "...", "share": 100 }
    ]
  },
  "seller_fee_basis_points": 500
}
```

## Migration to Core

If you want to migrate:

1. **Don't migrate existing collections** - Keep them on Token Metadata
2. **New collections** - Use Metaplex Core from the start
3. **Dual support** - Your app can support both standards

```typescript
// Check which standard an NFT uses
import { fetchDigitalAsset } from "@metaplex-foundation/mpl-token-metadata";
import { fetchAsset } from "@metaplex-foundation/mpl-core";

async function fetchNft(mint: PublicKey) {
  try {
    // Try Core first (newer)
    return await fetchAsset(umi, mint);
  } catch {
    // Fall back to Token Metadata
    return await fetchDigitalAsset(umi, mint);
  }
}
```

## Resources

- **Docs**: https://developers.metaplex.com/token-metadata
- **SDK**: https://github.com/metaplex-foundation/mpl-token-metadata

## Related

- **[./metaplex-core.md](./metaplex-core.md)** - Modern standard (use this!)
- **[../challenges/02-nft-metaplex.md](../challenges/02-nft-metaplex.md)** - Build NFTs
