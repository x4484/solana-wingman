# Testing Patterns

## TLDR

Test your Solana programs with TypeScript (integration tests) and Rust (unit tests). Use bankrun for fast local testing, anchor's built-in test framework for convenience, or the solana-test-validator for full fidelity. Good tests catch bugs before they cost you money.

## Core Concepts

### Testing Pyramid

```
┌─────────────────────────────────────────────────────────┐
│                   Testing Strategy                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│                    ╱╲                                   │
│                   ╱  ╲                                  │
│                  ╱    ╲   E2E (devnet/mainnet)         │
│                 ╱──────╲  • Full network behavior      │
│                ╱        ╲ • Slow, expensive             │
│               ╱──────────╲                              │
│              ╱            ╲  Integration (local)       │
│             ╱──────────────╲ • TypeScript + bankrun    │
│            ╱                ╲• Test instruction flows   │
│           ╱──────────────────╲                          │
│          ╱   Unit (Rust)      ╲ • Fast                 │
│         ╱──────────────────────╲• Test individual fns   │
│                                                         │
│  Run unit tests every save                             │
│  Run integration tests before commit                   │
│  Run E2E tests before deploy                           │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Testing Tools

| Tool | Speed | Fidelity | Use Case |
|------|-------|----------|----------|
| **bankrun** | 🚀 Fast | High | Most integration tests |
| **anchor test** | Medium | High | Anchor-native testing |
| **solana-test-validator** | Slow | Full | Complex scenarios |
| **Rust unit tests** | 🚀 Fast | Low | Pure logic |

## Code Examples

### Basic Anchor Test (TypeScript)

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { MyProgram } from "../target/types/my_program";
import { expect } from "chai";

describe("my_program", () => {
  // Configure the client
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.MyProgram as Program<MyProgram>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;

  it("initializes the account", async () => {
    const [pda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("my_account"), provider.wallet.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .initialize(new anchor.BN(42))
      .accounts({
        myAccount: pda,
        authority: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    // Fetch and verify
    const account = await program.account.myAccount.fetch(pda);
    expect(account.data.toNumber()).to.equal(42);
    expect(account.authority.toString()).to.equal(
      provider.wallet.publicKey.toString()
    );
  });

  it("fails with wrong authority", async () => {
    const [pda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("my_account"), provider.wallet.publicKey.toBuffer()],
      program.programId
    );

    const wrongAuthority = anchor.web3.Keypair.generate();

    try {
      await program.methods
        .update(new anchor.BN(100))
        .accounts({
          myAccount: pda,
          authority: wrongAuthority.publicKey,
        })
        .signers([wrongAuthority])
        .rpc();
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err.toString()).to.include("has_one");
    }
  });
});
```

### Using Bankrun (Faster Tests)

```typescript
import { startAnchor } from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { MyProgram } from "../target/types/my_program";

describe("my_program (bankrun)", () => {
  let provider: BankrunProvider;
  let program: Program<MyProgram>;
  let context: any;

  before(async () => {
    // Start bankrun with your program
    context = await startAnchor(
      "",  // Project root
      [],  // Extra programs to load
      []   // Initial accounts
    );
    
    provider = new BankrunProvider(context);
    program = new Program(IDL, PROGRAM_ID, provider);
  });

  it("fast test", async () => {
    // Tests run in-memory, no network calls
    const result = await program.methods
      .initialize(new BN(42))
      .accounts({...})
      .rpc();
    
    // Bankrun auto-confirms transactions
    const account = await program.account.myAccount.fetch(pda);
    expect(account.data.toNumber()).to.equal(42);
  });
});
```

### Testing With Initial State

```typescript
import { startAnchor } from "solana-bankrun";

describe("with initial state", () => {
  before(async () => {
    // Pre-fund accounts before tests
    const user = Keypair.generate();
    
    context = await startAnchor(
      "",
      [],
      [
        // Fund user with 10 SOL
        {
          address: user.publicKey,
          info: {
            lamports: 10 * LAMPORTS_PER_SOL,
            data: Buffer.alloc(0),
            owner: SystemProgram.programId,
            executable: false,
          },
        },
        // Pre-create an account with data
        {
          address: existingAccount,
          info: {
            lamports: await context.banksClient.getRent(100),
            data: existingData,
            owner: program.programId,
            executable: false,
          },
        },
      ]
    );
  });
});
```

### Testing Error Cases

```typescript
import { expect } from "chai";
import { AnchorError } from "@coral-xyz/anchor";

it("handles insufficient funds", async () => {
  try {
    await program.methods
      .withdraw(new anchor.BN(1_000_000_000))  // More than available
      .accounts({...})
      .rpc();
    expect.fail("Expected error");
  } catch (err) {
    // Check for specific error
    if (err instanceof AnchorError) {
      expect(err.error.errorCode.code).to.equal("InsufficientFunds");
      expect(err.error.errorCode.number).to.equal(6001);
    } else {
      throw err;
    }
  }
});

// Or using chai-as-promised
import chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised);

it("rejects unauthorized", async () => {
  await expect(
    program.methods.adminOnly().accounts({...}).rpc()
  ).to.be.rejectedWith(/Unauthorized/);
});
```

### Rust Unit Tests

