// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface ISettlementEngine {
    struct ResolutionRequest {
        bytes32 requestId;
        bytes32 winnerHandle;
        bytes32 amountHandle;
    }

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

    function prepareResolutionRequest(
        address market,
        uint256 auctionId,
        uint32 bidCount,
        uint64 endTime
    ) external view returns (ResolutionRequest memory);

    function verifyResolutionProof(
        address market,
        uint256 auctionId,
        bytes32 requestId,
        address winner,
        bytes32 winnerCiphertext,
        uint256 winningAmount,
        bytes calldata avsProof
    ) external returns (bool);
}
