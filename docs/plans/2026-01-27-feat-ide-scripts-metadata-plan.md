---
title: "feat: IDE Integrations, Scripts, and Enhanced Metadata"
type: feat
date: 2026-01-27
---

# IDE Integrations, Helper Scripts, and Enhanced Metadata

## Overview

Complete the Solana Wingman skill with IDE integrations, utility scripts, and richer metadata to match the maturity of ethereum-wingman and make the skill discoverable and usable across all major AI coding tools.

## Problem Statement

The skill has solid content but lacks:
1. **IDE integrations** - Empty stub directories for .claude/, .cursor/, .codex/, .agents/, .opencode/
2. **Helper scripts** - No utility scripts for gotcha checking or IDE setup
3. **Rich metadata** - Basic skill.json exists but could be more comprehensive for discovery

## Proposed Solution

Populate IDE directories with skill symlinks/copies, create utility scripts, and enhance metadata.

---

## Phase 1: IDE Integrations (~30 min)

Populate the IDE-specific directories so the skill works when cloned into any project.

### 1.1 Claude Code Integration

**File:** `.claude/skills/solana-wingman/SKILL.md`

```markdown
# Solana Wingman (Claude Code)

→ See main skill: `../../skills/solana-wingman/SKILL.md`

This is a symlink/reference. The canonical skill lives in `/skills/solana-wingman/`.
```

**Alternative:** Create symlink instead of copy
```bash
cd .claude/skills && ln -s ../../skills/solana-wingman solana-wingman
```

### 1.2 Cursor Integration

**File:** `.cursor/commands/solana-wingman.md`

```markdown
---
name: solana-wingman
description: Solana development tutor - teaches Anchor, PDAs, tokens, NFTs
---

# Solana Wingman Commands

## /solana-build
Scaffold and build a Solana program with Anchor

## /solana-audit  
Security review of Solana program code

## /solana-explain
Explain Solana concepts (PDAs, CPIs, rent, etc.)

## Usage
Reference the knowledge base at `knowledge/` for:
- `challenges/` - 10 learning challenges
- `foundations/` - Core Solana concepts
- `protocols/` - Jupiter, Marinade, MarginFi, Raydium
- `standards/` - SPL Token, Token-2022, Metaplex
```

### 1.3 Codex Integration

**File:** `.codex/skills/solana-wingman/SKILL.md`

Same structure as Claude - symlink or reference to main skill.

### 1.4 Agents (Generic) Integration

**File:** `.agents/skills/solana-wingman/SKILL.md`

Same structure - reference to main skill location.

### 1.5 OpenCode Integration

**File:** `.opencode/skills/solana-wingman/SKILL.md`

Same structure - reference to main skill location.

### Tasks - Phase 1

- [ ] Create `.claude/skills/solana-wingman/SKILL.md` (symlink or reference)
- [ ] Create `.cursor/commands/solana-wingman.md` with command definitions
- [ ] Create `.codex/skills/solana-wingman/SKILL.md` (symlink or reference)
- [ ] Populate `.agents/skills/solana-wingman/` with references + scripts
- [ ] Create `.opencode/skills/solana-wingman/SKILL.md` (symlink or reference)

---

## Phase 2: Helper Scripts (~45 min)

Create utility scripts that enhance the development workflow.

### 2.1 check-gotchas.sh

**File:** `skills/solana-wingman/scripts/check-gotchas.sh`

Scans code for common Solana gotchas and warns developers.

