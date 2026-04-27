// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";

import "../interfaces/IEigenLayerAVS.sol";
import "../interfaces/ISettlementEngine.sol";

contract SettlementEngine is Ownable, ISettlementEngine {
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant MIN_DYNAMIC_TIMEOUT = 15 minutes;
    uint256 public constant MAX_DYNAMIC_TIMEOUT = 2 hours;
    uint256 public constant DYNAMIC_TIMEOUT_MULTIPLIER = 90;
    uint256 public constant MIN_CANCELLATION_SLASH_BPS = 2_500;

    error ZeroAddress();

    IEigenLayerAVS public avs;

    event AVSUpdated(address indexed previousAVS, address indexed newAVS);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setAVS(IEigenLayerAVS newAVS) external onlyOwner {
        if (address(newAVS) == address(0)) {
            revert ZeroAddress();
        }

        address previousAVS = address(avs);
        avs = newAVS;
        emit AVSUpdated(previousAVS, address(newAVS));
    }

    function computeDynamicTimeout(uint256 movingAverageBlockDelta) external pure override returns (uint256) {
        uint256 timeoutWindow = movingAverageBlockDelta == 0
            ? MIN_DYNAMIC_TIMEOUT
            : movingAverageBlockDelta * DYNAMIC_TIMEOUT_MULTIPLIER;

        if (timeoutWindow < MIN_DYNAMIC_TIMEOUT) {
            return MIN_DYNAMIC_TIMEOUT;
        }
        if (timeoutWindow > MAX_DYNAMIC_TIMEOUT) {
            return MAX_DYNAMIC_TIMEOUT;
        }

        return timeoutWindow;
    }

    function computeCancellationSlash(
        uint256 sellerDeposit,
        uint256 elapsed,
        uint256 duration,
        uint256 totalEscrow
    ) external pure override returns (uint256) {
        if (sellerDeposit == 0 || totalEscrow == 0) {
            return 0;
        }
        if (duration == 0) {
            return sellerDeposit;
        }

        uint256 boundedElapsed = elapsed > duration ? duration : elapsed;
        uint256 variableSlashBps =
            (boundedElapsed * (BPS_DENOMINATOR - MIN_CANCELLATION_SLASH_BPS)) / duration;
        uint256 slashBps = MIN_CANCELLATION_SLASH_BPS + variableSlashBps;

        return (sellerDeposit * slashBps) / BPS_DENOMINATOR;
    }

    function computeWinningRefund(uint256 escrowedAmount, uint256 winningAmount)
        external
        pure
        override
        returns (uint256)
    {
        return winningAmount >= escrowedAmount ? 0 : escrowedAmount - winningAmount;
    }

    function computeSellerPayout(uint256 sellerDeposit, uint256 winningAmount)
        external
        pure
        override
        returns (uint256)
    {
        return sellerDeposit + winningAmount;
    }

    function computeSellerCancellationPayout(uint256 sellerDeposit, uint256 slashAmount)
        external
        pure
        override
        returns (uint256)
    {
        return slashAmount >= sellerDeposit ? 0 : sellerDeposit - slashAmount;
    }

    function computeProRataShare(
        uint256 contribution,
        uint256 totalEscrow,
        uint256 totalPot
    ) external pure override returns (uint256) {
        if (contribution == 0 || totalEscrow == 0 || totalPot == 0) {
            return 0;
        }

        return (contribution * totalPot) / totalEscrow;
    }

    function prepareResolutionRequest(
        address market,
        uint256 auctionId,
        uint32 bidCount,
        uint64 endTime,
        uint256 finalizeNonce,
        bytes32 raceSalt
    ) external view override returns (ResolutionRequest memory) {
        if (market == address(0)) {
            revert ZeroAddress();
        }

        bytes32 requestId = keccak256(
            abi.encode(address(this), block.chainid, market, auctionId, bidCount, endTime, finalizeNonce, raceSalt)
        );
        return
            ResolutionRequest({
                requestId: requestId,
                winnerHandle: keccak256(abi.encode(requestId, "winner")),
                amountHandle: keccak256(abi.encode(requestId, "amount"))
            });
    }

    function verifyResolutionProof(
        address market,
        uint256 auctionId,
        bytes32 requestId,
        address winner,
        bytes32 winnerCiphertext,
        uint256 winningAmount,
        bytes calldata avsProof
    ) external override returns (bool) {
        if (market == address(0) || address(avs) == address(0)) {
            revert ZeroAddress();
        }

        return avs.verifyAttestation(market, auctionId, requestId, winner, winnerCiphertext, winningAmount, avsProof);
    }

    function verifyShieldedResolutionProof(
        address market,
        uint256 auctionId,
        bytes32 requestId,
        bytes32 winnerIdentity,
        bytes32 winnerCiphertext,
        uint256 winningAmount,
        bytes calldata avsProof
    ) external override returns (bool) {
        if (market == address(0) || address(avs) == address(0)) {
            revert ZeroAddress();
        }

        return
            avs.verifyShieldedAttestation(
                market,
                auctionId,
                requestId,
                winnerIdentity,
                winnerCiphertext,
                winningAmount,
                avsProof
            );
    }
}
