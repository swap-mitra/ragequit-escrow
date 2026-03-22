// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMockMintableToken {
    function mint(address to, uint256 amount) external returns (bool);
}

contract MockSwapRouter {
    uint256 public immutable rateNumerator;
    uint256 public immutable rateDenominator;

    event SwapExecuted(
        address indexed sender,
        address indexed token,
        address indexed recipient,
        uint256 amountIn,
        uint256 amountOut,
        bytes32 quoteId
    );

    constructor(uint256 rateNumerator_, uint256 rateDenominator_) {
        require(rateNumerator_ > 0, "rateNumerator");
        require(rateDenominator_ > 0, "rateDenominator");
        rateNumerator = rateNumerator_;
        rateDenominator = rateDenominator_;
    }

    function quoteExactNativeForToken(uint256 amountIn) public view returns (uint256) {
        return (amountIn * rateNumerator) / rateDenominator;
    }

    function swapExactNativeForToken(
        address token,
        address recipient,
        uint256 minAmountOut,
        bytes32 quoteId
    ) external payable returns (uint256 amountOut) {
        require(recipient != address(0), "recipient");
        amountOut = quoteExactNativeForToken(msg.value);
        require(amountOut >= minAmountOut, "slippage");

        bool minted = IMockMintableToken(token).mint(recipient, amountOut);
        require(minted, "mint");

        emit SwapExecuted(msg.sender, token, recipient, msg.value, amountOut, quoteId);
    }
}