```bash
#!/bin/bash
# check-gotchas.sh - Scan for common Solana program gotchas
#
# Usage: ./check-gotchas.sh [directory]

set -e

DIR="${1:-.}"
FOUND=0

echo "🔍 Scanning for Solana gotchas in $DIR..."
echo ""

# Gotcha 1: Missing signer check
echo "Checking: Missing signer verification..."
if grep -rn "pub signer:" "$DIR" --include="*.rs" | grep -v "Signer<" > /dev/null 2>&1; then
    echo "⚠️  Found 'signer' without Signer<> type constraint"
    FOUND=$((FOUND + 1))
fi

# Gotcha 2: Arithmetic without checked ops
echo "Checking: Unchecked arithmetic..."
if grep -rn "\+ \|+=" "$DIR" --include="*.rs" | grep -v "checked_add\|saturating_add" > /dev/null 2>&1; then
    echo "⚠️  Potential unchecked arithmetic (use checked_add/saturating_add)"
    FOUND=$((FOUND + 1))
fi

# Gotcha 3: Missing owner check
echo "Checking: Account owner verification..."
if grep -rn "Account<" "$DIR" --include="*.rs" | grep -v "constraint = " > /dev/null 2>&1; then
    echo "⚠️  Account without owner constraint - verify manually"
fi

# Gotcha 4: PDA without bump seed
echo "Checking: PDA bump handling..."
if grep -rn "find_program_address" "$DIR" --include="*.rs" | grep -v "bump" > /dev/null 2>&1; then
    echo "⚠️  PDA derivation may be missing bump seed storage"
fi

# Gotcha 5: Reinitialization vulnerability
echo "Checking: Reinitialization protection..."
if grep -rn "#\[account(init" "$DIR" --include="*.rs" | grep -v "if_needed" > /dev/null 2>&1; then
    echo "✅ Using init (one-time) - verify reinitialization is blocked"
fi

echo ""
if [ $FOUND -eq 0 ]; then
    echo "✅ No obvious gotchas found. Run a full audit for production!"
else
    echo "⚠️  Found $FOUND potential issues. Review knowledge/gotchas/ for details."
fi
```

### 2.2 setup-cursor.sh

**File:** `skills/solana-wingman/scripts/setup-cursor.sh`

Sets up the skill for use with Cursor IDE.

```bash
#!/bin/bash
# setup-cursor.sh - Configure Cursor IDE for Solana Wingman
#
# Usage: ./setup-cursor.sh [project-directory]

set -e

PROJECT_DIR="${1:-.}"
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "🚀 Setting up Solana Wingman for Cursor..."

# Create .cursor directory if needed
mkdir -p "$PROJECT_DIR/.cursor/commands"

# Copy cursorrules if not exists
if [ ! -f "$PROJECT_DIR/.cursorrules" ]; then
    cp "$SKILL_DIR/../../.cursorrules" "$PROJECT_DIR/.cursorrules"
    echo "✅ Created .cursorrules"
else
    echo "ℹ️  .cursorrules already exists, skipping"
fi

# Copy commands
cp -r "$SKILL_DIR/../../.cursor/commands/"* "$PROJECT_DIR/.cursor/commands/" 2>/dev/null || true
echo "✅ Copied Cursor commands"

# Create reference to knowledge base
cat > "$PROJECT_DIR/.cursor/solana-wingman-context.md" << 'EOF'
# Solana Wingman Context

This project uses Solana Wingman for AI-assisted development.

## Knowledge Base Location
- Challenges: knowledge/challenges/
- Foundations: knowledge/foundations/
- Protocols: knowledge/protocols/
- Standards: knowledge/standards/
- Gotchas: knowledge/gotchas/

## Quick Commands
- Build: anchor build
- Test: anchor test
- Deploy: anchor deploy

## Common Patterns
See knowledge/foundations/ for:
- Account model
- PDAs
- CPIs
- Serialization
EOF

echo "✅ Created context file"
echo ""
echo "Done! Cursor is configured for Solana development."
echo "Tip: Reference @solana-wingman-context.md in your prompts."
```

### 2.3 init-project.sh (enhance existing)

**File:** `skills/solana-wingman/scripts/init-project.sh`

Already exists - verify it's complete and add any missing features.

### Tasks - Phase 2

- [ ] Create `skills/solana-wingman/scripts/check-gotchas.sh`
- [ ] Create `skills/solana-wingman/scripts/setup-cursor.sh`
- [ ] Review and enhance existing `init-project.sh`
- [ ] Make all scripts executable (`chmod +x`)
- [ ] Add scripts to skill.json "scripts" section

---

## Phase 3: Enhanced Metadata (~15 min)

Improve skill.json for better discovery and richer tool integration.

### 3.1 Enhanced skill.json

**File:** `skill.json` (update existing)

