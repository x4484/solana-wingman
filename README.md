# Solana Wingman

AI agent skills for Solana development. Four skills covering program development, DeFi integrations, Blinks/Actions, and security auditing.

## Skills

| Skill | What it does |
|-------|-------------|
| [solana-wingman](skills/solana-wingman/) | Solana development tutor. Teaches Anchor programs through 10 hands-on challenges, covers the account model, PDAs, CPIs, and critical gotchas. |
| [solana-defi](skills/solana-defi/) | Jupiter DeFi integrations. Token swaps (Ultra API), limit orders (Trigger API), DCA (Recurring API), token info and security checks. |
| [solana-blinks](skills/solana-blinks/) | Build Solana Actions (blinks) with v2 spec support: action chaining, rich inputs, and interactive transaction buttons on X, Discord, and the web. |
| [solana-security](skills/solana-security/) | Audit Anchor programs for 12 vulnerability categories including signer checks, PDA collisions, account revival, CPI reentrancy, and pre-deploy checklists. |

## Install

```bash
npx skills add solana-wingman
```

Works with Cursor, Claude Code, Codex, OpenCode, and other AI coding agents.

### Manual

**Cursor:** Copy `.cursorrules` to your project root.

**Claude Code:** Reference the skill in your project instructions.

## Usage

Tell the AI what you need:

```
"Help me build a staking program"
"Swap SOL to USDC using Jupiter"
"Create a tip blink for my project"
"Audit this Anchor program for vulnerabilities"
```

## Directory Structure

```
solana-wingman/
├── skills/
│   ├── solana-wingman/          # Core development tutor
│   │   ├── SKILL.md
│   │   ├── scripts/             # Project init, gotcha checker
│   │   └── references/          # Critical gotchas reference
│   ├── solana-defi/             # Jupiter DeFi integrations
│   │   ├── SKILL.md
│   │   ├── templates/           # Swap, limit order, DCA templates
│   │   └── references/          # Token mints, troubleshooting, API comparison
│   ├── solana-blinks/           # Blinks & Actions builder
│   │   ├── SKILL.md
│   │   ├── templates/           # Tip link, token purchase templates
│   │   ├── scripts/             # Scaffold, test scripts
│   │   └── references/          # Actions spec, gotchas, Dialect registry
│   └── solana-security/         # Security auditor
│       └── SKILL.md
├── knowledge/
│   ├── challenges/              # 10 hands-on challenges (00-09)
│   ├── foundations/             # Account model, PDAs, CPIs, rent, serialization
│   ├── gotchas/                 # Historical hacks and exploit patterns
│   ├── protocols/               # Jupiter, Raydium, Marinade, MarginFi
│   └── standards/               # SPL Token, Token-2022, Metaplex
├── tools/
│   ├── anchor/                  # Constraints, macros, testing guides
│   └── security/                # Pre-production checklist
├── prompts/                     # Build, audit, optimize, learn modes
└── data/addresses/              # Program IDs, token mints, protocol addresses
```

## Challenges

| # | Challenge | Concept |
|---|-----------|---------|
| 0 | Hello Solana | First Anchor program, accounts basics |
| 1 | SPL Token | Fungible tokens, ATAs, minting |
| 2 | NFT Metaplex | NFT standard, metadata, collections |
| 3 | PDA Escrow | PDAs, program authority, escrow pattern |
| 4 | Staking | Time-based rewards, deposits/withdrawals |
| 5 | Token-2022 | Transfer hooks, confidential transfers |
| 6 | Compressed NFTs | State compression, Merkle trees |
| 7 | Oracle (Pyth) | Price feeds, staleness checks |
| 8 | AMM Swap | Constant product, liquidity pools |
| 9 | Blinks & Actions | Shareable transactions, unfurling |

## Prerequisites

```bash
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Solana CLI
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"

# Anchor (via avm)
cargo install --git https://github.com/coral-xyz/anchor avm --force
avm install latest
avm use latest
```

## License

MIT
