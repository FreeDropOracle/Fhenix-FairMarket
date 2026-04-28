// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface IShieldedRefundSource {
    function settleShieldedRefund(
        uint256 auctionId,
        bytes32 nullifierHash,
        address recipient,
        uint256 escrowContribution
    ) external returns (uint256 compensation);
}
