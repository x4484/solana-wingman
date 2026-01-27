# Solana Wingman

A comprehensive Solana development tutor and guide built as an Agent Skill. Teaches smart contract (program) development through Solana-native challenges, Anchor framework, and security best practices.

## Quick Start

Build a Solana program from scratch with AI assistance:

```bash
# 1. Create a new project folder
mkdir my-solana-project
cd my-solana-project

# 2. Install the Solana Wingman skill
npx skills add solana-wingman

# 3. Open in Cursor (or your AI-enabled editor)
cursor .
```

Then just tell the AI what you want to build:

- "Help me build a staking program where users deposit SOL and earn rewards"
- "Create an NFT collection with Metaplex"
- "Build a token swap using constant product formula"

The Solana Wingman will:

- 🏗️ Scaffold an Anchor project for you
- ⚠️ Warn you about critical gotchas (PDAs, rent, account model, etc.)
- 🔐 Guide you on security best practices
- 📚 Reference Solana-native challenges for learning

## What is Solana Wingman?

Solana Wingman is a knowledge base and prompt system that helps AI agents assist developers learning Solana development. It covers:

- **10 Solana-Native Challenges**: Original challenges designed for Solana's unique architecture
- **Anchor Framework**: Tooling docs, patterns, testing, deployment
- **DeFi Protocols**: Jupiter, Raydium, Marinade patterns
- **Token Standards**: SPL Token, Token-2022, Metaplex NFTs, Compressed NFTs
- **Security**: Critical gotchas, common exploits, pre-production checklist

## The Most Important Concept

> **ACCOUNTS ARE EVERYTHING ON SOLANA.**

Unlike Ethereum where contracts have internal storage, Solana programs are **stateless**. All data lives in **accounts** that programs read and write.

The Wingman will always ask: "Where does this data live? Who owns that account?"

## Installation

### Via skills.sh (Recommended)

```bash
npx skills add solana-wingman
```

This works with Cursor, Claude Code, Codex, OpenCode, and other AI coding agents.

### Manual Installation

**For Cursor:**
Copy `.cursorrules` to your project root or add to your global Cursor rules.

**For Claude Code:**
Reference the `CLAUDE.md` file in your project instructions.

## Directory Structure

```
solana-wingman/
├── skills/
│   └── solana-wingman/       # skills.sh compatible package
│       ├── SKILL.md          # Skill definition
│       ├── AGENTS.md         # Full compiled instructions
│       ├── scripts/          # Helper scripts
│       └── references/       # Key knowledge files
├── knowledge/
│   ├── challenges/           # 10 Solana-native challenges
│   ├── foundations/          # Core concepts
│   ├── gotchas/              # Security knowledge
│   ├── protocols/            # DeFi protocol docs
│   └── standards/            # Token standards
├── tools/
│   ├── anchor/               # Anchor documentation
│   ├── solana-cli/           # CLI reference
│   └── security/             # Security tools
├── prompts/                  # AI agent prompts
├── AGENTS.md
├── CLAUDE.md
├── .cursorrules
└── skill.json
```

## Challenges

Each challenge teaches a key Solana concept:

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

## Critical Gotchas

Every Solana developer must know:

1. **Account Model ≠ EVM Storage** - Programs are stateless; data lives in accounts
2. **PDAs Have No Private Key** - Derived deterministically from seeds
3. **Token Accounts Are Separate** - Each token needs its own account per wallet
4. **Rent-Exemption Required** - Accounts need ~2 years rent upfront
5. **Compute Units ≠ Gas** - Fixed budget (200k default, 1.4M max)
6. **Token-2022 Is Different** - Separate program from SPL Token!

## Usage Examples

### Teaching Mode

- "How does the Solana account model work?"
- "Explain PDAs and why they're useful"
- "What's the difference between SPL Token and Token-2022?"

### Build Mode

- "Help me build a token staking program"
- "Create an NFT minting page"
- "Set up a swap with slippage protection"

### Review Mode

- "Review this program for vulnerabilities"
- "Check my PDA derivation for collisions"
- "Audit this CPI for reentrancy"

### Debug Mode

- "Why is my transaction failing with 'account not found'?"
- "Debug this 'insufficient funds for rent' error"
- "Fix my token transfer that's reverting"

## Prerequisites

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Install Anchor
cargo install --git https://github.com/coral-xyz/anchor anchor-cli

# Verify installations
solana --version
anchor --version
```

## Contributing

To add new content:

1. Add markdown files to appropriate directory
2. Follow existing format (TLDR, code examples, security notes)
3. Update skill.json if adding new capabilities
4. Test with AI agent to ensure clarity

## License

MIT License - Use freely for learning and building.

## Credits

Inspired by [ethereum-wingman](https://github.com/austintgriffith/ethereum-wingman) by Austin Griffith.

Built for the Solana developer community.

Integrates knowledge from:
- [Solana Docs](https://solana.com/docs)
- [Anchor](https://www.anchor-lang.com/)
- [Metaplex](https://developers.metaplex.com/)
- [Solana Cookbook](https://solanacookbook.com/)
