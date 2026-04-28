// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import "../interfaces/IEigenLayerAVS.sol";

contract MockEigenLayerAVS is Ownable, IEigenLayerAVS {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    struct ProofEnvelope {
        uint256 auctionId;
        bytes32 requestId;
        address winner;
        bytes32 winnerCiphertext;
        uint256 winningAmount;
        address[] operators;
        bytes[] signatures;
    }

    struct ShieldedProofEnvelope {
        uint256 auctionId;
        bytes32 requestId;
        bytes32 winnerIdentity;
        bytes32 winnerCiphertext;
        uint256 winningAmount;
        address[] operators;
        bytes[] signatures;
    }

    error DuplicateOperator(address operator);
    error InvalidOperator(address operator);
    error InvalidThreshold(uint256 threshold, uint256 operatorCount);
    error ProofLengthMismatch(uint256 operatorsLength, uint256 signaturesLength);
    error ZeroAddress();

    mapping(address => bool) public isOperator;
    mapping(address => uint256) public slashCount;

    uint256 public operatorCount;
    uint256 public threshold;

    event AttestationVerified(
        uint256 indexed auctionId,
        bytes32 indexed requestId,
        address indexed winner,
        uint256 winningAmount,
        uint256 signerCount
    );
    event ShieldedAttestationVerified(
        uint256 indexed auctionId,
        bytes32 indexed requestId,
        bytes32 indexed winnerIdentity,
        uint256 winningAmount,
        uint256 signerCount
    );
    event OperatorSet(address indexed operator, bool allowed);
    event OperatorSlashed(bytes32 indexed requestId, address indexed operator);
    event ThresholdUpdated(uint256 previousThreshold, uint256 newThreshold);

    constructor(address initialOwner, address[] memory initialOperators, uint256 initialThreshold) Ownable(initialOwner) {
        if (initialOperators.length == 0) {
            revert InvalidThreshold(initialThreshold, 0);
        }

        for (uint256 index = 0; index < initialOperators.length; ++index) {
            address operator = initialOperators[index];
            if (operator == address(0)) {
                revert ZeroAddress();
            }
            if (isOperator[operator]) {
                revert DuplicateOperator(operator);
            }

            isOperator[operator] = true;
            operatorCount += 1;
            emit OperatorSet(operator, true);
        }

        _setThreshold(initialThreshold);
    }

    function setOperator(address operator, bool allowed) external onlyOwner {
        if (operator == address(0)) {
            revert ZeroAddress();
        }

        if (allowed && isOperator[operator]) {
            revert DuplicateOperator(operator);
        }
        if (!allowed && !isOperator[operator]) {
            revert InvalidOperator(operator);
        }

        isOperator[operator] = allowed;
        operatorCount = allowed ? operatorCount + 1 : operatorCount - 1;
        emit OperatorSet(operator, allowed);

        if (threshold > operatorCount) {
            _setThreshold(operatorCount);
        }
    }

    function setThreshold(uint256 newThreshold) external onlyOwner {
        _setThreshold(newThreshold);
    }

    function computeDigest(
        address market,
        uint256 auctionId,
        bytes32 requestId,
        address winner,
        bytes32 winnerCiphertext,
        uint256 winningAmount
    ) public view override returns (bytes32) {
        if (market == address(0)) {
            revert ZeroAddress();
        }

        return keccak256(
            abi.encode(address(this), block.chainid, market, auctionId, requestId, winner, winnerCiphertext, winningAmount)
        );
    }

    function computeShieldedDigest(
        address market,
        uint256 auctionId,
        bytes32 requestId,
        bytes32 winnerIdentity,
        bytes32 winnerCiphertext,
        uint256 winningAmount
    ) public view override returns (bytes32) {
        if (market == address(0)) {
            revert ZeroAddress();
        }

        return keccak256(
            abi.encode(
                address(this),
                block.chainid,
                market,
                auctionId,
                requestId,
                winnerIdentity,
                winnerCiphertext,
                winningAmount
            )
        );
    }

    function verifyAttestation(
        address market,
        uint256 auctionId,
        bytes32 requestId,
        address winner,
        bytes32 winnerCiphertext,
        uint256 winningAmount,
        bytes calldata proof
    ) external override returns (bool) {
        ProofEnvelope memory envelope = abi.decode(proof, (ProofEnvelope));
        if (envelope.operators.length != envelope.signatures.length) {
            revert ProofLengthMismatch(envelope.operators.length, envelope.signatures.length);
        }

        if (
            envelope.auctionId != auctionId ||
            envelope.requestId != requestId ||
            envelope.winner != winner ||
            envelope.winnerCiphertext != winnerCiphertext ||
            envelope.winningAmount != winningAmount
        ) {
            _slashOperators(requestId, envelope.operators);
            return false;
        }

        if (envelope.operators.length < threshold) {
            return false;
        }

        bytes32 digest = computeDigest(market, auctionId, requestId, winner, winnerCiphertext, winningAmount)
            .toEthSignedMessageHash();
        uint256 validSignatures = 0;

        for (uint256 index = 0; index < envelope.operators.length; ++index) {
            address expectedOperator = envelope.operators[index];
            if (!isOperator[expectedOperator]) {
                _slashOperators(requestId, envelope.operators);
                return false;
            }

            for (uint256 prior = 0; prior < index; ++prior) {
                if (expectedOperator == envelope.operators[prior]) {
                    _slashOperators(requestId, envelope.operators);
                    return false;
                }
            }

            address recoveredSigner = digest.recover(envelope.signatures[index]);
            if (recoveredSigner != expectedOperator) {
                _slashOperators(requestId, envelope.operators);
                return false;
            }

            validSignatures += 1;
        }

        if (validSignatures < threshold) {
            return false;
        }

        emit AttestationVerified(auctionId, requestId, winner, winningAmount, validSignatures);
        return true;
    }

    function verifyShieldedAttestation(
        address market,
        uint256 auctionId,
        bytes32 requestId,
        bytes32 winnerIdentity,
        bytes32 winnerCiphertext,
        uint256 winningAmount,
        bytes calldata proof
    ) external override returns (bool) {
        ShieldedProofEnvelope memory envelope = abi.decode(proof, (ShieldedProofEnvelope));
        if (envelope.operators.length != envelope.signatures.length) {
            revert ProofLengthMismatch(envelope.operators.length, envelope.signatures.length);
        }

        if (
            envelope.auctionId != auctionId ||
            envelope.requestId != requestId ||
            envelope.winnerIdentity != winnerIdentity ||
            envelope.winnerCiphertext != winnerCiphertext ||
            envelope.winningAmount != winningAmount
        ) {
            _slashOperators(requestId, envelope.operators);
            return false;
        }

        if (envelope.operators.length < threshold) {
            return false;
        }

        bytes32 digest = computeShieldedDigest(market, auctionId, requestId, winnerIdentity, winnerCiphertext, winningAmount)
            .toEthSignedMessageHash();
        uint256 validSignatures = 0;

        for (uint256 index = 0; index < envelope.operators.length; ++index) {
            address expectedOperator = envelope.operators[index];
            if (!isOperator[expectedOperator]) {
                _slashOperators(requestId, envelope.operators);
                return false;
            }

            for (uint256 prior = 0; prior < index; ++prior) {
                if (expectedOperator == envelope.operators[prior]) {
                    _slashOperators(requestId, envelope.operators);
                    return false;
                }
            }

            address recoveredSigner = digest.recover(envelope.signatures[index]);
            if (recoveredSigner != expectedOperator) {
                _slashOperators(requestId, envelope.operators);
                return false;
            }

            validSignatures += 1;
        }

        if (validSignatures < threshold) {
            return false;
        }

        emit ShieldedAttestationVerified(auctionId, requestId, winnerIdentity, winningAmount, validSignatures);
        return true;
    }

    function _setThreshold(uint256 newThreshold) internal {
        if (newThreshold == 0 || newThreshold > operatorCount) {
            revert InvalidThreshold(newThreshold, operatorCount);
        }

        uint256 previousThreshold = threshold;
        threshold = newThreshold;
        emit ThresholdUpdated(previousThreshold, newThreshold);
    }

    function _slashOperators(bytes32 requestId, address[] memory operators) internal {
        for (uint256 index = 0; index < operators.length; ++index) {
            address operator = operators[index];
            if (!isOperator[operator] || _contains(operators, operator, index)) {
                continue;
            }

            slashCount[operator] += 1;
            emit OperatorSlashed(requestId, operator);
        }
    }

    function _contains(address[] memory operators, address operator, uint256 currentIndex) private pure returns (bool) {
        for (uint256 index = 0; index < currentIndex; ++index) {
            if (operators[index] == operator) {
                return true;
            }
        }

        return false;
    }
}
