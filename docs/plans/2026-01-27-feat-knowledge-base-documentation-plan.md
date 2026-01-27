---
title: "feat: Add Knowledge Base Documentation (Foundations, Security, Tools)"
type: feat
date: 2026-01-27
priority: high
---

# Add Knowledge Base Documentation

Transform solana-wingman from a "challenge curriculum" into a complete "knowledge base" by adding foundations, security history, and tool references.

## Overview

The ETH wingman has ~48 additional supporting files beyond challenges. We're adding the 4 highest-priority knowledge areas that give AI agents the context they need to build secure, production-ready Solana programs.

## Problem Statement

Current state: 10 solid challenges with gotchas, but agents lack:
- **Foundational concepts** - Understanding WHY things work
- **Security history** - Learning from past exploits
- **Framework deep-dives** - Anchor internals
- **Production checklist** - Pre-launch verification

Result: AI generates code that works but may not be secure or follow best practices.

## Proposed Solution

Create 4 documentation sets totaling ~13 files:

### 1. knowledge/foundations/ (8 files)

| File | Content |
|------|---------|
| `01-account-model.md` | Accounts as data containers, owners, lamports, rent |
| `02-pdas.md` | Program Derived Addresses, seeds, bumps, canonical bumps |
| `03-transactions.md` | Instructions, signers, compute units, versioned transactions |
| `04-rent-and-space.md` | Rent exemption, space calculation, account resizing |
| `05-cpis.md` | Cross-Program Invocations, invoke, invoke_signed, CPI guards |
| `06-serialization.md` | Borsh, zero-copy, discriminators, account deserialization |
| `07-anchor-framework.md` | Macros, account constraints, errors, events |
| `08-testing-patterns.md` | Bankrun, anchor tests, test fixtures, mocking |

**Format per file:**
```markdown
# [Topic]

## TLDR
[2-3 sentence summary]

## Core Concepts
[Diagrams, explanations]

## Code Examples
[Working Rust code with comments]

## Common Mistakes
[What agents get wrong]

## Related Challenges
[Links to challenges that use this concept]
```

### 2. knowledge/gotchas/historical-hacks.md (1 file)

Document major Solana exploits with lessons:

| Exploit | Date | Amount | Root Cause | Lesson |
|---------|------|--------|------------|--------|
| Wormhole | Feb 2022 | $320M | Missing signer check | Always verify signers |
| Mango Markets | Oct 2022 | $100M | Oracle manipulation | Use TWAP, multiple sources |
| Cashio | Mar 2022 | $50M | Collateral validation bypass | Validate all inputs |
| Slope Wallet | Aug 2022 | $8M | Seed phrase logging | Never log secrets |
| Solend | Nov 2022 | $1.26M | Donation attack | Check for precision loss |

**Format:**
```markdown
# Historical Solana Exploits

## Why Study Hacks?
[Learning from failures]

## Major Exploits

### Wormhole Bridge Hack ($320M)
- **Date:** February 2022
- **Root Cause:** [explanation]
- **Code Pattern to Avoid:** [example]
- **Secure Pattern:** [example]

[repeat for each]

## Vulnerability Categories
- Missing signer verification
- Integer overflow/underflow
- Oracle manipulation
- Reentrancy (yes, even on Solana)
- Account confusion
```

### 3. tools/anchor/ (3 files)

| File | Content |
|------|---------|
| `macros-reference.md` | `#[account]`, `#[derive(Accounts)]`, `#[program]`, etc. |
| `constraints-cheatsheet.md` | `init`, `mut`, `has_one`, `constraint`, `seeds`, `bump` |
| `testing-guide.md` | Test setup, fixtures, common assertions, debugging |

**Format:**
```markdown
# Anchor [Topic]

## Quick Reference
[Table of macros/constraints]

## Detailed Examples
[Code for each with explanations]

## Edge Cases
[When things don't work as expected]
```

### 4. tools/security/pre-production-checklist.md (1 file)

**Sections:**
- [ ] **Access Controls** - Owner checks, PDA authority, upgrade authority
- [ ] **Input Validation** - Account validation, amount bounds, overflow
- [ ] **Economic Security** - Oracle freshness, slippage, MEV protection
- [ ] **Operational Security** - Multisig setup, monitoring, incident response
- [ ] **Audit Preparation** - Documentation, test coverage, known issues
- [ ] **Deployment** - Mainnet config, rate limits, circuit breakers

## Technical Approach

### Phase 1: Foundations (4 docs)
**Files:** 01-account-model.md, 02-pdas.md, 03-transactions.md, 04-rent-and-space.md
**Effort:** ~2 hours
**Dependencies:** None

### Phase 2: Advanced Foundations (4 docs)
**Files:** 05-cpis.md, 06-serialization.md, 07-anchor-framework.md, 08-testing-patterns.md
**Effort:** ~2 hours
**Dependencies:** Phase 1 concepts

### Phase 3: Security Content (2 files)
**Files:** historical-hacks.md, pre-production-checklist.md
**Effort:** ~1.5 hours
**Dependencies:** Foundations for context

### Phase 4: Anchor Tools (3 files)
**Files:** macros-reference.md, constraints-cheatsheet.md, testing-guide.md
**Effort:** ~1 hour
**Dependencies:** 07-anchor-framework.md

## Acceptance Criteria

### Functional Requirements
- [ ] All 13 files created with consistent format
- [ ] Each file has TLDR, concepts, code examples, common mistakes
- [ ] Code examples are syntactically correct Anchor Rust
- [ ] Cross-references between related docs

### Quality Gates
- [ ] No hallucinated API references - verify against Anchor 0.30.x docs
- [ ] Historical hacks have accurate dates and amounts
- [ ] Pre-production checklist covers all major vulnerability categories
- [ ] Testing guide works with current Anchor test setup

## Success Metrics

- Agents can explain WHY code patterns are used, not just WHAT
- Security-related questions get grounded answers with exploit references
- Production deployments have clear verification path

## Dependencies & Prerequisites

- Current Anchor version: 0.30.x
- Solana CLI version: 1.18.x
- Metaplex Core (not deprecated Token Metadata)

## References

### Internal
- `knowledge/challenges/*.md` - Source of patterns and gotchas
- `AGENTS.md` - Skill purpose and scope

### External
- [Solana Cookbook](https://solanacookbook.com)
- [Anchor Book](https://book.anchor-lang.com)
- [Neodyme Blog](https://blog.neodyme.io) - Security research
- [Rekt News](https://rekt.news) - Exploit postmortems
