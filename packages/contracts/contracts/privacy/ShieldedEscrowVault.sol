// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "../interfaces/IShieldedEscrowVault.sol";
import "../interfaces/IShieldedRefundSource.sol";

contract ShieldedEscrowVault is Ownable, ReentrancyGuard, IShieldedEscrowVault {
    struct CommitmentDeposit {
        uint256 auctionId;
        uint256 amount;
        bool claimed;
    }

    error CommitmentAlreadyClaimed(bytes32 commitmentHash);
    error CommitmentAlreadyExists(bytes32 commitmentHash);
    error CommitmentDoesNotExist(bytes32 commitmentHash);
    error InvalidCommitmentHash();
    error NativeTransferFailed(address recipient, uint256 amount);
    error NotMarket(address caller);
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
    mapping(uint256 => bytes32) private _winningCommitments;
    mapping(bytes32 => bool) public nullifierSpent;

    address public market;

    event MarketUpdated(address indexed previousMarket, address indexed newMarket);
    event ShieldedEscrowLocked(uint256 indexed auctionId, bytes32 indexed commitmentHash, uint256 amount);
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

    function setMarket(address newMarket) external onlyOwner {
        if (newMarket == address(0)) {
            revert ZeroAddress();
        }

        address previousMarket = market;
        market = newMarket;
        emit MarketUpdated(previousMarket, newMarket);
    }

    function lockEscrow(uint256 auctionId, bytes32 commitmentHash) external payable override onlyMarket {
        if (msg.value == 0) {
            revert ZeroValue();
        }
        if (commitmentHash == bytes32(0)) {
            revert InvalidCommitmentHash();
        }

        CommitmentDeposit storage commitment = _commitments[commitmentHash];
        if (commitment.amount != 0 || commitment.claimed) {
            revert CommitmentAlreadyExists(commitmentHash);
        }

        commitment.auctionId = auctionId;
        commitment.amount = msg.value;
        _auctionTotals[auctionId] += msg.value;

        emit ShieldedEscrowLocked(auctionId, commitmentHash, msg.value);
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

    function claimRefund(bytes32 secret, bytes32 nullifier, address payable recipient)
        external
        override
        nonReentrant
        returns (uint256 principalAmount, uint256 compensationAmount)
    {
        if (recipient == address(0)) {
            revert ZeroAddress();
        }

        bytes32 commitmentHash = keccak256(abi.encodePacked(secret, nullifier));
        bytes32 nullifierHash = keccak256(abi.encodePacked(nullifier));
        if (nullifierSpent[nullifierHash]) {
            revert NullifierAlreadySpent(nullifierHash);
        }

        CommitmentDeposit storage commitment = _commitments[commitmentHash];
        principalAmount = commitment.amount;
        if (principalAmount == 0) {
            if (commitment.claimed) {
                revert CommitmentAlreadyClaimed(commitmentHash);
            }
            revert CommitmentDoesNotExist(commitmentHash);
        }
        if (!_refundsUnlocked[commitment.auctionId]) {
            revert RefundsLocked(commitment.auctionId);
        }

        commitment.claimed = true;
        commitment.amount = 0;
        nullifierSpent[nullifierHash] = true;

        compensationAmount =
            IShieldedRefundSource(market).settleShieldedRefund(commitment.auctionId, nullifierHash, recipient, principalAmount);

        // slither-disable-next-line low-level-calls
        (bool success,) = recipient.call{value: principalAmount}("");
        if (!success) {
            revert NativeTransferFailed(recipient, principalAmount);
        }

        emit ShieldedRefundClaimed(commitment.auctionId, nullifierHash, recipient, principalAmount, compensationAmount);
    }

    function previewCommitment(bytes32 commitmentHash)
        external
        view
        override
        returns (uint256 auctionId, uint256 amount, bool refundUnlocked, bool claimed)
    {
        CommitmentDeposit storage commitment = _commitments[commitmentHash];
        auctionId = commitment.auctionId;
        amount = commitment.amount;
        claimed = commitment.claimed;
        refundUnlocked = _refundsUnlocked[auctionId];
    }

    function totalEscrowForAuction(uint256 auctionId) external view override returns (uint256) {
        return _auctionTotals[auctionId];
    }
}
