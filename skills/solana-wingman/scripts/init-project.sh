#!/bin/bash
# Initialize a new Solana project with Anchor

set -e

PROJECT_NAME=${1:-"my_solana_project"}

echo "🚀 Creating Solana project: $PROJECT_NAME"

# Check prerequisites
command -v solana >/dev/null 2>&1 || { echo "❌ Solana CLI not installed. Run: sh -c \"\$(curl -sSfL https://release.solana.com/stable/install)\""; exit 1; }
command -v anchor >/dev/null 2>&1 || { echo "❌ Anchor not installed. Run: cargo install --git https://github.com/coral-xyz/anchor anchor-cli"; exit 1; }
command -v rustc >/dev/null 2>&1 || { echo "❌ Rust not installed. Run: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"; exit 1; }

# Create project
anchor init "$PROJECT_NAME"
cd "$PROJECT_NAME"

# Configure for localhost
solana config set --url localhost

# Add common dependencies
cat >> programs/"$PROJECT_NAME"/Cargo.toml << 'EOF'

# Common Solana dependencies
[dependencies.anchor-spl]
version = "0.30.0"
features = ["token", "associated_token"]
EOF

# Create useful directories
mkdir -p tests/fixtures
mkdir -p scripts
mkdir -p docs

# Create a helper script for local development
cat > scripts/dev.sh << 'DEVSCRIPT'
#!/bin/bash
# Start local validator and watch for changes

# Start validator in background
solana-test-validator --reset &
VALIDATOR_PID=$!

# Wait for validator to start
sleep 3

# Build and deploy
anchor build
anchor deploy

echo "✅ Local validator running (PID: $VALIDATOR_PID)"
echo "   Press Ctrl+C to stop"

# Cleanup on exit
trap "kill $VALIDATOR_PID 2>/dev/null" EXIT

# Keep running
wait
DEVSCRIPT
chmod +x scripts/dev.sh

# Create .gitignore additions
cat >> .gitignore << 'GITIGNORE'

# Solana
test-ledger/
.anchor/
target/

# IDE
.idea/
.vscode/
*.swp

# Logs
*.log
GITIGNORE

echo ""
echo "✅ Project created successfully!"
echo ""
echo "Next steps:"
echo "  cd $PROJECT_NAME"
echo "  solana-test-validator  # In one terminal"
echo "  anchor build           # Build the program"
echo "  anchor test            # Run tests"
echo ""
echo "Or use the dev script:"
echo "  ./scripts/dev.sh"
