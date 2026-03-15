import type { Metadata } from "next";
import "./globals.css";
import { Web3Provider } from "../components/web3-provider";

export const metadata: Metadata = {
  title: "RageQuit Escrow",
  description: "Day 1 dashboard scaffold for veto-window escrow payments",
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