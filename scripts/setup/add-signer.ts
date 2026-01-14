/**
 * Authorize a signer for the session registry
 *
 * This script sends a set_session_signer transaction to the rollup
 * to globally authorize a signer address.
 *
 * By default, reads keys from generated-keys.json (created by generate-keys.ts).
 *
 * Usage:
 *   npm run add-signer -- --rpc-url <http://rollup:12346>
 *
 * Or with explicit keys:
 *   npm run add-signer -- \
 *     --manager-key <hex-private-key> \
 *     --signer-address <0x...> \
 *     --rpc-url <http://rollup:12346>
 */

import { createStandardRollup } from "@sovereign-sdk/web3";
import { Secp256k1Signer } from "@sovereign-sdk/signers";
import { computeAddress } from "ethers";
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

interface SetSessionSignerCall {
  session_registry: {
    set_session_signer: {
      signer: string;
      allowed: boolean;
    };
  };
}

function loadKeysFromFile(keysPath: string): GeneratedKeys | null {
  if (!fs.existsSync(keysPath)) {
    return null;
  }
  try {
    const content = fs.readFileSync(keysPath, "utf-8");
    return JSON.parse(content) as GeneratedKeys;
  } catch {
    return null;
  }
}

function parseArgs(): {
  managerKey: string;
  signerAddress: string;
  rpcUrl: string;
  revoke: boolean;
} {
  const args = process.argv.slice(2);
  let managerKey = "";
  let signerAddress = "";
  let rpcUrl = "http://127.0.0.1:12346";
  let revoke = false;
  let keysFile = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--manager-key" && args[i + 1]) {
      managerKey = args[++i];
    } else if (args[i] === "--signer-address" && args[i + 1]) {
      signerAddress = args[++i];
    } else if (args[i] === "--rpc-url" && args[i + 1]) {
      rpcUrl = args[++i];
    } else if (args[i] === "--keys-file" && args[i + 1]) {
      keysFile = args[++i];
    } else if (args[i] === "--revoke") {
      revoke = true;
    }
  }

  // Default keys file path
  const rollupStarterRoot = path.resolve(__dirname, "../..");
  const defaultKeysFile = path.join(rollupStarterRoot, "generated-keys.json");
  const keysFilePath = keysFile || defaultKeysFile;

  // Try to load from file if keys not provided via args
  if (!managerKey || !signerAddress) {
    const keys = loadKeysFromFile(keysFilePath);
    if (keys) {
      console.log(`Loading keys from: ${keysFilePath}`);
      if (!managerKey) {
        managerKey = keys.manager.privateKey;
      }
      if (!signerAddress) {
        signerAddress = keys.signer.address;
      }
    }
  }

  // Validate we have what we need
  const missing: string[] = [];
  if (!managerKey) missing.push("manager-key");
  if (!signerAddress) missing.push("signer-address");

  if (missing.length > 0) {
    console.error(`Error: Missing ${missing.join(" and ")}.`);
    console.error(`\nEither run generate-keys.ts first to create ${defaultKeysFile},`);
    console.error("or provide the keys explicitly:\n");
    console.error("  npm run add-signer -- \\");
    console.error("    --manager-key <hex-private-key> \\");
    console.error("    --signer-address <0x...> \\");
    console.error("    [--rpc-url <http://rollup:12346>] \\");
    console.error("    [--revoke]");
    console.error("\nOptions:");
    console.error("  --keys-file       Path to generated-keys.json (default: ../../generated-keys.json)");
    console.error("  --manager-key     Override manager private key from file");
    console.error("  --signer-address  Override signer address from file");
    console.error("  --rpc-url         Rollup RPC URL (default: http://127.0.0.1:12346)");
    console.error("  --revoke          Revoke the signer instead of authorizing");
    process.exit(1);
  }

  // Normalize address to lowercase (Sovereign SDK convention)
  if (!signerAddress.startsWith("0x")) {
    signerAddress = `0x${signerAddress}`;
  }

  // Remove 0x prefix from manager key if present
  if (managerKey.startsWith("0x")) {
    managerKey = managerKey.slice(2);
  }

  return { managerKey, signerAddress, rpcUrl, revoke };
}

async function main() {
  console.log("=== Sovereign Rollup: Authorize Session Signer ===\n");

  const { managerKey, signerAddress, rpcUrl, revoke } = parseArgs();

  // Derive manager address from key for verification
  const managerAddress = computeAddress(`0x${managerKey}`);
  console.log(`Manager address: ${managerAddress}`);
  console.log(`Signer address:  ${signerAddress}`);
  console.log(`RPC URL:         ${rpcUrl}`);
  console.log(`Action:          ${revoke ? "REVOKE" : "AUTHORIZE"}`);

  // Initialize rollup client
  console.log("\nConnecting to rollup...");
  const rollup = await createStandardRollup({ url: rpcUrl });
  console.log("Connected.");

  // Initialize signer with manager key
  const signer = new Secp256k1Signer(managerKey);

  // Build the set_session_signer call (no app field - signers are global)
  const callMessage: SetSessionSignerCall = {
    session_registry: {
      set_session_signer: {
        signer: signerAddress.toLowerCase(),
        allowed: !revoke,
      },
    },
  };

  console.log("\nSending set_session_signer transaction...");
  console.log("Call message:", JSON.stringify(callMessage, null, 2));

  try {
    const txResponse = await rollup.call(callMessage as any, { signer });

    console.log("\n=== Transaction Sent ===");
    console.log("Response:");
    console.dir(txResponse.response, { depth: null, colors: true });

    // Check if the transaction was accepted
    if (txResponse.response) {
      const resp = txResponse.response as any;

      // Check for success
      if (resp.tx_hash) {
        console.log(`\nTransaction hash: ${resp.tx_hash}`);
      }

      if (resp.receipt?.result) {
        const result = resp.receipt.result;
        if (result === "successful" || result.successful) {
          console.log(
            `\nSigner ${revoke ? "revoked" : "authorized"} successfully!`
          );
          console.log(
            `The signer ${signerAddress} can now ${revoke ? "no longer " : ""}submit SetSessionBatch transactions.`
          );
        } else {
          console.error("\nTransaction failed!");
          console.error("Result:", result);
        }
      } else if (resp.status) {
        console.log(`\nTransaction status: ${resp.status}`);
        if (resp.status === "submitted" || resp.status === "accepted") {
          console.log(
            "Transaction was submitted. Check rollup logs for confirmation."
          );
        }
      }
    }
  } catch (error: any) {
    console.error("\nTransaction failed!");
    console.error("Error:", error.message || error);

    if (error.message?.includes("not authorized") || error.message?.includes("UnauthorizedManager")) {
      console.error(
        "\nHint: Make sure the manager key corresponds to the manager address in genesis.json"
      );
      console.error(`Expected manager to be: ${managerAddress}`);
    }

    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
