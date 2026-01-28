#!/bin/bash
# setup-cursor.sh - Configure Cursor IDE for Solana Wingman
#
# Usage: ./setup-cursor.sh [project-directory]

set -e

PROJECT_DIR="${1:-.}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

echo "🚀 Setting up Solana Wingman for Cursor IDE..."
echo ""

# Create .cursor directory structure
mkdir -p "$PROJECT_DIR/.cursor/commands"

# Copy .cursorrules if it doesn't exist
if [ -f "$SKILL_ROOT/.cursorrules" ]; then
    if [ ! -f "$PROJECT_DIR/.cursorrules" ]; then
        cp "$SKILL_ROOT/.cursorrules" "$PROJECT_DIR/.cursorrules"
        echo "✅ Created .cursorrules"
    else
        echo "ℹ️  .cursorrules already exists, skipping"
    fi
fi

# Copy commands
if [ -d "$SKILL_ROOT/.cursor/commands" ]; then
    cp -r "$SKILL_ROOT/.cursor/commands/"* "$PROJECT_DIR/.cursor/commands/" 2>/dev/null || true
    echo "✅ Copied Cursor commands"
fi

# Create context file for the project
cat > "$PROJECT_DIR/.cursor/solana-wingman.md" << 'EOF'
# Solana Wingman Context

This project uses Solana Wingman for AI-assisted Solana development.

## Knowledge Base

Reference these when working on Solana programs:

| Resource | Path | Description |
|----------|------|-------------|
| Challenges | `knowledge/challenges/` | 10 hands-on learning challenges |
| Foundations | `knowledge/foundations/` | Core Solana concepts |
| Protocols | `knowledge/protocols/` | Jupiter, Marinade, MarginFi, Raydium |
| Standards | `knowledge/standards/` | SPL Token, Token-2022, Metaplex |
| Gotchas | `knowledge/gotchas/` | Common pitfalls |

## Data Files

| File | Content |
|------|---------|
| `data/addresses/programs.json` | Common program IDs |
| `data/addresses/tokens.json` | Popular token mints (USDC, SOL, etc.) |
| `data/addresses/protocols.json` | DeFi protocol addresses |

## Quick Commands

```bash
# Build
anchor build

# Test
anchor test

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Check for gotchas
./skills/solana-wingman/scripts/check-gotchas.sh programs/
```

## Security Checklist

Before deploying to mainnet:

1. [ ] Run `check-gotchas.sh` on all programs
2. [ ] Review `knowledge/gotchas/critical-gotchas.md`
3. [ ] Use `prompts/audit-mode.md` for full review
4. [ ] Verify all arithmetic uses checked operations
5. [ ] Confirm PDA bumps are stored
6. [ ] Check account owner validations
7. [ ] Test edge cases and error conditions

## Tips for AI Assistance

When asking for help:

- Reference specific knowledge files: `@knowledge/foundations/02-pdas.md`
- Use mode prompts: `@prompts/audit-mode.md`
- Check protocol docs: `@knowledge/protocols/jupiter.md`

EOF

echo "✅ Created context file at .cursor/solana-wingman.md"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Cursor setup complete!"
echo ""
echo "Tips:"
echo "  • Reference @solana-wingman.md in your prompts"
echo "  • Use /solana-build, /solana-audit, /solana-explain"
echo "  • Check .cursor/commands/ for available commands"
