import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PrivyProvider } from "@privy-io/react-auth";
import "./index.css";
import App from "./App.tsx";

const appId = import.meta.env.VITE_PRIVY_APP_ID || "cltepiw6s06bz6kn0q0qsi4nf";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PrivyProvider
      appId={appId}
      config={{
        appearance: {
          theme: "light",
          accentColor: "#676FFF",
          logo: "https://your-logo-url.png",
          walletList: ["metamask", "rabby_wallet", "wallet_connect"],
        },
        loginMethods: ["email", "wallet"],
        embeddedWallets: {
          createOnLogin: "all-users",
          requireUserPasswordOnCreate: false,
        },
      }}
    >
      <App />
    </PrivyProvider>
  </StrictMode>,
);
