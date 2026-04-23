// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "../interfaces/ICofheAdapter.sol";

contract CofheAdapter is ICofheAdapter {
    function lte(bytes32 ciphertext, uint256 plaintext) external pure override returns (bool) {
        return uint256(ciphertext) <= plaintext;
    }

    function asEuint32(uint32 value) external pure override returns (bytes32) {
        return bytes32(uint256(value));
    }

    function seal(bytes32 ciphertext, address viewer) external pure override returns (bytes32) {
        return keccak256(abi.encodePacked(ciphertext, viewer));
    }

    function getRawCiphertext(bytes32 ciphertext) external pure override returns (bytes32) {
        return ciphertext;
    }
}
