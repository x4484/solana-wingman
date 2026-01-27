# Anchor Testing Guide

## Quick Start

```bash
# Run all tests
anchor test

# Run specific test file
anchor test -- --grep "initialize"

# Run with logs
RUST_LOG=solana_runtime::message_processor=trace anchor test
```

## Test File Structure

```typescript
// tests/my_program.test.ts
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { MyProgram } from "../target/types/my_program";
import { expect } from "chai";

describe("my_program", () => {
  // Configure provider
  anchor.setProvider(anchor.AnchorProvider.env());
  
  const program = anchor.workspace.MyProgram as Program<MyProgram>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  
  // Test cases
  it("initializes correctly", async () => {
    // ...
  });
});
```

## Common Test Patterns

### Basic Instruction Call

```typescript
it("creates an account", async () => {
  const myAccount = anchor.web3.Keypair.generate();
  
  await program.methods
    .initialize(new anchor.BN(42))
    .accounts({
      myAccount: myAccount.publicKey,
      user: provider.wallet.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .signers([myAccount])
    .rpc();
  
  // Fetch and verify
  const account = await program.account.myAccount.fetch(myAccount.publicKey);
  expect(account.data.toNumber()).to.equal(42);
});
```

### Testing PDAs

```typescript
it("uses PDAs", async () => {
  const [pda, bump] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("config"), provider.wallet.publicKey.toBuffer()],
    program.programId
  );
  
  await program.methods
    .initConfig()
    .accounts({
      config: pda,
      authority: provider.wallet.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();
  
  const config = await program.account.config.fetch(pda);
  expect(config.bump).to.equal(bump);
});
```

### Testing with Additional Signers

```typescript
it("requires additional signer", async () => {
  const otherSigner = anchor.web3.Keypair.generate();
  
  // Airdrop SOL to new signer
  const sig = await provider.connection.requestAirdrop(
    otherSigner.publicKey,
    anchor.web3.LAMPORTS_PER_SOL
  );
  await provider.connection.confirmTransaction(sig);
  
  await program.methods
    .coSignedAction()
    .accounts({
      user: provider.wallet.publicKey,
      coSigner: otherSigner.publicKey,
    })
    .signers([otherSigner])  // Add as signer
    .rpc();
});
```

## Error Testing

### Expecting Specific Error

```typescript
import { AnchorError } from "@coral-xyz/anchor";

it("fails with specific error", async () => {
  try {
    await program.methods
      .restrictedAction()
      .accounts({
        config: configPda,
        user: unauthorizedUser.publicKey,
      })
      .signers([unauthorizedUser])
      .rpc();
    
    expect.fail("Should have thrown");
  } catch (err) {
    expect(err).to.be.instanceOf(AnchorError);
    const anchorError = err as AnchorError;
    expect(anchorError.error.errorCode.code).to.equal("Unauthorized");
    expect(anchorError.error.errorCode.number).to.equal(6001);
  }
});
```

### Using chai-as-promised

```typescript
import chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised);

it("rejects invalid amount", async () => {
  await expect(
    program.methods
      .transfer(new anchor.BN(0))
      .accounts({...})
      .rpc()
  ).to.be.rejectedWith(/InvalidAmount/);
});
```

### Testing Constraint Violations

```typescript
it("enforces has_one constraint", async () => {
  const wrongAuthority = anchor.web3.Keypair.generate();
  
  try {
    await program.methods
      .ownerOnlyAction()
      .accounts({
        vault: vaultPda,
        authority: wrongAuthority.publicKey,  // Wrong authority
      })
      .signers([wrongAuthority])
      .rpc();
    expect.fail("Should have failed");
  } catch (err) {
    expect(err.toString()).to.include("has_one");
  }
});
```

## Token Testing

### Create Test Mint

```typescript
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";

it("handles tokens", async () => {
  // Create mint
  const mint = await createMint(
    provider.connection,
    (provider.wallet as anchor.Wallet).payer,
    provider.wallet.publicKey,  // Mint authority
    null,                        // Freeze authority
    6                            // Decimals
  );
  
  // Create token account
  const userAta = await createAssociatedTokenAccount(
    provider.connection,
    (provider.wallet as anchor.Wallet).payer,
    mint,
    provider.wallet.publicKey
  );
  
  // Mint tokens
  await mintTo(
    provider.connection,
    (provider.wallet as anchor.Wallet).payer,
    mint,
    userAta,
    provider.wallet.publicKey,
    1_000_000_000  // 1000 tokens with 6 decimals
  );
  
  // Verify
  const account = await getAccount(provider.connection, userAta);
  expect(account.amount.toString()).to.equal("1000000000");
});
```

