/**
 * Generate keypairs for Sovereign rollup setup
 *
 * This script:
 * 1. Generates 3 secp256k1 keypairs: owner, manager, signer
 * 2. Updates genesis.json with owner and manager addresses
 * 3. Saves all keys locally and outputs the signer key for AWS Secrets Manager
 *
 * Usage:
 *   npm run generate-keys
 */

import { Wallet, randomBytes } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface GeneratedKeys {
  owner: { privateKey: string; address: string };
  manager: { privateKey: string; address: string };
  signer: { privateKey: string; address: string };
}

function generateKeypair(): { privateKey: string; address: string } {
  // Generate random 32 bytes for private key
  const privateKeyBytes = randomBytes(32);
  const privateKeyHex = Buffer.from(privateKeyBytes).toString("hex");

  // Create wallet to derive address
  const wallet = new Wallet(`0x${privateKeyHex}`);
  const address = wallet.address;

  return {
    privateKey: privateKeyHex, // hex string without 0x prefix
    address: address, // checksummed address with 0x prefix
  };
}

function updateGenesis(
  genesisPath: string,
  ownerAddress: string,
  managerAddress: string
): void {
  const genesis = JSON.parse(fs.readFileSync(genesisPath, "utf-8"));

  // Update session_registry owner and manager
  if (!genesis.session_registry) {
    genesis.session_registry = {};
  }
  genesis.session_registry.owner = ownerAddress;
  genesis.session_registry.manager = managerAddress;

  // Add these addresses to bank balances so they can pay for gas
  const gasTokenConfig = genesis.bank?.gas_token_config;
  if (gasTokenConfig?.address_and_balances) {
    const existingAddresses = new Set(
      gasTokenConfig.address_and_balances.map(([addr]: [string, string]) =>
        addr.toLowerCase()
      )
    );

    const initialBalance = "10000000000000000"; // 10^16 tokens

    if (!existingAddresses.has(ownerAddress.toLowerCase())) {
      gasTokenConfig.address_and_balances.push([ownerAddress, initialBalance]);
      console.log(`Added owner ${ownerAddress} to gas token balances`);
    }

    if (!existingAddresses.has(managerAddress.toLowerCase())) {
      gasTokenConfig.address_and_balances.push([
        managerAddress,
        initialBalance,
      ]);
      console.log(`Added manager ${managerAddress} to gas token balances`);
    }
  }

  fs.writeFileSync(genesisPath, JSON.stringify(genesis, null, 2) + "\n");
  console.log(`Updated genesis at: ${genesisPath}`);
}

function saveKeysLocally(keys: GeneratedKeys, outputPath: string): void {
  const keysJson = {
    generated_at: new Date().toISOString(),
    warning:
      "KEEP THIS FILE SECURE! These private keys control the rollup session registry.",
    owner: keys.owner,
    manager: keys.manager,
    signer: keys.signer,
  };

  fs.writeFileSync(outputPath, JSON.stringify(keysJson, null, 2) + "\n");
  console.log(`Saved keys to: ${outputPath}`);
}

function parseArgs(): { genesisPath: string; outputPath: string } {
  const args = process.argv.slice(2);
  let genesisPath = "";
  let outputPath = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--genesis" && args[i + 1]) {
      genesisPath = args[++i];
    } else if (args[i] === "--output" && args[i + 1]) {
      outputPath = args[++i];
    }
  }

  // Default paths relative to rollup-starter root
  const rollupStarterRoot = path.resolve(__dirname, "../..");
  if (!genesisPath) {
    genesisPath = path.join(rollupStarterRoot, "configs/mock/genesis.json");
  }
  if (!outputPath) {
    outputPath = path.join(rollupStarterRoot, "generated-keys.json");
  }

  return { genesisPath, outputPath };
}

async function main() {
  console.log("=== Sovereign Rollup Key Generation ===\n");

  const { genesisPath, outputPath } = parseArgs();

  // Generate three keypairs
  console.log("Generating keypairs...");
  const owner = generateKeypair();
  const manager = generateKeypair();
  const signer = generateKeypair();

  const keys: GeneratedKeys = { owner, manager, signer };

  console.log(
    "\n┌─────────────────────────────────────────────────────────────┐"
  );
  console.log(
    "│                    Generated Addresses                       │"
  );
  console.log(
    "├─────────────────────────────────────────────────────────────┤"
  );
  console.log(`│  Owner:   ${owner.address}  │`);
  console.log(`│  Manager: ${manager.address}  │`);
  console.log(`│  Signer:  ${signer.address}  │`);
  console.log(
    "└─────────────────────────────────────────────────────────────┘"
  );

  // Update genesis.json
  console.log("\nUpdating genesis.json...");
  updateGenesis(genesisPath, owner.address, manager.address);

  // Save all keys locally for reference
  console.log("");
  saveKeysLocally(keys, outputPath);

  // Output signer key for AWS Secrets Manager
  console.log(
    "\n┌─────────────────────────────────────────────────────────────┐"
  );
  console.log(
    "│                     SIGNER PRIVATE KEY                        │"
  );
  console.log(
    "├─────────────────────────────────────────────────────────────┤"
  );
  console.log(`│  ${signer.privateKey}  │`);
  console.log(
    "└─────────────────────────────────────────────────────────────┘"
  );
  console.log("\n=== Setup Complete ===");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