```json
{
  "name": "solana-wingman",
  "version": "1.0.0",
  "description": "Solana development tutor and builder. Teaches program development through Anchor framework, security best practices, and real protocol integrations.",
  "author": "x4484",
  "license": "MIT",
  "repository": "https://github.com/x4484/solana-wingman",
  "homepage": "https://github.com/x4484/solana-wingman#readme",
  
  "keywords": [
    "solana",
    "anchor",
    "rust",
    "blockchain",
    "web3",
    "smart-contracts",
    "defi",
    "nft",
    "spl-token",
    "metaplex",
    "compressed-nft",
    "token-2022"
  ],
  
  "triggers": [
    "solana",
    "anchor",
    "rust program",
    "spl token",
    "metaplex",
    "nft solana",
    "pda",
    "compressed nft",
    "solana development",
    "jupiter",
    "marinade",
    "marginfi",
    "raydium"
  ],
  
  "capabilities": [
    "teach solana concepts",
    "scaffold anchor projects",
    "write solana programs",
    "review program security",
    "debug transactions",
    "explain pdas",
    "token operations",
    "nft creation",
    "defi integrations",
    "protocol integration"
  ],
  
  "files": {
    "skill": "skills/solana-wingman/SKILL.md",
    "agents": "AGENTS.md",
    "cursorrules": ".cursorrules",
    "readme": "README.md"
  },
  
  "knowledge": {
    "challenges": {
      "path": "knowledge/challenges/",
      "count": 10,
      "description": "Hands-on learning challenges"
    },
    "foundations": {
      "path": "knowledge/foundations/",
      "count": 8,
      "description": "Core Solana concepts"
    },
    "gotchas": {
      "path": "knowledge/gotchas/",
      "description": "Common pitfalls and solutions"
    },
    "protocols": {
      "path": "knowledge/protocols/",
      "count": 4,
      "items": ["jupiter", "marinade", "marginfi", "raydium"]
    },
    "standards": {
      "path": "knowledge/standards/",
      "count": 4,
      "items": ["spl-token", "token-2022", "metaplex-core", "token-metadata"]
    }
  },
  
  "tools": {
    "anchor": "tools/anchor/",
    "solana-cli": "tools/solana-cli/",
    "security": "tools/security/"
  },
  
  "data": {
    "programs": "data/addresses/programs.json",
    "tokens": "data/addresses/tokens.json",
    "protocols": "data/addresses/protocols.json"
  },
  
  "scripts": {
    "init": "skills/solana-wingman/scripts/init-project.sh",
    "check-gotchas": "skills/solana-wingman/scripts/check-gotchas.sh",
    "setup-cursor": "skills/solana-wingman/scripts/setup-cursor.sh"
  },
  
  "prompts": {
    "build": "prompts/build-mode.md",
    "audit": "prompts/audit-mode.md",
    "optimize": "prompts/optimize-mode.md",
    "learn": "prompts/learn-mode.md"
  },
  
  "ide": {
    "claude": ".claude/skills/solana-wingman/",
    "cursor": ".cursor/commands/",
    "codex": ".codex/skills/solana-wingman/",
    "agents": ".agents/skills/solana-wingman/",
    "opencode": ".opencode/skills/solana-wingman/"
  },
  
  "compatibility": {
    "anchor": ">=0.29.0",
    "solana-cli": ">=1.17.0",
    "rust": ">=1.70.0"
  }
}
```

### Tasks - Phase 3

- [ ] Update `skill.json` with enhanced metadata structure
- [ ] Add knowledge counts and descriptions
- [ ] Add data paths for address files
- [ ] Add prompts section
- [ ] Add ide section with all tool paths
- [ ] Add compatibility requirements

---

## Acceptance Criteria

### Phase 1: IDE Integrations
- [ ] All 5 IDE directories have skill references
- [ ] `.cursor/commands/` has command definition file
- [ ] Symlinks work when skill is cloned into a project

### Phase 2: Scripts
- [ ] `check-gotchas.sh` runs and scans for common issues
- [ ] `setup-cursor.sh` configures Cursor IDE correctly
- [ ] All scripts are executable
- [ ] Scripts are documented in skill.json

### Phase 3: Metadata
- [ ] skill.json has comprehensive structure
- [ ] All knowledge paths documented with counts
- [ ] All data files referenced
- [ ] IDE paths documented
- [ ] Compatibility requirements specified

---

## Success Metrics

- Skill works out-of-box when cloned into any project
- Scripts provide real value for developers
- Metadata enables discovery on skill registries
- Structure matches ethereum-wingman maturity level

---

## References

- Ethereum Wingman structure: `~/clawd/skills/ethereum-wingman/`
- Current Solana Wingman: `~/projects/solana-wingman/`
- Skill registry format: skill.json standard

---

## Estimated Time

| Phase | Duration |
|-------|----------|
| 1. IDE Integrations | 30 min |
| 2. Helper Scripts | 45 min |
| 3. Enhanced Metadata | 15 min |
| **Total** | **~1.5 hours** |