## Bankrun (Faster Tests)

```typescript
import { startAnchor } from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";

describe("fast tests", () => {
  let provider: BankrunProvider;
  let program: Program<MyProgram>;
  
  before(async () => {
    const context = await startAnchor("", [], []);
    provider = new BankrunProvider(context);
    program = new Program(IDL, PROGRAM_ID, provider);
  });
  
  it("runs fast", async () => {
    // No network calls, runs in-memory
    await program.methods.initialize().accounts({...}).rpc();
  });
});
```

## Test Helpers

### Setup Helper

```typescript
async function setupVault(
  program: Program<MyProgram>,
  authority: anchor.web3.Keypair
): Promise<anchor.web3.PublicKey> {
  const [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), authority.publicKey.toBuffer()],
    program.programId
  );
  
  await program.methods
    .initVault()
    .accounts({
      vault: vaultPda,
      authority: authority.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .signers([authority])
    .rpc();
  
  return vaultPda;
}
```

### Airdrop Helper

```typescript
async function airdrop(
  connection: anchor.web3.Connection,
  pubkey: anchor.web3.PublicKey,
  amount: number = 1
) {
  const sig = await connection.requestAirdrop(
    pubkey,
    amount * anchor.web3.LAMPORTS_PER_SOL
  );
  await connection.confirmTransaction(sig);
}
```

### Time Travel (Bankrun)

```typescript
// With bankrun, you can manipulate time
it("tests time-based logic", async () => {
  // Set initial time
  const context = await startAnchor("", [], [], {
    timestamp: new Date("2025-01-01").getTime() / 1000,
  });
  
  // ... create lock with 1-day unlock
  
  // Advance time
  context.warpToSlot(context.lastBlockhash.slot + 100_000);
  
  // Now unlock should work
});
```

## Debugging Tests

### Enable Logs

```bash
# See program logs
RUST_LOG=solana_runtime::message_processor=trace anchor test

# See specific program logs
RUST_LOG=solana_runtime::message_processor=trace,my_program=debug anchor test
```

### View Transaction Details

```typescript
const sig = await program.methods.myInstruction().accounts({...}).rpc();

// Get full transaction
const tx = await provider.connection.getTransaction(sig, {
  commitment: "confirmed",
});
console.log("Logs:", tx?.meta?.logMessages);
console.log("Compute units:", tx?.meta?.computeUnitsConsumed);
```

### Simulate First

```typescript
// Simulate before sending
const result = await program.methods
  .myInstruction()
  .accounts({...})
  .simulate();

console.log("Would use compute:", result.unitsConsumed);
console.log("Logs:", result.logs);
```

## Test Organization

```
tests/
├── helpers/
│   ├── setup.ts        # Test fixtures
│   ├── tokens.ts       # Token helpers
│   └── time.ts         # Time manipulation
├── unit/
│   ├── initialize.test.ts
│   ├── deposit.test.ts
│   └── withdraw.test.ts
├── integration/
│   ├── full_flow.test.ts
│   └── edge_cases.test.ts
└── e2e/
    └── devnet.test.ts  # Optional: real devnet tests
```

## Common Gotchas

### Transaction Confirmation

```typescript
// ❌ Might fail - tx not confirmed
await program.methods.init().accounts({...}).rpc();
const account = await program.account.myAccount.fetch(pda);

// ✅ Wait for confirmation
const sig = await program.methods.init().accounts({...}).rpc();
await provider.connection.confirmTransaction(sig, "confirmed");
const account = await program.account.myAccount.fetch(pda);
```

### Keypair vs PublicKey

```typescript
// signers need Keypair (has private key)
// accounts just need PublicKey

const keypair = anchor.web3.Keypair.generate();

.accounts({
  newAccount: keypair.publicKey,  // PublicKey
})
.signers([keypair])  // Keypair
```

### BN for Numbers

```typescript
// Solana uses u64/i64 - use BN
import { BN } from "@coral-xyz/anchor";

await program.methods
  .transfer(new BN(1_000_000))  // ✅
  .accounts({...})
  .rpc();

// NOT this:
await program.methods
  .transfer(1_000_000)  // ❌ Might overflow or type error
  .accounts({...})
  .rpc();
```

---

## Related Docs

- **[../foundations/08-testing-patterns.md](../foundations/08-testing-patterns.md)** - General testing patterns
- **[macros-reference.md](./macros-reference.md)** - Anchor macros
