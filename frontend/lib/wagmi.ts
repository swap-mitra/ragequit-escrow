import { defineChain } from "viem";
import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { sepolia } from "wagmi/chains";

const sepoliaRpcUrl = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL;

export const hardhatLocal = defineChain({
  id: 31337,
  name: "Hardhat Local",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["http://127.0.0.1:8545"],
    },
  },
});

export const wagmiConfig = createConfig({
  chains: [hardhatLocal, sepolia],
  connectors: [injected()],
  transports: {
    [hardhatLocal.id]: http("http://127.0.0.1:8545"),
    [sepolia.id]: http(sepoliaRpcUrl),
  },
});
