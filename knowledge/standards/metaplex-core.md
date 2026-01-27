# Metaplex Core

## TLDR

Metaplex Core is the modern NFT standard on Solana - simpler, cheaper, and more flexible than the legacy Token Metadata program. Use it for all new NFT projects.

## Why Core Over Token Metadata?

| Aspect | Token Metadata (Legacy) | Metaplex Core |
|--------|------------------------|---------------|
| Account structure | 4+ accounts per NFT | 1 account per NFT |
| Mint cost | ~0.02 SOL | ~0.003 SOL |
| Complexity | High (many PDAs) | Low (single asset) |
| Plugins | Limited | Extensible |
| Royalties | Bypass-able | Plugin-enforced |
| Collections | Separate verify step | Built-in |

```
┌─────────────────────────────────────────────────────────┐
│           Token Metadata vs Core Architecture           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  TOKEN METADATA (Legacy):                               │
│  ├── Mint Account (Token Program)                      │
│  ├── Token Account (Token Program)                     │
│  ├── Metadata PDA (Metaplex)                           │
│  └── Master Edition PDA (Metaplex)                     │
│  = 4 accounts, ~0.02 SOL                               │
│                                                         │
│  METAPLEX CORE:                                         │
│  └── Asset Account (single account with everything)    │
│  = 1 account, ~0.003 SOL                               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Core Concepts

### Assets

An Asset is a single account containing:
- Owner
- Name, URI
- Plugins (royalties, freeze, etc.)
- Collection reference (optional)

### Collections

Collections group assets together:
- Collection asset (the parent)
- Individual assets reference it
- Plugins apply to all assets in collection

### Plugins

Extend asset functionality:
- **Royalties**: Enforce creator royalties
- **FreezeDelegate**: Allow freezing
- **TransferDelegate**: Allow third-party transfers
- **BurnDelegate**: Allow burning
- **Attributes**: On-chain key-value storage
- **UpdateDelegate**: Allow metadata updates

## Code Examples

### Installation

```bash
npm install @metaplex-foundation/mpl-core @metaplex-foundation/umi
```

### Setup Umi

```typescript
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mplCore } from "@metaplex-foundation/mpl-core";
import { keypairIdentity } from "@metaplex-foundation/umi";

const umi = createUmi("https://api.mainnet-beta.solana.com")
  .use(mplCore())
  .use(keypairIdentity(keypair));
```

### Create a Collection

```typescript
import { 
  createCollection, 
  generateSigner,
  pluginAuthorityPair,
  ruleSet
} from "@metaplex-foundation/mpl-core";

const collectionSigner = generateSigner(umi);

await createCollection(umi, {
  collection: collectionSigner,
  name: "My Collection",
  uri: "https://example.com/collection.json",
  plugins: [
    pluginAuthorityPair({
      type: "Royalties",
      data: {
        basisPoints: 500,  // 5%
        creators: [
          { address: creator.publicKey, percentage: 100 }
        ],
        ruleSet: ruleSet("None"),  // Or "ProgramAllowList" / "ProgramDenyList"
      },
    }),
  ],
}).sendAndConfirm(umi);

console.log("Collection:", collectionSigner.publicKey);
```

### Mint an Asset (NFT)

```typescript
import { create, generateSigner } from "@metaplex-foundation/mpl-core";

const assetSigner = generateSigner(umi);

await create(umi, {
  asset: assetSigner,
  name: "My NFT #1",
  uri: "https://example.com/nft/1.json",
  collection: collectionAddress,  // Optional: link to collection
  plugins: [
    pluginAuthorityPair({
      type: "FreezeDelegate",
      data: { frozen: false },
      authority: { type: "Owner" },
    }),
    pluginAuthorityPair({
      type: "Attributes",
      data: {
        attributeList: [
          { key: "rarity", value: "legendary" },
          { key: "power", value: "100" },
        ],
      },
    }),
  ],
}).sendAndConfirm(umi);

console.log("Asset:", assetSigner.publicKey);
```

### Transfer Asset

```typescript
import { transfer } from "@metaplex-foundation/mpl-core";

await transfer(umi, {
  asset: assetAddress,
  newOwner: recipientAddress,
}).sendAndConfirm(umi);
```

### Burn Asset

```typescript
import { burn } from "@metaplex-foundation/mpl-core";

await burn(umi, {
  asset: assetAddress,
  collection: collectionAddress,  // If part of collection
}).sendAndConfirm(umi);
```

### Fetch Asset

```typescript
import { fetchAsset, fetchCollection } from "@metaplex-foundation/mpl-core";

