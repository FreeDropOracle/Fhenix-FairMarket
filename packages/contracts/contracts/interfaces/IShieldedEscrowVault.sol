// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface IShieldedEscrowVault {
    function lockEscrow(uint256 auctionId, bytes32 commitmentHash) external payable;

    function settleWinningCommitment(uint256 auctionId, bytes32 commitmentHash, uint256 winningAmount)
        external
        returns (uint256 remainingRefund);

    function unlockRefunds(uint256 auctionId) external;

    function claimRefund(bytes32 secret, bytes32 nullifier, address payable recipient)
        external
        returns (uint256 principalAmount, uint256 compensationAmount);

    function previewCommitment(bytes32 commitmentHash)
        external
        view
        returns (uint256 auctionId, uint256 amount, bool refundUnlocked, bool claimed);

    function totalEscrowForAuction(uint256 auctionId) external view returns (uint256);
}
