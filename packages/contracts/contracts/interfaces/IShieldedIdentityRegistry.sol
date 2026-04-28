// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface IShieldedIdentityRegistry {
    function bindIdentity(uint256 auctionId, bytes32 identityHash, bytes32 commitmentHash) external;

    function markWinningIdentity(uint256 auctionId, bytes32 identityHash) external;

    function commitmentForIdentity(uint256 auctionId, bytes32 identityHash) external view returns (bytes32);

    function identityForCommitment(uint256 auctionId, bytes32 commitmentHash) external view returns (bytes32);

    function winningIdentity(uint256 auctionId) external view returns (bytes32);
}
