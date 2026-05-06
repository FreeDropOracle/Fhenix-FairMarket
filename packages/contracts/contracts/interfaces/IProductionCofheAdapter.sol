// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice Opaque production CoFHE adapter boundary.
/// @dev This interface deliberately omits local plaintext constructors,
///      raw-ciphertext accessors, and decode helpers. Production bid privacy
///      must come from provider-issued ciphertext handles whose value cannot be
///      derived from the `bytes32` stored by the market.
interface IProductionCofheAdapter {
    function lte(bytes32 ciphertextHandle, uint256 plaintext) external view returns (bool);

    function gt(bytes32 ciphertextHandle, uint256 plaintext) external view returns (bool);

    function select(bytes32 conditionHandle, bytes32 whenTrueHandle, bytes32 whenFalseHandle)
        external
        view
        returns (bytes32);

    function verifyEncryptedBidCoverage(bytes32 encryptedBidHandle, uint256 availableEscrow)
        external
        view
        returns (bool);

    function seal(bytes32 ciphertextHandle, address viewer) external view returns (bytes32);
}
