export const rageQuitEscrowAbi = [
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address", "internalType": "address" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "nextPaymentId",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pendingPayments",
    "inputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "outputs": [
      { "name": "agent", "type": "address", "internalType": "address" },
      { "name": "recipient", "type": "address", "internalType": "address" },
      { "name": "amount", "type": "uint256", "internalType": "uint256" },
      { "name": "unlocksAt", "type": "uint256", "internalType": "uint256" },
      { "name": "intentHash", "type": "bytes32", "internalType": "bytes32" },
      { "name": "fundingReference", "type": "bytes32", "internalType": "bytes32" },
      { "name": "vetoed", "type": "bool", "internalType": "bool" },
      { "name": "executed", "type": "bool", "internalType": "bool" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "veto",
    "inputs": [{ "name": "paymentId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  }
] as const;
