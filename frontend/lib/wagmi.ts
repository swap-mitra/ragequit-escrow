import { defineChain } from "viem";
import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { sepolia } from "wagmi/chains";

const sepoliaRpcUrl = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL;
const alfajoresRpcUrl = process.env.NEXT_PUBLIC_ALFAJORES_RPC_URL;
const targetChainName = (process.env.NEXT_PUBLIC_TARGET_CHAIN || "localhost").toLowerCase();

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

export const alfajores = defineChain({
  id: 44787,
  name: "Celo Alfajores",
  nativeCurrency: {
    name: "Celo",
    symbol: "CELO",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [alfajoresRpcUrl || "https://alfajores-forno.celo-testnet.org"],
    },
  },
  blockExplorers: {
    default: {
      name: "Celo Explorer",
      url: "https://alfajores.celoscan.io",
    },
  },
  testnet: true,
});

const chainMap = {
  localhost: hardhatLocal,
  sepolia,
  alfajores,
} as const;

export const appChain = chainMap[targetChainName as keyof typeof chainMap] || hardhatLocal;
export const appChainId = appChain.id;

export const wagmiConfig = createConfig({
  chains: [hardhatLocal, sepolia, alfajores],
  connectors: [injected()],
  transports: {
    [hardhatLocal.id]: http("http://127.0.0.1:8545"),
    [sepolia.id]: http(sepoliaRpcUrl),
    [alfajores.id]: http(alfajoresRpcUrl || "https://alfajores-forno.celo-testnet.org"),
  },
});
