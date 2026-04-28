// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface IEigenLayerAVS {
    function computeDigest(
        address market,
        uint256 auctionId,
        bytes32 requestId,
        address winner,
        bytes32 winnerCiphertext,
        uint256 winningAmount
    ) external view returns (bytes32);

    function computeShieldedDigest(
        address market,
        uint256 auctionId,
        bytes32 requestId,
        bytes32 winnerIdentity,
        bytes32 winnerCiphertext,
        uint256 winningAmount
    ) external view returns (bytes32);

    function verifyAttestation(
        address market,
        uint256 auctionId,
        bytes32 requestId,
        address winner,
        bytes32 winnerCiphertext,
        uint256 winningAmount,
        bytes calldata proof
    ) external returns (bool);

    function verifyShieldedAttestation(
        address market,
        uint256 auctionId,
        bytes32 requestId,
        bytes32 winnerIdentity,
        bytes32 winnerCiphertext,
        uint256 winningAmount,
        bytes calldata proof
    ) external returns (bool);
}
