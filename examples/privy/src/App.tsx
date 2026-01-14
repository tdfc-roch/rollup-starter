import { useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createStandardRollup, SovereignClient } from "@sovereign-sdk/web3";
import { PrivySigner } from "@sovereign-sdk/signers";
import ConnectButton from "./ConnectButton.tsx";
import "./App.css";
import type { RuntimeCall } from "./types";

type TxResponse = SovereignClient.SovereignSDK.Sequencer.TxCreateResponse.Data;

// Chain configuration
const ROLLUP_URL = import.meta.env.VITE_ROLLUP_URL || "http://localhost:12346";

export default function App() {
  // Privy specific hooks
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();

  const [txResult, setTxResult] = useState<TxResponse | null>(null);
  const [txError, setTxError] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [txInput, setTxInput] = useState<string>(
    JSON.stringify(
      {
        bank: {
          create_token: {
            admins: [],
            token_decimals: 8,
            supply_cap: 100000000000,
            token_name: "Yo Yo Token",
            initial_balance: 1000000000,
            mint_to_address: "<wallet_address>",
          },
        },
      },
      null,
      2,
    ),
  );
  const [jsonError, setJsonError] = useState<string>("");

  // Fetch the embedded (Privy‑managed) wallet when the user logs in via email
  const embeddedWallet = wallets.find(
    (wallet) => wallet.walletClientType === "privy",
  );

  const handleJsonFormat = () => {
    try {
      const parsed = JSON.parse(txInput);
      setTxInput(JSON.stringify(parsed, null, 2));
      setJsonError("");
    } catch {
      setJsonError("Invalid JSON format");
    }
  };

  const handleSignAndSendTransaction = async () => {
    if (!embeddedWallet) {
      const error_msg = "No embedded wallet found. Please log in first.";
      console.log(error_msg);
      setTxError(error_msg);
      setTxResult(null);
      return;
    }

    // Pull the EIP‑1193 provider from the wallet
    const provider = await embeddedWallet.getEthereumProvider();
    if (!provider) {
      const error_msg = "Provider unavailable on the embedded wallet.";
      console.log(error_msg);
      setTxError(error_msg);
      setTxResult(null);
      return;
    }

    setIsLoading(true);
    setTxError("");
    setTxResult(null);
    console.log("Preparing transaction…");

    try {
      // Parse transaction input
      let parsedTx: RuntimeCall;
      try {
        const txData = JSON.parse(txInput);
        // Replace placeholder with actual wallet address
        const txString = JSON.stringify(txData).replace(
          "<wallet_address>",
          embeddedWallet.address,
        );
        parsedTx = JSON.parse(txString);
      } catch {
        setTxError("Invalid JSON format. Please check your transaction data.");
        setIsLoading(false);
        return;
      }

      // Instantiate Sovereign rollup client
      const rollup = await createStandardRollup({
        url: ROLLUP_URL,
      });

      // Build signer with the rollup chain hash
      const signer = new PrivySigner(provider);

      // Sign + send tx
      const result = await rollup.call(parsedTx, { signer });
      setTxResult(result.response?.data);
    } catch (err) {
      console.error(err);

      // Store the full error for display
      if (err instanceof Error) {
        setTxError(err.message);
      } else {
        setTxError(String(err));
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!ready) {
    return <div className="container">Loading Privy…</div>;
  }

  return (
    <div className="container">
      <header>
        <h1>Privy × Sovereign Demo</h1>
        <ConnectButton />
      </header>

      {authenticated && (
        <section className="transaction-section">
          <h3>Send Transaction</h3>

          <div style={{ marginBottom: "20px" }}>
            <label
              htmlFor="tx-input"
              style={{ display: "block", marginBottom: "8px" }}
            >
              Transaction Data (JSON):
            </label>
            <textarea
              id="tx-input"
              value={txInput}
              onChange={(e) => {
                setTxInput(e.target.value);
                setJsonError("");
              }}
              onBlur={handleJsonFormat}
              placeholder="Enter transaction JSON here..."
              style={{
                width: "100%",
                minHeight: "200px",
                padding: "10px",
                fontSize: "14px",
                fontFamily: "monospace",
                border: jsonError ? "1px solid #dc3545" : "1px solid #ccc",
                borderRadius: "4px",
                backgroundColor: "#f5f5f5",
                color: "#333",
                lineHeight: "1.5",
              }}
            />
            {jsonError && (
              <div
                style={{
                  color: "#dc3545",
                  fontSize: "14px",
                  marginTop: "5px",
                }}
              >
                {jsonError}
              </div>
            )}
          </div>

          <button
            onClick={handleSignAndSendTransaction}
            disabled={isLoading || !embeddedWallet}
            className="primary-button"
          >
            {isLoading ? "Processing…" : "Sign and Send Transaction"}
          </button>

          {txError && (
            <div className="status-message error" style={{ textAlign: "left" }}>
              <div style={{ marginBottom: "10px" }}>
                <strong>❌ Transaction failed</strong>
              </div>

              {(() => {
                // Try to parse as JSON for better formatting
                const errorStr = txError;

                // Check if it's a status code followed by JSON
                const match = errorStr.match(/^(\d{3})\s+(\{.*\})$/s);
                if (match) {
                  const statusCode = match[1];
                  try {
                    const errorData = JSON.parse(match[2]);
                    return (
                      <>
                        <div style={{ marginBottom: "5px" }}>
                          <strong>Status Code:</strong> {statusCode}
                        </div>
                        <div>
                          <strong>Error Details:</strong>
                          <pre
                            style={{
                              backgroundColor: "#fff5f5",
                              border: "1px solid #ffdddd",
                              borderRadius: "4px",
                              padding: "10px",
                              marginTop: "5px",
                              fontSize: "12px",
                              overflow: "auto",
                              maxHeight: "300px",
                            }}
                          >
                            {JSON.stringify(errorData, null, 2)}
                          </pre>
                        </div>
                      </>
                    );
                  } catch {
                    // If JSON parsing fails, show as is
                  }
                }

                // For non-JSON errors, try to parse as JSON anyway
                try {
                  const parsed = JSON.parse(errorStr);
                  return (
                    <pre
                      style={{
                        backgroundColor: "#fff5f5",
                        border: "1px solid #ffdddd",
                        borderRadius: "4px",
                        padding: "10px",
                        fontSize: "12px",
                        overflow: "auto",
                        maxHeight: "300px",
                      }}
                    >
                      {JSON.stringify(parsed, null, 2)}
                    </pre>
                  );
                } catch {
                  // Show as plain text
                  return (
                    <div
                      style={{
                        backgroundColor: "#fff5f5",
                        border: "1px solid #ffdddd",
                        borderRadius: "4px",
                        padding: "10px",
                        fontSize: "12px",
                        overflow: "auto",
                        maxHeight: "300px",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {errorStr}
                    </div>
                  );
                }
              })()}
            </div>
          )}

          {txResult && (
            <div className="status-message" style={{ textAlign: "left" }}>
              <div style={{ marginBottom: "10px" }}>
                <strong>✅ Transaction sent successfully!</strong>
              </div>

              <div style={{ marginBottom: "5px" }}>
                <strong>Transaction Hash:</strong>
                <div
                  style={{
                    fontFamily: "monospace",
                    fontSize: "12px",
                    wordBreak: "break-all",
                    marginTop: "5px",
                  }}
                >
                  {txResult.id || "N/A"}
                </div>
              </div>

              <div style={{ marginBottom: "5px" }}>
                <strong>Status:</strong> {txResult.status || "N/A"}
              </div>

              {txResult.receipt && (
                <div style={{ marginBottom: "5px" }}>
                  <strong>Result:</strong> {txResult.receipt.result || "N/A"}
                  {(txResult.receipt as any).data?.gas_used && (
                    <span>
                      {" "}
                      | <strong>Gas:</strong>{" "}
                      {(txResult.receipt as any).data.gas_used[0]}
                    </span>
                  )}
                </div>
              )}

              {txResult.events && txResult.events.length > 0 && (
                <div style={{ marginTop: "15px" }}>
                  <strong>Events:</strong>
                  <pre
                    style={{
                      backgroundColor: "#f5f5f5",
                      border: "1px solid #ddd",
                      borderRadius: "4px",
                      padding: "10px",
                      marginTop: "5px",
                      fontSize: "12px",
                      overflow: "auto",
                      maxHeight: "300px",
                    }}
                  >
                    {JSON.stringify(txResult.events, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
