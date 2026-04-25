// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "../interfaces/ISettlementEngine.sol";

contract SettlementEngine is ISettlementEngine {
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant MIN_DYNAMIC_TIMEOUT = 15 minutes;
    uint256 public constant MAX_DYNAMIC_TIMEOUT = 2 hours;
    uint256 public constant DYNAMIC_TIMEOUT_MULTIPLIER = 90;
    uint256 public constant MIN_CANCELLATION_SLASH_BPS = 2_500;

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
        uint256 progressBps = (boundedElapsed * BPS_DENOMINATOR) / duration;
        uint256 slashBps = MIN_CANCELLATION_SLASH_BPS +
            ((progressBps * (BPS_DENOMINATOR - MIN_CANCELLATION_SLASH_BPS)) / BPS_DENOMINATOR);

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
}
