// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";

import "../interfaces/ISettlementEngine.sol";

contract SlashedPot is Ownable {
    struct Pot {
        bool exists;
        uint256 totalEscrow;
        uint256 totalSlash;
    }

    error CompensationAlreadyClaimed(uint256 auctionId, address recipient);
    error NativeTransferFailed(address recipient, uint256 amount);
    error NotMarket(address caller);
    error ZeroAddress();

    mapping(uint256 => Pot) private _pots;
    mapping(uint256 => mapping(address => bool)) public hasClaimedCompensation;

    ISettlementEngine public immutable settlementEngine;
    address public market;

    event CompensationClaimed(uint256 indexed auctionId, address indexed recipient, uint256 amount);
    event MarketUpdated(address indexed previousMarket, address indexed newMarket);
    event SlashRegistered(uint256 indexed auctionId, uint256 totalEscrow, uint256 totalSlash);

    constructor(address initialOwner, ISettlementEngine engine) Ownable(initialOwner) {
        if (address(engine) == address(0)) {
            revert ZeroAddress();
        }

        settlementEngine = engine;
    }

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

    function registerSlash(uint256 auctionId, uint256 totalEscrow) external payable onlyMarket {
        Pot storage pot = _pots[auctionId];
        if (!pot.exists) {
            pot.exists = true;
            pot.totalEscrow = totalEscrow;
        }

        pot.totalSlash += msg.value;
        emit SlashRegistered(auctionId, pot.totalEscrow, pot.totalSlash);
    }

    function previewClaim(uint256 auctionId, uint256 escrowContribution) public view returns (uint256) {
        Pot storage pot = _pots[auctionId];
        return settlementEngine.computeProRataShare(escrowContribution, pot.totalEscrow, pot.totalSlash);
    }

    function claimFor(uint256 auctionId, address recipient, uint256 escrowContribution)
        external
        onlyMarket
        returns (uint256 amount)
    {
        if (hasClaimedCompensation[auctionId][recipient]) {
            revert CompensationAlreadyClaimed(auctionId, recipient);
        }

        hasClaimedCompensation[auctionId][recipient] = true;
        amount = previewClaim(auctionId, escrowContribution);

        if (amount == 0) {
            return 0;
        }

        (bool success,) = payable(recipient).call{value: amount}("");
        if (!success) {
            revert NativeTransferFailed(recipient, amount);
        }

        emit CompensationClaimed(auctionId, recipient, amount);
    }
}
