// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface ISlashedPot {
    function registerSlash(uint256 auctionId, uint256 totalEscrow) external payable;

    function previewClaim(uint256 auctionId, uint256 escrowContribution) external view returns (uint256);

    function claimFor(uint256 auctionId, address recipient, uint256 escrowContribution) external returns (uint256);
}
