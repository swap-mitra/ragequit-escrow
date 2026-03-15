import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { localhost, sepolia } from "wagmi/chains";

const sepoliaRpcUrl = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL;

export const wagmiConfig = createConfig({
  chains: [localhost, sepolia],
  connectors: [injected()],
  transports: {
    [localhost.id]: http(),
    [sepolia.id]: http(sepoliaRpcUrl),
  },
});