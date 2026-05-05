// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "../interfaces/ICofheAdapter.sol";
import "../interfaces/IShieldedBidVerifier.sol";
import "../interfaces/IShieldedEscrowVault.sol";
import "../interfaces/IShieldedRefundSource.sol";

contract ShieldedEscrowVault is Ownable, ReentrancyGuard, IShieldedEscrowVault {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    struct CommitmentDeposit {
        uint256 auctionId;
        uint256 amount;
        bool claimed;
        address claimAuthority;
    }

    bytes32 private constant _ASSET_CLAIM_TAG = keccak256("FFM_SHIELDED_ASSET_CLAIM");
    bytes32 private constant _BID_COVERAGE_TAG = keccak256("FFM_SHIELDED_BID_COVERAGE");
    bytes32 private constant _REFUND_CLAIM_TAG = keccak256("FFM_SHIELDED_REFUND_CLAIM");
    bytes32 private constant _REFUND_COMPENSATION_TAG = keccak256("FFM_SHIELDED_REFUND_COMPENSATION");

    error CommitmentAlreadyClaimed(bytes32 commitmentHash);
    error CommitmentAlreadyExists(bytes32 commitmentHash);
    error CommitmentDoesNotExist(bytes32 commitmentHash);
    error ClaimAuthorizationAlreadyUsed(bytes32 authorizationDigest);
    error ClaimAuthorizationExpired(uint256 deadline, uint256 currentTimestamp);
    error ClaimAuthorityNotSet(bytes32 commitmentHash);
    error InvalidCommitmentHash();
    error InvalidClaimAuthority(bytes32 commitmentHash, address expectedAuthority, address recoveredAuthority);
    error InvalidShieldedBidProof(bytes32 commitmentHash, address verifier);
    error InvalidSlashAllocation(uint256 auctionId);
    error NativeTransferFailed(address recipient, uint256 amount);
    error NotMarket(address caller);
    error NotPreviewReader(address caller);
    error NullifierAlreadySpent(bytes32 nullifierHash);
    error RefundsLocked(uint256 auctionId);
    error RefundsUnlocked(uint256 auctionId);
    error WinningAmountExceedsCommitment(uint256 auctionId, uint256 winningAmount, uint256 availableAmount);
    error WinningCommitmentAlreadySettled(uint256 auctionId, bytes32 commitmentHash);
    error ZeroAddress();
    error ZeroValue();

    mapping(bytes32 => CommitmentDeposit) private _commitments;
    mapping(uint256 => uint256) private _auctionTotals;
    mapping(uint256 => bool) private _refundsUnlocked;
    mapping(uint256 => uint256) private _shieldedSlashReserves;
    mapping(uint256 => bytes32) private _winningCommitments;
    mapping(bytes32 => bool) public nullifierSpent;
    mapping(bytes32 => bool) private _usedClaimAuthorizations;

    address public market;
    address public previewReader;
    address public shieldedBidVerifier;

    event MarketUpdated(address indexed previousMarket, address indexed newMarket);
    event PreviewReaderUpdated(address indexed previousPreviewReader, address indexed newPreviewReader);
    event ShieldedBidVerifierUpdated(address indexed previousVerifier, address indexed newVerifier);
    event ShieldedEscrowLocked(uint256 indexed auctionId, bytes32 indexed commitmentHash, uint256 amount);
    event ShieldedClaimAuthorityRegistered(
        uint256 indexed auctionId,
        bytes32 indexed commitmentHash,
        address indexed claimAuthority
    );
    event ShieldedClaimAuthorizationConsumed(
        uint256 indexed auctionId,
        bytes32 indexed commitmentHash,
        bytes32 indexed authorizationDigest,
        address recipient
    );
    event ShieldedSlashAllocated(
        uint256 indexed auctionId,
        uint256 shieldedSlashAmount,
        uint256 publicSlashAmount
    );
    event WinningCommitmentSettled(
        uint256 indexed auctionId,
        bytes32 indexed commitmentHash,
        uint256 winningAmount,
        uint256 remainingRefund
    );
    event ShieldedRefundClaimed(
        uint256 indexed auctionId,
        bytes32 indexed nullifierHash,
        address indexed recipient,
        uint256 principalAmount,
        uint256 compensationAmount
    );
    event ShieldedRefundsUnlocked(uint256 indexed auctionId);

    constructor(address initialOwner) Ownable(initialOwner) {}

    modifier onlyMarket() {
        if (msg.sender != market) {
            revert NotMarket(msg.sender);
        }
        _;
    }

    modifier canPreviewCommitment() {
        if (msg.sender != market && msg.sender != owner() && msg.sender != previewReader) {
            revert NotPreviewReader(msg.sender);
        }
        _;
    }

    function setMarket(address newMarket) external onlyOwner {
        if (newMarket == address(0)) {
            revert ZeroAddress();
        }

        address previousMarket = market;
        market = newMarket;
        emit MarketUpdated(previousMarket, newMarket);
    }

    function setPreviewReader(address newPreviewReader) external onlyOwner {
        if (newPreviewReader == address(0)) {
            revert ZeroAddress();
        }

        address previousPreviewReader = previewReader;
        previewReader = newPreviewReader;
        emit PreviewReaderUpdated(previousPreviewReader, newPreviewReader);
    }

    function setShieldedBidVerifier(address newVerifier) external onlyOwner {
        address previousVerifier = shieldedBidVerifier;
        // slither-disable-next-line missing-zero-check
        shieldedBidVerifier = newVerifier;
        emit ShieldedBidVerifierUpdated(previousVerifier, newVerifier);
    }

    function lockEscrow(uint256 auctionId, bytes32 commitmentHash, address claimAuthority) external payable override onlyMarket {
        if (msg.value == 0) {
            revert ZeroValue();
        }
        if (commitmentHash == bytes32(0)) {
            revert InvalidCommitmentHash();
        }
        if (claimAuthority == address(0)) {
            revert ZeroAddress();
        }

        CommitmentDeposit storage commitment = _commitments[commitmentHash];
        if (commitment.amount != 0 || commitment.claimed) {
            revert CommitmentAlreadyExists(commitmentHash);
        }

        commitment.auctionId = auctionId;
        commitment.amount = msg.value;
        commitment.claimAuthority = claimAuthority;
        _auctionTotals[auctionId] += msg.value;

        emit ShieldedEscrowLocked(auctionId, commitmentHash, msg.value);
        emit ShieldedClaimAuthorityRegistered(auctionId, commitmentHash, claimAuthority);
    }

    function allocateSlash(uint256 auctionId, uint256 publicEscrowTotal)
        external
        payable
        override
        onlyMarket
        nonReentrant
        returns (uint256 publicSlashAllocation)
    {
        uint256 shieldedEscrowTotal = _auctionTotals[auctionId];
        uint256 totalEscrow = publicEscrowTotal + shieldedEscrowTotal;
        if (msg.value == 0 || totalEscrow == 0) {
            revert InvalidSlashAllocation(auctionId);
        }

        publicSlashAllocation = shieldedEscrowTotal == 0 ? msg.value : (msg.value * publicEscrowTotal) / totalEscrow;
        uint256 shieldedSlashAllocation = msg.value - publicSlashAllocation;
        if (shieldedSlashAllocation != 0) {
            _shieldedSlashReserves[auctionId] += shieldedSlashAllocation;
        }

        if (publicSlashAllocation != 0) {
            // slither-disable-next-line low-level-calls
            (bool success,) = payable(market).call{value: publicSlashAllocation}("");
            if (!success) {
                revert NativeTransferFailed(market, publicSlashAllocation);
            }
        }

        emit ShieldedSlashAllocated(auctionId, shieldedSlashAllocation, publicSlashAllocation);
    }

    function settleWinningCommitment(uint256 auctionId, bytes32 commitmentHash, uint256 winningAmount)
        external
        override
        onlyMarket
        nonReentrant
        returns (uint256 remainingRefund)
    {
        if (_refundsUnlocked[auctionId]) {
            revert RefundsUnlocked(auctionId);
        }
        if (commitmentHash == bytes32(0)) {
            revert InvalidCommitmentHash();
        }
        if (_winningCommitments[auctionId] != bytes32(0)) {
            revert WinningCommitmentAlreadySettled(auctionId, _winningCommitments[auctionId]);
        }

        CommitmentDeposit storage commitment = _commitments[commitmentHash];
        uint256 availableAmount = commitment.amount;
        if (availableAmount == 0) {
            if (commitment.claimed) {
                revert CommitmentAlreadyClaimed(commitmentHash);
            }
            revert CommitmentDoesNotExist(commitmentHash);
        }
        if (commitment.auctionId != auctionId) {
            revert CommitmentDoesNotExist(commitmentHash);
        }
        if (winningAmount > availableAmount) {
            revert WinningAmountExceedsCommitment(auctionId, winningAmount, availableAmount);
        }

        remainingRefund = availableAmount - winningAmount;
        commitment.amount = remainingRefund;
        _winningCommitments[auctionId] = commitmentHash;
        _auctionTotals[auctionId] = _auctionTotals[auctionId] - winningAmount;

        // slither-disable-next-line low-level-calls
        (bool success,) = payable(market).call{value: winningAmount}("");
        if (!success) {
            revert NativeTransferFailed(market, winningAmount);
        }

        emit WinningCommitmentSettled(auctionId, commitmentHash, winningAmount, remainingRefund);
    }

    function unlockRefunds(uint256 auctionId) external override onlyMarket {
        if (_refundsUnlocked[auctionId]) {
            return;
        }

        _refundsUnlocked[auctionId] = true;
        emit ShieldedRefundsUnlocked(auctionId);
    }

    function authorizeAssetClaim(
        uint256 auctionId,
        bytes32 commitmentHash,
        address recipient,
        uint256 deadline,
        bytes calldata signature
    ) external override onlyMarket returns (bytes32 authorizationDigest) {
        CommitmentDeposit storage commitment = _requireRegisteredCommitment(commitmentHash);
        if (commitment.auctionId != auctionId) {
            revert CommitmentDoesNotExist(commitmentHash);
        }

        authorizationDigest = _consumeClaimAuthorization(
            _ASSET_CLAIM_TAG,
            commitmentHash,
            commitment.auctionId,
            recipient,
            deadline,
            signature
        );
    }

    function claimRefund(bytes32 secret, bytes32 nullifier, address payable recipient)
        external
        override
        pure
        returns (uint256 principalAmount, uint256 compensationAmount)
    {
        (secret, nullifier, recipient, principalAmount, compensationAmount);
        revert LegacyWitnessClaimsDisabled();
    }

    function claimRefundWithAuthorization(
        bytes32 commitmentHash,
        address payable recipient,
        uint256 deadline,
        bytes calldata signature
    ) external override nonReentrant returns (uint256 principalAmount, uint256 compensationAmount) {
        CommitmentDeposit storage commitment = _requireSpendableCommitment(commitmentHash);
        bytes32 authorizationDigest =
            _consumeClaimAuthorization(_REFUND_CLAIM_TAG, commitmentHash, commitment.auctionId, recipient, deadline, signature);
        bytes32 compensationKey = keccak256(abi.encodePacked(_REFUND_COMPENSATION_TAG, commitmentHash));
        (uint256 resolvedAuctionId, uint256 resolvedPrincipal, uint256 resolvedCompensation) =
            _releaseRefund(commitmentHash, compensationKey, recipient);

        principalAmount = resolvedPrincipal;
        compensationAmount = resolvedCompensation;
        emit ShieldedClaimAuthorizationConsumed(resolvedAuctionId, commitmentHash, authorizationDigest, recipient);
        emit ShieldedRefundClaimed(resolvedAuctionId, compensationKey, recipient, principalAmount, compensationAmount);
    }

    function commitmentState(bytes32 commitmentHash)
        external
        view
        override
        returns (uint256 auctionId, bool refundUnlocked, bool claimed)
    {
        CommitmentDeposit storage commitment = _commitments[commitmentHash];
        auctionId = commitment.auctionId;
        claimed = commitment.claimed;
        refundUnlocked = _refundsUnlocked[auctionId];
    }

    function verifyEncryptedBidCoverage(bytes32 commitmentHash, bytes32 encryptedBid, address adapter)
        external
        view
        override
        canPreviewCommitment
        returns (bool)
    {
        if (adapter == address(0)) {
            revert ZeroAddress();
        }

        CommitmentDeposit storage commitment = _requireSpendableCommitment(commitmentHash);
        return ICofheAdapter(adapter).verifyEncryptedBidCoverage(encryptedBid, commitment.amount);
    }

    function verifyBidCoverageProof(bytes32 commitmentHash, bytes32 encryptedBid, uint256 deadline, bytes calldata signature)
        external
        view
        override
    {
        CommitmentDeposit storage commitment = _requireSpendableCommitment(commitmentHash);
        if (block.timestamp > deadline) {
            revert ClaimAuthorizationExpired(deadline, block.timestamp);
        }

        address verifier = shieldedBidVerifier;
        if (verifier != address(0)) {
            bool valid = IShieldedBidVerifier(verifier).verifyBidCoverage(
                address(this),
                commitment.auctionId,
                commitmentHash,
                encryptedBid,
                deadline,
                signature
            );
            if (!valid) {
                revert InvalidShieldedBidProof(commitmentHash, verifier);
            }
            return;
        }

        _assertClaimAuthorityProof(
            _BID_COVERAGE_TAG,
            commitmentHash,
            commitment.auctionId,
            keccak256(abi.encode(encryptedBid)),
            deadline,
            signature
        );
    }

    function verifyPlaintextBidCoverage(bytes32 commitmentHash, uint256 bidAmount)
        external
        view
        override
        canPreviewCommitment
        returns (bool)
    {
        CommitmentDeposit storage commitment = _requireSpendableCommitment(commitmentHash);
        return bidAmount <= commitment.amount;
    }

    function previewCommitment(bytes32 commitmentHash)
        external
        view
        override
        canPreviewCommitment
        returns (uint256 auctionId, uint256 amount, bool refundUnlocked, bool claimed)
    {
        CommitmentDeposit storage commitment = _commitments[commitmentHash];
        auctionId = commitment.auctionId;
        amount = commitment.amount;
        claimed = commitment.claimed;
        refundUnlocked = _refundsUnlocked[auctionId];
    }

    function claimAuthorityForCommitment(bytes32 commitmentHash) external view override returns (address) {
        return _commitments[commitmentHash].claimAuthority;
    }

    function hasEscrowForAuction(uint256 auctionId) external view override returns (bool) {
        return _auctionTotals[auctionId] != 0;
    }

    function _releaseRefund(bytes32 commitmentHash, bytes32 compensationKey, address payable recipient)
        internal
        returns (uint256 auctionId, uint256 principalAmount, uint256 compensationAmount)
    {
        CommitmentDeposit storage commitment = _requireSpendableCommitment(commitmentHash);
        auctionId = commitment.auctionId;
        if (!_refundsUnlocked[auctionId]) {
            revert RefundsLocked(auctionId);
        }

        principalAmount = commitment.amount;
        compensationAmount = _consumeShieldedCompensation(auctionId, principalAmount);
        commitment.claimed = true;
        commitment.amount = 0;
        _auctionTotals[auctionId] = _auctionTotals[auctionId] - principalAmount;

        uint256 settledAmount =
            IShieldedRefundSource(market).settleShieldedRefund(auctionId, compensationKey, recipient, principalAmount);
        (settledAmount);

        // slither-disable-next-line low-level-calls
        (bool success,) = recipient.call{value: principalAmount + compensationAmount}("");
        if (!success) {
            revert NativeTransferFailed(recipient, principalAmount + compensationAmount);
        }
    }

    function _requireSpendableCommitment(bytes32 commitmentHash) internal view returns (CommitmentDeposit storage commitment) {
        commitment = _commitments[commitmentHash];
        if (commitment.amount == 0) {
            if (commitment.claimed) {
                revert CommitmentAlreadyClaimed(commitmentHash);
            }
            revert CommitmentDoesNotExist(commitmentHash);
        }
    }

    function _consumeClaimAuthorization(
        bytes32 claimTag,
        bytes32 commitmentHash,
        uint256 auctionId,
        address recipient,
        uint256 deadline,
        bytes calldata signature
    ) internal returns (bytes32 authorizationDigest) {
        if (recipient == address(0)) {
            revert ZeroAddress();
        }
        if (block.timestamp > deadline) {
            revert ClaimAuthorizationExpired(deadline, block.timestamp);
        }

        CommitmentDeposit storage commitment = _requireRegisteredCommitment(commitmentHash);
        address claimAuthority = commitment.claimAuthority;

        authorizationDigest =
            keccak256(abi.encode(claimTag, block.chainid, address(this), auctionId, commitmentHash, recipient, deadline))
                .toEthSignedMessageHash();
        if (_usedClaimAuthorizations[authorizationDigest]) {
            revert ClaimAuthorizationAlreadyUsed(authorizationDigest);
        }

        address recoveredAuthority = authorizationDigest.recover(signature);
        if (recoveredAuthority != claimAuthority) {
            revert InvalidClaimAuthority(commitmentHash, claimAuthority, recoveredAuthority);
        }

        _usedClaimAuthorizations[authorizationDigest] = true;
    }

    function _assertClaimAuthorityProof(
        bytes32 claimTag,
        bytes32 commitmentHash,
        uint256 auctionId,
        bytes32 payloadHash,
        uint256 deadline,
        bytes calldata signature
    ) internal view {
        if (block.timestamp > deadline) {
            revert ClaimAuthorizationExpired(deadline, block.timestamp);
        }

        CommitmentDeposit storage commitment = _requireRegisteredCommitment(commitmentHash);
        address claimAuthority = commitment.claimAuthority;
        bytes32 authorizationDigest =
            keccak256(abi.encode(claimTag, block.chainid, address(this), auctionId, commitmentHash, payloadHash, deadline))
                .toEthSignedMessageHash();
        address recoveredAuthority = authorizationDigest.recover(signature);
        if (recoveredAuthority != claimAuthority) {
            revert InvalidClaimAuthority(commitmentHash, claimAuthority, recoveredAuthority);
        }
    }

    function _requireRegisteredCommitment(bytes32 commitmentHash) internal view returns (CommitmentDeposit storage commitment) {
        commitment = _commitments[commitmentHash];
        if (commitment.auctionId == 0) {
            revert CommitmentDoesNotExist(commitmentHash);
        }
        if (commitment.claimAuthority == address(0)) {
            revert ClaimAuthorityNotSet(commitmentHash);
        }
    }

    function _consumeShieldedCompensation(uint256 auctionId, uint256 principalAmount) internal returns (uint256 compensationAmount) {
        uint256 reserve = _shieldedSlashReserves[auctionId];
        if (reserve == 0) {
            return 0;
        }

        uint256 remainingEscrow = _auctionTotals[auctionId];
        if (remainingEscrow == 0) {
            return 0;
        }

        compensationAmount = (principalAmount * reserve) / remainingEscrow;
        _shieldedSlashReserves[auctionId] = reserve - compensationAmount;
    }
}
