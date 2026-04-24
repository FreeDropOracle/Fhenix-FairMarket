// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "../adapters/CofheAdapter.sol";
import "../utils/CofheCiphertextEncoding.sol";

contract MockCofhe is CofheAdapter {
    using CofheCiphertextEncoding for bytes32;

    function expectPlaintext(bytes32 ciphertext, uint256 expectedPlaintext) external pure returns (bool) {
        return ciphertext.decodeEuint32() == expectedPlaintext;
    }

    function expectBoolPlaintext(bytes32 ciphertext, bool expectedPlaintext) external pure returns (bool) {
        return ciphertext.decodeEbool() == expectedPlaintext;
    }

    function explainCiphertext(bytes32 ciphertext) external pure returns (uint8 kind, uint256 payload) {
        return (uint8(CofheCiphertextEncoding.kindOf(ciphertext)), CofheCiphertextEncoding.payloadOf(ciphertext));
    }
}
