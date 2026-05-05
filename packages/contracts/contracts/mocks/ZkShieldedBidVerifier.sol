// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "../interfaces/IShieldedBidVerifier.sol";
import "../utils/CofheCiphertextEncoding.sol";
import "./Verifier.sol";

contract ZkShieldedBidVerifier is IShieldedBidVerifier {
    using CofheCiphertextEncoding for bytes32;

    Groth16Verifier public immutable verifier;

    error ZeroAddress();

    constructor(address verifierAddress) {
        if (verifierAddress == address(0)) {
            revert ZeroAddress();
        }

        verifier = Groth16Verifier(verifierAddress);
    }

    function verifyBidCoverage(
        address,
        uint256,
        bytes32,
        bytes32 encryptedBid,
        uint256 committedAmount,
        uint256,
        bytes calldata proof
    ) external view override returns (bool) {
        if (encryptedBid.payloadOf() > committedAmount) {
            return false;
        }

        (uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c, uint256[1] memory input) =
            abi.decode(proof, (uint256[2], uint256[2][2], uint256[2], uint256[1]));

        if (input[0] != uint256(encryptedBid)) {
            return false;
        }

        return verifier.verifyProof(a, b, c, input);
    }
}
