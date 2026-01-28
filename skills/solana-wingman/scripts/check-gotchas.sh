#!/bin/bash
# check-gotchas.sh - Scan for common Solana program gotchas
#
# Usage: ./check-gotchas.sh [directory]

set -e

DIR="${1:-.}"
ISSUES=0

echo "🔍 Scanning for Solana gotchas in $DIR..."
echo ""

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
    ISSUES=$((ISSUES + 1))
}

ok() {
    echo -e "${GREEN}✅ $1${NC}"
}

info() {
    echo -e "   $1"
}

# Only scan .rs files
RS_FILES=$(find "$DIR" -name "*.rs" -type f 2>/dev/null | grep -v target/ | grep -v node_modules/)

if [ -z "$RS_FILES" ]; then
    echo "No Rust files found in $DIR"
    exit 0
fi

echo "Scanning $(echo "$RS_FILES" | wc -l | tr -d ' ') Rust files..."
echo ""

# Gotcha 1: Unchecked arithmetic
echo "1️⃣  Checking: Unchecked arithmetic operations..."
if echo "$RS_FILES" | xargs grep -l '\+ [0-9]\|+= \|\.add(\|- [0-9]\|-= \|\.sub(' 2>/dev/null | head -5 | grep -q .; then
    warn "Potential unchecked arithmetic found"
    info "Use checked_add(), checked_sub(), or saturating operations"
    info "Files:"
    echo "$RS_FILES" | xargs grep -l '\+ [0-9]\|+= ' 2>/dev/null | head -3 | while read f; do
        info "  - $f"
    done
else
    ok "No obvious unchecked arithmetic"
fi
echo ""

# Gotcha 2: Missing signer check
echo "2️⃣  Checking: Signer verification..."
if echo "$RS_FILES" | xargs grep -l "pub authority:" 2>/dev/null | xargs grep -L "Signer<" 2>/dev/null | head -3 | grep -q .; then
    warn "Found 'authority' fields that may need Signer<> constraint"
else
    ok "Signer patterns look correct"
fi
echo ""

# Gotcha 3: PDA bump handling
echo "3️⃣  Checking: PDA bump storage..."
if echo "$RS_FILES" | xargs grep -l "find_program_address" 2>/dev/null | head -3 | grep -q .; then
    info "Found PDA derivations - verify bumps are stored"
    echo "$RS_FILES" | xargs grep -l "find_program_address" 2>/dev/null | head -3 | while read f; do
        if ! grep -q "bump" "$f" 2>/dev/null; then
            warn "PDA in $f may be missing bump storage"
        fi
    done
else
    ok "No manual PDA derivations found"
fi
echo ""

# Gotcha 4: init vs init_if_needed
echo "4️⃣  Checking: Account initialization patterns..."
if echo "$RS_FILES" | xargs grep -l "init_if_needed" 2>/dev/null | head -3 | grep -q .; then
    warn "Using init_if_needed - ensure this is intentional"
    info "init_if_needed can mask reinitialization bugs"
else
    ok "Using explicit init (safer)"
fi
echo ""

# Gotcha 5: Owner checks
echo "5️⃣  Checking: Account owner validation..."
if echo "$RS_FILES" | xargs grep -l "#\[account(" 2>/dev/null | xargs grep -l "Account<" 2>/dev/null | head -3 | grep -q .; then
    info "Found Account<> types - verify owner constraints exist"
fi
echo ""

# Gotcha 6: Close account handling
echo "6️⃣  Checking: Account closure patterns..."
if echo "$RS_FILES" | xargs grep -l "close\s*=" 2>/dev/null | head -3 | grep -q .; then
    ok "Found close constraints"
else
    info "No close constraints found (may be intentional)"
fi
echo ""

# Gotcha 7: Rent exemption
echo "7️⃣  Checking: Rent/space calculations..."
if echo "$RS_FILES" | xargs grep -l "space\s*=" 2>/dev/null | head -3 | grep -q .; then
    ok "Found space calculations"
else
    warn "No explicit space calculations - verify account sizes"
fi
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $ISSUES -eq 0 ]; then
    echo -e "${GREEN}✅ No obvious gotchas found!${NC}"
    echo ""
    echo "Note: This is a basic scan. For production:"
    echo "  - Run a full security audit"
    echo "  - Review knowledge/gotchas/critical-gotchas.md"
    echo "  - Consider a professional audit for mainnet"
else
    echo -e "${YELLOW}⚠️  Found $ISSUES potential issue(s)${NC}"
    echo ""
    echo "Review the warnings above and check:"
    echo "  - knowledge/gotchas/critical-gotchas.md"
    echo "  - prompts/audit-mode.md for full audit"
fi
