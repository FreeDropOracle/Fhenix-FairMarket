// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "../interfaces/ICofheAdapter.sol";
import "../utils/CofheCiphertextEncoding.sol";

/// @notice Local-development prototype adapter only.
/// @dev This adapter uses reversible placeholder encoding. It exists so local
///      unit tests and deterministic fixtures can exercise the market state
///      machine before a live CoFHE provider is wired in. It MUST NOT be used
///      as a production privacy boundary on public networks because bid values
///      can be recovered from the placeholder `bytes32` payload.
contract CofheAdapter is ICofheAdapter {
    using CofheCiphertextEncoding for bytes32;

    function lte(bytes32 ciphertext, uint256 plaintext) external pure override returns (bool) {
        return ciphertext.decodeNumeric() <= plaintext;
    }

    function gt(bytes32 ciphertext, uint256 plaintext) external pure override returns (bool) {
        return ciphertext.decodeNumeric() > plaintext;
    }

    function asEuint32(uint32 value) external pure override returns (bytes32) {
        return CofheCiphertextEncoding.encodeEuint32(value);
    }

    function asEuint96(uint96 value) external pure override returns (bytes32) {
        return CofheCiphertextEncoding.encodeEuint96(value);
    }

    function asEbool(bool value) external pure override returns (bytes32) {
        return CofheCiphertextEncoding.encodeEbool(value);
    }

    function select(bytes32 conditionCiphertext, bytes32 whenTrueCiphertext, bytes32 whenFalseCiphertext)
        external
        pure
        override
        returns (bytes32)
    {
        return conditionCiphertext.decodeEbool() ? whenTrueCiphertext : whenFalseCiphertext;
    }

    function verifyEncryptedBidCoverage(bytes32 encryptedBid, uint256 availableEscrow)
        external
        pure
        override
        returns (bool)
    {
        return encryptedBid.decodeNumeric() <= availableEscrow;
    }

    function ciphertextKind(bytes32 ciphertext) external pure override returns (uint8) {
        return uint8(CofheCiphertextEncoding.kindOf(ciphertext));
    }

    function seal(bytes32 ciphertext, address viewer) external pure override returns (bytes32) {
        return keccak256(abi.encodePacked(ciphertext, viewer));
    }
}