```rust
// In your lib.rs or a separate tests module
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_rewards() {
        let staked_amount = 1000;
        let duration_seconds = 86400;  // 1 day
        let rate_per_second = 100;
        
        let rewards = calculate_rewards(staked_amount, duration_seconds, rate_per_second);
        
        assert_eq!(rewards, 8_640_000);
    }

    #[test]
    fn test_calculate_rewards_overflow() {
        let staked_amount = u64::MAX;
        let duration_seconds = u64::MAX;
        let rate_per_second = u64::MAX;
        
        // Should handle overflow gracefully
        let result = calculate_rewards_safe(staked_amount, duration_seconds, rate_per_second);
        assert!(result.is_err());
    }

    #[test]
    fn test_pda_derivation() {
        let user = Pubkey::new_unique();
        let program_id = Pubkey::new_unique();
        
        let (pda, bump) = Pubkey::find_program_address(
            &[b"vault", user.as_ref()],
            &program_id,
        );
        
        // Verify PDA is off-curve
        assert!(pda.is_on_curve() == false);
        
        // Verify we can recreate it
        let recreated = Pubkey::create_program_address(
            &[b"vault", user.as_ref(), &[bump]],
            &program_id,
        ).unwrap();
        
        assert_eq!(pda, recreated);
    }
}
```

### Test Fixtures Pattern

```typescript
// tests/fixtures.ts
import { Keypair, PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";

export class TestFixtures {
  program: Program<MyProgram>;
  provider: anchor.AnchorProvider;
  admin: Keypair;
  user: Keypair;
  configPda: PublicKey;

  constructor(program: Program<MyProgram>, provider: anchor.AnchorProvider) {
    this.program = program;
    this.provider = provider;
    this.admin = Keypair.generate();
    this.user = Keypair.generate();
  }

  async setup() {
    // Airdrop SOL
    await Promise.all([
      this.airdrop(this.admin.publicKey, 10),
      this.airdrop(this.user.publicKey, 10),
    ]);

    // Derive PDAs
    [this.configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      this.program.programId
    );

    // Initialize config
    await this.program.methods
      .initializeConfig()
      .accounts({
        config: this.configPda,
        admin: this.admin.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([this.admin])
      .rpc();
  }

  async airdrop(pubkey: PublicKey, sol: number) {
    const sig = await this.provider.connection.requestAirdrop(
      pubkey,
      sol * anchor.web3.LAMPORTS_PER_SOL
    );
    await this.provider.connection.confirmTransaction(sig);
  }
}

// In tests
describe("my_program", () => {
  let fixtures: TestFixtures;

  before(async () => {
    fixtures = new TestFixtures(program, provider);
    await fixtures.setup();
  });

  it("uses fixtures", async () => {
    await program.methods
      .doSomething()
      .accounts({
        config: fixtures.configPda,
        user: fixtures.user.publicKey,
      })
      .signers([fixtures.user])
      .rpc();
  });
});
```

## Common Mistakes

### ❌ Not Waiting for Confirmation

```typescript
// WRONG: Transaction might not be processed yet
await program.methods.initialize().accounts({...}).rpc();
const account = await program.account.myAccount.fetch(pda);  // ❌ Might fail

// RIGHT: Wait for confirmation (or use bankrun which auto-confirms)
const sig = await program.methods.initialize().accounts({...}).rpc();
await provider.connection.confirmTransaction(sig, "confirmed");
const account = await program.account.myAccount.fetch(pda);  // ✅
```

### ❌ Not Testing Error Cases

```typescript
// WRONG: Only testing happy path
it("works", async () => {
  await program.methods.transfer(100).accounts({...}).rpc();
  // ✅ Works!
});

// RIGHT: Also test failures
it("rejects negative amount", async () => { /* ... */ });
it("rejects insufficient balance", async () => { /* ... */ });
it("rejects wrong authority", async () => { /* ... */ });
```

### ❌ Hardcoded Addresses

```typescript
// WRONG: Hardcoded address might not exist
const mint = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

// RIGHT: Create or derive dynamically in tests
const mint = await createMint(connection, payer, authority, null, 6);
```

### ❌ Shared State Between Tests

```typescript
// WRONG: Tests affect each other
let balance = 0;

it("deposits 100", async () => {
  await deposit(100);
  balance = 100;  // ❌ Shared state
});

it("withdraws 50", async () => {
  await withdraw(50);  // ❌ Depends on previous test
});

// RIGHT: Each test is independent
it("deposits 100", async () => {
  const { vault } = await setupFreshVault();
  await deposit(vault, 100);
  const account = await fetchVault(vault);
  expect(account.balance).to.equal(100);
});
```

## Test Organization

```
tests/
├── integration/
│   ├── initialize.test.ts    # Test initialization
│   ├── deposit.test.ts       # Test deposits
│   ├── withdraw.test.ts      # Test withdrawals
│   └── admin.test.ts         # Test admin functions
├── fixtures/
│   ├── setup.ts              # Common setup
│   └── mocks.ts              # Mock accounts/data
└── utils/
    ├── helpers.ts            # Test utilities
    └── assertions.ts         # Custom assertions
```

## Related Challenges

- All challenges include test examples
- **[00-hello-solana](../challenges/00-hello-solana.md)** - Basic test setup

## Key Takeaways

1. **Use bankrun for speed** - 10-100x faster than test-validator
2. **Test error cases** - Not just happy paths
3. **Isolate tests** - No shared mutable state
4. **Use fixtures** - DRY test setup
5. **Wait for confirmations** - Or use bankrun
6. **Unit test pure logic** - Fast Rust tests for calculations
7. **Integration test flows** - TypeScript for full instruction flows
