// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface ICofheAdapter {
    function lte(bytes32 ciphertext, uint256 plaintext) external pure returns (bool);

    function asEuint32(uint32 value) external pure returns (bytes32);

    function seal(bytes32 ciphertext, address viewer) external pure returns (bytes32);

    function getRawCiphertext(bytes32 ciphertext) external pure returns (bytes32);
}
