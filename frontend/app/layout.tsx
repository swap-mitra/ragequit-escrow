import type { Metadata } from "next";
import "./globals.css";
import { Web3Provider } from "../components/web3-provider";

export const metadata: Metadata = {
  title: "RageQuit Escrow",
  description: "Wallet-connected dashboard for veto-window escrow payments with ERC-8004 identity artifacts",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Web3Provider>{children}</Web3Provider>
      </body>
    </html>
  );
}
