---
title: "feat: Add Ecosystem Documentation (Protocols, Standards, Prompts, Addresses)"
type: feat
date: 2026-01-27
priority: medium
---

# Add Ecosystem Documentation

Expand solana-wingman with protocol integrations, SPL standards deep dives, AI mode prompts, and a program ID reference.

## Overview

Items 5-8 from the priority list - the "ecosystem" layer that helps AI agents work with real Solana protocols and standards beyond the challenge curriculum.

## Problem Statement

Current state: Agents can build basic Solana programs but lack:
- **Protocol knowledge** - How to integrate Jupiter, Marinade, etc.
- **Standards deep dives** - SPL nuances, Token-2022 extensions
- **Mode switching** - Different instructions for build vs audit vs optimize
- **Address reference** - Common program IDs and token mints

Result: Agents hallucinate addresses, miss protocol best practices, use one-size-fits-all prompting.

## Proposed Solution

### 5. knowledge/protocols/ (4 files)

| File | Protocol | Content |
|------|----------|---------|
| `jupiter.md` | Jupiter Aggregator | Swap integration, route API, DCA |
| `marinade.md` | Marinade Finance | Liquid staking, mSOL, delayed unstake |
| `marginfi.md` | MarginFi | Lending pools, liquidations, risk tiers |
| `raydium.md` | Raydium | AMM pools, CLMM, AcceleRaytor |

**Format per file:**
```markdown
# [Protocol Name]

## TLDR
[One-liner + why you'd use it]

## Integration

### Installation
[npm/cargo packages needed]

### Basic Usage
[Code to perform core action]

### Advanced Patterns
[Production considerations]

## Key Addresses
[Mainnet program IDs and important accounts]

## Common Mistakes
[What AI agents get wrong]

## Resources
[Official docs, SDKs, Discord]
```

### 6. knowledge/standards/ (4 files)

| File | Standard | Content |
|------|----------|---------|
| `spl-token.md` | SPL Token | Minting, ATAs, decimals, authority |
| `token-2022.md` | Token-2022 | Extensions deep dive (transfer fee, interest, etc.) |
| `metaplex-core.md` | Metaplex Core | NFT standard, collections, plugins |
| `token-metadata.md` | Token Metadata | Legacy metadata, why to migrate to Core |

**Format per file:**
```markdown
# [Standard Name]

## TLDR
[When to use this vs alternatives]

## Account Structure
[Diagrams of account layouts]

## Code Examples
[Create, read, update patterns]

## Extension/Feature Matrix
[What's supported, what's not]

## Migration Guide
[From older standards if applicable]
```

### 7. prompts/ (4 files)

| File | Mode | Purpose |
|------|------|---------|
| `build-mode.md` | Building | Fast iteration, scaffold-first |
| `audit-mode.md` | Security review | Thorough, check-everything |
| `optimize-mode.md` | Performance | Compute units, account size |
| `learn-mode.md` | Teaching | Explain concepts, guided |

**Format per file:**
```markdown
# [Mode] Mode

## When to Use
[Triggers for this mode]

## Behavior
[How AI should act differently]

## Priorities
[Ordered list of what matters]

## Example Prompts
[Sample user requests that trigger this mode]
```

### 8. data/addresses/ (3 files)

| File | Content |
|------|---------|
| `programs.json` | Core program IDs (Token, Token-2022, Metaplex, etc.) |
| `tokens.json` | Common token mints (USDC, SOL, BONK, JUP, etc.) |
| `protocols.json` | DeFi protocol addresses (Jupiter, Marinade, etc.) |

**Format:**
```json
{
  "mainnet": {
    "TOKEN_PROGRAM": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    "TOKEN_2022_PROGRAM": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
  },
  "devnet": {
    // Same structure
  }
}
```

## Technical Approach

### Phase 1: Protocol Docs (4 files)
**Files:** jupiter.md, marinade.md, marginfi.md, raydium.md
**Effort:** ~2 hours
**Dependencies:** None

### Phase 2: Standards Deep Dives (4 files)
**Files:** spl-token.md, token-2022.md, metaplex-core.md, token-metadata.md
**Effort:** ~2 hours
**Dependencies:** Builds on foundations already written

### Phase 3: Prompts (4 files)
**Files:** build-mode.md, audit-mode.md, optimize-mode.md, learn-mode.md
**Effort:** ~1 hour
**Dependencies:** None

### Phase 4: Address Data (3 files)
**Files:** programs.json, tokens.json, protocols.json
**Effort:** ~30 min
**Dependencies:** Protocol docs (for addresses)

## Acceptance Criteria

### Functional Requirements
- [ ] All 15 files created with consistent format
- [ ] Protocol docs have working code examples
- [ ] Standards docs include account diagrams
- [ ] Prompts are actionable and distinct
- [ ] Address files have both mainnet and devnet

### Quality Gates
- [ ] All program IDs verified against mainnet
- [ ] Token mints verified (check decimals too)
- [ ] Protocol integration code tested conceptually
- [ ] Prompts don't conflict with each other

## Success Metrics

- Agents can integrate Jupiter swaps without hallucinating addresses
- Agents switch behavior based on user intent (build vs audit)
- SPL/Token-2022 confusion eliminated

## Dependencies & Prerequisites

- Jupiter SDK: `@jup-ag/api`
- Marinade SDK: `@marinade.finance/marinade-ts-sdk`
- MarginFi SDK: `@mrgnlabs/marginfi-client-v2`

## Risk Analysis

| Risk | Mitigation |
|------|------------|
| Protocol APIs change | Link to official docs, version SDKs |
| Address errors | Verify against explorers, use well-known addresses |
| Prompts too rigid | Make them guidelines, not rules |

## References

### Internal
- `knowledge/challenges/08-amm-swap.md` - AMM patterns
- `knowledge/foundations/05-cpis.md` - CPI patterns for integrations

### External
- [Jupiter Docs](https://station.jup.ag/docs)
- [Marinade Docs](https://docs.marinade.finance/)
- [MarginFi Docs](https://docs.marginfi.com/)
- [SPL Token Docs](https://spl.solana.com/token)
