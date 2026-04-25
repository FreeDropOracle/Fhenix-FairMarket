// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "../core/FhenixFairMarket.sol";

contract MockFhenixFairMarketV2 is FhenixFairMarket {
    function contractVersion() public pure override returns (string memory) {
        return "phase2-v2";
    }

    function versionMarker() external pure returns (uint256) {
        return 2;
    }
}
