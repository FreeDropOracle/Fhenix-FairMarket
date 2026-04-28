// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface IShieldedEscrowVault {
    function lockEscrow(uint256 auctionId, bytes32 commitmentHash, address claimAuthority) external payable;

    function settleWinningCommitment(uint256 auctionId, bytes32 commitmentHash, uint256 winningAmount)
        external
        returns (uint256 remainingRefund);

    function allocateSlash(uint256 auctionId, uint256 publicEscrowTotal)
        external
        payable
        returns (uint256 publicSlashAllocation);

    function unlockRefunds(uint256 auctionId) external;

    function authorizeAssetClaim(
        uint256 auctionId,
        bytes32 commitmentHash,
        address recipient,
        uint256 deadline,
        bytes calldata signature
    ) external returns (bytes32 authorizationDigest);

    function claimRefund(bytes32 secret, bytes32 nullifier, address payable recipient)
        external
        returns (uint256 principalAmount, uint256 compensationAmount);

    function claimRefundWithAuthorization(
        bytes32 commitmentHash,
        address payable recipient,
        uint256 deadline,
        bytes calldata signature
    ) external returns (uint256 principalAmount, uint256 compensationAmount);

    function commitmentState(bytes32 commitmentHash)
        external
        view
        returns (uint256 auctionId, bool refundUnlocked, bool claimed);

    function verifyEncryptedBidCoverage(bytes32 commitmentHash, bytes32 encryptedBid, address adapter)
        external
        view
        returns (bool);

    function verifyBidCoverageProof(
        bytes32 commitmentHash,
        bytes32 encryptedBid,
        uint256 deadline,
        bytes calldata signature
    ) external view;

    function verifyPlaintextBidCoverage(bytes32 commitmentHash, uint256 bidAmount)
        external
        view
        returns (bool);

    function previewCommitment(bytes32 commitmentHash)
        external
        view
        returns (uint256 auctionId, uint256 amount, bool refundUnlocked, bool claimed);

    function claimAuthorityForCommitment(bytes32 commitmentHash) external view returns (address);

    function hasEscrowForAuction(uint256 auctionId) external view returns (bool);
}
