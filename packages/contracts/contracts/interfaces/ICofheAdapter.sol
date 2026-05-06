// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface ICofheAdapter {
    // Local/prototype adapter surface.
    // Production integrations should not expose plaintext constructors or raw
    // ciphertext accessors. See IProductionCofheAdapter for the opaque-handle
    // boundary expected from a live CoFHE provider.
    function lte(bytes32 ciphertext, uint256 plaintext) external pure returns (bool);

    function gt(bytes32 ciphertext, uint256 plaintext) external pure returns (bool);

    function asEuint32(uint32 value) external pure returns (bytes32);

    function asEuint96(uint96 value) external pure returns (bytes32);

    function asEbool(bool value) external pure returns (bytes32);

    function select(bytes32 conditionCiphertext, bytes32 whenTrueCiphertext, bytes32 whenFalseCiphertext)
        external
        pure
        returns (bytes32);

    function verifyEncryptedBidCoverage(bytes32 encryptedBid, uint256 availableEscrow) external pure returns (bool);

    function ciphertextKind(bytes32 ciphertext) external pure returns (uint8);

    function seal(bytes32 ciphertext, address viewer) external pure returns (bytes32);
}
