// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import "../interfaces/IShieldedBidVerifier.sol";

contract MockShieldedBidVerifier is Ownable, IShieldedBidVerifier {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    error InvalidProver(address prover);
    error ZeroAddress();

    address public prover;

    event ProverUpdated(address indexed previousProver, address indexed nextProver);

    constructor(address initialOwner, address initialProver) Ownable(initialOwner) {
        if (initialProver == address(0)) {
            revert ZeroAddress();
        }

        prover = initialProver;
        emit ProverUpdated(address(0), initialProver);
    }

    function setProver(address nextProver) external onlyOwner {
        if (nextProver == address(0)) {
            revert ZeroAddress();
        }

        address previousProver = prover;
        prover = nextProver;
        emit ProverUpdated(previousProver, nextProver);
    }

    function verifyBidCoverage(
        address vault,
        uint256 auctionId,
        bytes32 commitmentHash,
        bytes32 encryptedBid,
        uint256 deadline,
        bytes calldata proof
    ) external view override returns (bool) {
        if (vault == address(0)) {
            revert ZeroAddress();
        }

        bytes32 digest =
            keccak256(abi.encode(address(this), block.chainid, vault, auctionId, commitmentHash, encryptedBid, deadline))
                .toEthSignedMessageHash();
        address recoveredProver = digest.recover(proof);
        if (recoveredProver != prover) {
            revert InvalidProver(recoveredProver);
        }

        return true;
    }
}
