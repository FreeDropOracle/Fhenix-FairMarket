// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "../interfaces/ICofheAdapter.sol";

contract MockRevertingCofheAdapter is ICofheAdapter {
    error PrototypeComparisonDisabled();

    function lte(bytes32, uint256) external pure override returns (bool) {
        revert PrototypeComparisonDisabled();
    }

    function gt(bytes32, uint256) external pure override returns (bool) {
        revert PrototypeComparisonDisabled();
    }

    function asEuint32(uint32 value) external pure override returns (bytes32) {
        return bytes32(uint256(value));
    }

    function asEuint96(uint96 value) external pure override returns (bytes32) {
        return bytes32(uint256(value));
    }

    function asEbool(bool value) external pure override returns (bytes32) {
        return value ? bytes32(uint256(1)) : bytes32(0);
    }

    function select(bytes32 conditionCiphertext, bytes32 whenTrueCiphertext, bytes32 whenFalseCiphertext)
        external
        pure
        override
        returns (bytes32)
    {
        return conditionCiphertext == bytes32(0) ? whenFalseCiphertext : whenTrueCiphertext;
    }

    function verifyEncryptedBidCoverage(bytes32, uint256) external pure override returns (bool) {
        revert PrototypeComparisonDisabled();
    }

    function ciphertextKind(bytes32) external pure override returns (uint8) {
        return 0;
    }

    function seal(bytes32 ciphertext, address) external pure override returns (bytes32) {
        return ciphertext;
    }
}
