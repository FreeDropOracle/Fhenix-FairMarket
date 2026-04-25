// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface ISettlementEngine {
    function computeDynamicTimeout(uint256 movingAverageBlockDelta) external pure returns (uint256);

    function computeCancellationSlash(
        uint256 sellerDeposit,
        uint256 elapsed,
        uint256 duration,
        uint256 totalEscrow
    ) external pure returns (uint256);

    function computeWinningRefund(uint256 escrowedAmount, uint256 winningAmount) external pure returns (uint256);

    function computeSellerPayout(uint256 sellerDeposit, uint256 winningAmount) external pure returns (uint256);

    function computeSellerCancellationPayout(uint256 sellerDeposit, uint256 slashAmount) external pure returns (uint256);

    function computeProRataShare(
        uint256 contribution,
        uint256 totalEscrow,
        uint256 totalPot
    ) external pure returns (uint256);
}
