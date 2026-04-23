// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

contract MockCofhe {
    function lte(bytes32 ciphertext, uint256 plaintext) external pure returns (bool) {
        return uint256(ciphertext) <= plaintext;
    }

    function asEuint32(uint32 value) external pure returns (bytes32) {
        return bytes32(uint256(value));
    }

    function seal(bytes32 ciphertext, address viewer) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(ciphertext, viewer));
    }

    function getRawCiphertext(bytes32 ciphertext) external pure returns (bytes32) {
        return ciphertext;
    }

    function expectPlaintext(bytes32 ciphertext, uint32 expectedPlaintext) external pure returns (bool) {
        return uint256(ciphertext) == expectedPlaintext;
    }
}
