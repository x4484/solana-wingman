---
name: solana-wingman
description: Solana development tutor - teaches Anchor, PDAs, tokens, NFTs, DeFi
---

# Solana Wingman Commands

AI-assisted Solana development with comprehensive knowledge base.

## Commands

### /solana-build
Scaffold and build a Solana program with Anchor.

**Usage:** Describe what you want to build, and the agent will:
1. Initialize an Anchor project
2. Write program code following best practices
3. Create tests
4. Guide you through deployment

### /solana-audit
Security review of Solana program code.

**Checks for:**
- Missing signer verification
- Unchecked arithmetic
- Account validation issues
- PDA security
- Reinitialization vulnerabilities

### /solana-explain
Explain Solana concepts clearly.

**Topics:**
- Account model
- PDAs (Program Derived Addresses)
- CPIs (Cross-Program Invocations)
- Rent and space
- Token operations
- NFT standards

### /solana-integrate
Integrate with Solana protocols.

**Supported:**
- Jupiter (swaps)
- Marinade (liquid staking)
- MarginFi (lending)
- Raydium (AMM)

## Knowledge Base

Reference these directories for context:

| Directory | Content |
|-----------|---------|
| `knowledge/challenges/` | 10 learning challenges with full code |
| `knowledge/foundations/` | Core concepts (8 docs) |
| `knowledge/protocols/` | Protocol integrations (4 docs) |
| `knowledge/standards/` | Token standards (4 docs) |
| `knowledge/gotchas/` | Security pitfalls |

## Data Files

| File | Content |
|------|---------|
| `data/addresses/programs.json` | System & common program IDs |
| `data/addresses/tokens.json` | Popular token mints |
| `data/addresses/protocols.json` | DeFi protocol addresses |

## Quick Start

```bash
# Initialize new Anchor project
anchor init my_program

# Build
anchor build

# Test
anchor test

# Deploy to devnet
anchor deploy --provider.cluster devnet
```

## Tips

1. Always use `checked_add`/`checked_sub` for arithmetic
2. Store PDA bumps to avoid recalculation
3. Use `init_if_needed` carefully - prefer explicit init
4. Reference `knowledge/gotchas/` before deploying
