// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface IShieldedBidVerifier {
    function verifyBidCoverage(
        address vault,
        uint256 auctionId,
        bytes32 commitmentHash,
        bytes32 encryptedBid,
        uint256 deadline,
        bytes calldata proof
    ) external view returns (bool);
}
