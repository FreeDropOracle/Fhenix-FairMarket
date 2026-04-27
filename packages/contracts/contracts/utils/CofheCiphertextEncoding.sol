// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

library CofheCiphertextEncoding {
    uint256 private constant _KIND_SHIFT = 248;
    uint256 private constant _PAYLOAD_MASK = type(uint248).max;

    enum CiphertextKind {
        UNKNOWN,
        EUINT32,
        EBOOL,
        EUINT96
    }

    error InvalidCiphertextKind(uint8 expected, uint8 actual);
    error InvalidNumericCiphertextKind(uint8 actual);

    function encodeEuint32(uint32 value) internal pure returns (bytes32) {
        return bytes32((uint256(uint8(CiphertextKind.EUINT32)) << _KIND_SHIFT) | uint256(value));
    }

    function encodeEuint96(uint96 value) internal pure returns (bytes32) {
        return bytes32((uint256(uint8(CiphertextKind.EUINT96)) << _KIND_SHIFT) | uint256(value));
    }

    function encodeEbool(bool value) internal pure returns (bytes32) {
        return bytes32((uint256(uint8(CiphertextKind.EBOOL)) << _KIND_SHIFT) | (value ? 1 : 0));
    }

    function decodeEuint32(bytes32 ciphertext) internal pure returns (uint32) {
        _requireKind(ciphertext, CiphertextKind.EUINT32);
        return uint32(payloadOf(ciphertext));
    }

    function decodeEbool(bytes32 ciphertext) internal pure returns (bool) {
        _requireKind(ciphertext, CiphertextKind.EBOOL);
        return payloadOf(ciphertext) != 0;
    }

    function decodeEuint96(bytes32 ciphertext) internal pure returns (uint96) {
        _requireKind(ciphertext, CiphertextKind.EUINT96);
        return uint96(payloadOf(ciphertext));
    }

    function decodeNumeric(bytes32 ciphertext) internal pure returns (uint256) {
        CiphertextKind kind = kindOf(ciphertext);

        if (kind == CiphertextKind.EUINT32 || kind == CiphertextKind.EUINT96) {
            return payloadOf(ciphertext);
        }

        revert InvalidNumericCiphertextKind(uint8(kind));
    }

    function kindOf(bytes32 ciphertext) internal pure returns (CiphertextKind) {
        uint8 kind = uint8(uint256(ciphertext) >> _KIND_SHIFT);

        if (kind > uint8(CiphertextKind.EUINT96)) {
            return CiphertextKind.UNKNOWN;
        }

        return CiphertextKind(kind);
    }

    function payloadOf(bytes32 ciphertext) internal pure returns (uint256) {
        return uint256(ciphertext) & _PAYLOAD_MASK;
    }

    function _requireKind(bytes32 ciphertext, CiphertextKind expectedKind) private pure {
        CiphertextKind actualKind = kindOf(ciphertext);
        if (actualKind != expectedKind) {
            revert InvalidCiphertextKind(uint8(expectedKind), uint8(actualKind));
        }
    }
}
