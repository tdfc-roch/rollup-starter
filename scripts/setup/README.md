# Sovereign Rollup Setup Scripts

Scripts for setting up a Sovereign rollup with TDFC session registry integration.

## Overview

The session registry requires three keypairs:
- **Owner**: Has full control over the session registry configuration
- **Manager**: Can authorize/revoke session signers
- **Signer**: The key used by `tdfc-worker-sov` to submit `SetSessionBatch` transactions

**Note:** Signers are authorized globally, not per-app. Once authorized, a signer can submit sessions for any app.

## Prerequisites

1. Node.js 18+
2. A running Sovereign rollup node (for add-signer step)

## Installation

```bash
cd scripts/setup
npm install
```

## Step 1: Generate Keys

```bash
npm run generate-keys
```

This will:
1. Generate 3 secp256k1 keypairs (owner, manager, signer)
2. Update `configs/mock/genesis.json` with owner/manager addresses
3. Add owner/manager to gas token balances
4. Save all keys to `generated-keys.json`
5. Print the signer private key for you to copy

**Output example:**
```
┌─────────────────────────────────────────────────────────────┐
│        SIGNER PRIVATE KEY (for AWS Secrets Manager)         │
├─────────────────────────────────────────────────────────────┤
│  abc123def456...                                            │
└─────────────────────────────────────────────────────────────┘

 Copy the key above and paste it as plaintext in AWS Secrets Manager.
 Only the private key is needed - the address is derived from it.
```

## Step 2: Add Signer to AWS Secrets Manager

1. Go to AWS Secrets Manager console
2. Create a new secret (e.g., `sandbox-roch/sov-test/session-signer`)
3. Choose "Other type of secret" → "Plaintext"
4. Paste the signer private key (just the hex string, no quotes)
5. Save

## Step 3: Start the Rollup

```bash
# From rollup-starter root
make run-node
# or
cargo run --release
```

## Step 4: Authorize the Signer

Once the rollup is running:

```bash
npm run add-signer -- --rpc-url http://<rollup-ip>:12346
```

The script automatically reads keys from `generated-keys.json`.

**Options:**
- `--rpc-url` - Rollup RPC URL (default: `http://127.0.0.1:12346`)
- `--revoke` - Revoke authorization instead of granting
- `--keys-file` - Path to keys file (default: `../../generated-keys.json`)

## Security Notes

1. **generated-keys.json** contains private keys - keep it secure and never commit to git
2. The **owner** key should be kept offline for recovery purposes
3. The **manager** key is only needed for authorizing signers
4. The **signer** key is stored in AWS Secrets Manager and used by the worker

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Genesis Setup                          │
│                                                              │
│  generate-keys.ts                                            │
│       │                                                      │
│       ├──▶ genesis.json (owner + manager addresses)         │
│       ├──▶ generated-keys.json (all keys, keep secure)      │
│       └──▶ stdout (signer key to copy to AWS)               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Runtime Authorization                     │
│                                                              │
│  add-signer.ts ──▶ set_session_signer(signer, allowed=true) │
│                                                              │
│  (reads manager key from generated-keys.json)               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Production Usage                         │
│                                                              │
│  tdfc-worker-sov (Fargate)                                  │
│       │                                                      │
│       ├──▶ Reads signer key from AWS Secrets Manager        │
│       └──▶ Submits SetSessionBatch to rollup                │
└─────────────────────────────────────────────────────────────┘
```

## Troubleshooting

**"UnauthorizedManager" error:**
- Verify the manager address in genesis.json matches generated-keys.json
- Make sure you started the rollup with the updated genesis

**Transaction times out:**
- Verify the rollup node is running and accessible
- Check the RPC URL is correct (default port is 12346)