const asset = await fetchAsset(umi, assetAddress);
console.log("Name:", asset.name);
console.log("Owner:", asset.owner);
console.log("URI:", asset.uri);
console.log("Plugins:", asset.plugins);

const collection = await fetchCollection(umi, collectionAddress);
console.log("Collection size:", collection.numMinted);
```

### Update Metadata

```typescript
import { update } from "@metaplex-foundation/mpl-core";

await update(umi, {
  asset: assetAddress,
  name: "Updated Name",
  uri: "https://example.com/updated.json",
}).sendAndConfirm(umi);
```

### Add Plugin After Creation

```typescript
import { addPlugin, pluginAuthorityPair } from "@metaplex-foundation/mpl-core";

await addPlugin(umi, {
  asset: assetAddress,
  plugin: pluginAuthorityPair({
    type: "TransferDelegate",
    data: {},
    authority: { type: "Address", address: delegateAddress },
  }),
}).sendAndConfirm(umi);
```

## Key Addresses

```typescript
const METAPLEX_CORE = {
  PROGRAM_ID: "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d",
};
```

## Metadata JSON Standard

```json
{
  "name": "My NFT #1",
  "description": "An awesome NFT",
  "image": "https://example.com/images/1.png",
  "animation_url": "https://example.com/video/1.mp4",
  "external_url": "https://example.com/nft/1",
  "attributes": [
    { "trait_type": "Background", "value": "Blue" },
    { "trait_type": "Rarity", "value": "Legendary" },
    { "trait_type": "Power", "value": 95 }
  ],
  "properties": {
    "files": [
      { "uri": "https://example.com/images/1.png", "type": "image/png" }
    ],
    "category": "image"
  }
}
```

## Common Mistakes

### ❌ Using Token Metadata for New Projects

```typescript
// WRONG: Using legacy Token Metadata
import { createNft } from "@metaplex-foundation/mpl-token-metadata"; // ❌ Legacy!

// RIGHT: Use Core for new projects
import { create } from "@metaplex-foundation/mpl-core"; // ✅
```

### ❌ Not Adding Collection Authority

```typescript
// WRONG: Can't add assets to collection
await create(umi, {
  asset: assetSigner,
  collection: collectionAddress,  // ❌ Fails without authority!
});

// RIGHT: Ensure you're the collection authority
// Or add a CollectionAuthority plugin to the collection
```

### ❌ Forgetting to Verify Collection

```typescript
// In Core, collection verification is automatic when creating with collection
// Unlike Token Metadata where you need a separate verify step

// Just include collection in create:
await create(umi, {
  asset: assetSigner,
  collection: collectionAddress,  // ✅ Automatically verified
});
```

### ❌ Wrong Plugin Authority

```typescript
// WRONG: Owner can't be frozen by owner
pluginAuthorityPair({
  type: "FreezeDelegate",
  data: { frozen: false },
  authority: { type: "Owner" },  // ❌ Owner can unfreeze themselves!
});

// RIGHT: Use a separate freeze authority if you need enforced freezing
pluginAuthorityPair({
  type: "FreezeDelegate",
  data: { frozen: false },
  authority: { type: "Address", address: freezeAuthority },  // ✅
});
```

## Plugin Reference

| Plugin | Purpose | Typical Authority |
|--------|---------|-------------------|
| Royalties | Enforce creator fees | UpdateAuthority |
| FreezeDelegate | Lock transfers | Owner or Protocol |
| BurnDelegate | Allow burning | Owner |
| TransferDelegate | Delegate transfers | Protocol |
| UpdateDelegate | Delegate updates | UpdateAuthority |
| Attributes | On-chain traits | UpdateAuthority |

## Migration from Token Metadata

For existing collections, you can:
1. Keep using Token Metadata (still supported)
2. Dual-mint (both standards during transition)
3. Full migration (complex, rarely done)

**Recommendation:** Keep legacy collections on Token Metadata, use Core for all new collections.

## Resources

- **Docs**: https://developers.metaplex.com/core
- **SDK**: https://github.com/metaplex-foundation/mpl-core
- **Umi**: https://github.com/metaplex-foundation/umi

## Related

- **[../challenges/02-nft-metaplex.md](../challenges/02-nft-metaplex.md)** - Build NFTs
- **[./token-metadata.md](./token-metadata.md)** - Legacy standard
