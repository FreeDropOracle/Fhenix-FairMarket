// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

library NFTGuard {
    function lockIntoEscrow(address nftContract, address owner, address escrow, uint256 tokenId) internal {
        IERC721(nftContract).safeTransferFrom(owner, escrow, tokenId);
    }

    function releaseFromEscrow(address nftContract, address escrow, address recipient, uint256 tokenId) internal {
        IERC721(nftContract).safeTransferFrom(escrow, recipient, tokenId);
    }
}
