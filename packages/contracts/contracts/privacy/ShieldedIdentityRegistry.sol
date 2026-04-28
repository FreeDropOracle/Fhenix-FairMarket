// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";

import "../interfaces/IShieldedIdentityRegistry.sol";

contract ShieldedIdentityRegistry is Ownable, IShieldedIdentityRegistry {
    error IdentityAlreadyBound(uint256 auctionId, bytes32 identityHash, bytes32 existingCommitmentHash);
    error CommitmentAlreadyBound(uint256 auctionId, bytes32 commitmentHash, bytes32 existingIdentityHash);
    error IdentityNotBound(uint256 auctionId, bytes32 identityHash);
    error InvalidCommitmentHash();
    error InvalidIdentityHash();
    error NotMarket(address caller);
    error WinningIdentityAlreadyMarked(uint256 auctionId, bytes32 existingIdentityHash);
    error ZeroAddress();

    mapping(uint256 => mapping(bytes32 => bytes32)) private _identityToCommitment;
    mapping(uint256 => mapping(bytes32 => bytes32)) private _commitmentToIdentity;
    mapping(uint256 => bytes32) private _winningIdentity;

    address public market;

    event MarketUpdated(address indexed previousMarket, address indexed newMarket);
    event ShieldedIdentityBound(uint256 indexed auctionId, bytes32 indexed identityHash, bytes32 indexed commitmentHash);
    event WinningIdentityMarked(uint256 indexed auctionId, bytes32 indexed identityHash, bytes32 indexed commitmentHash);

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

    function bindIdentity(uint256 auctionId, bytes32 identityHash, bytes32 commitmentHash) external override onlyMarket {
        if (identityHash == bytes32(0)) {
            revert InvalidIdentityHash();
        }
        if (commitmentHash == bytes32(0)) {
            revert InvalidCommitmentHash();
        }

        bytes32 existingCommitmentHash = _identityToCommitment[auctionId][identityHash];
        if (existingCommitmentHash != bytes32(0) && existingCommitmentHash != commitmentHash) {
            revert IdentityAlreadyBound(auctionId, identityHash, existingCommitmentHash);
        }

        bytes32 existingIdentityHash = _commitmentToIdentity[auctionId][commitmentHash];
        if (existingIdentityHash != bytes32(0) && existingIdentityHash != identityHash) {
            revert CommitmentAlreadyBound(auctionId, commitmentHash, existingIdentityHash);
        }

        if (existingCommitmentHash == bytes32(0)) {
            _identityToCommitment[auctionId][identityHash] = commitmentHash;
            _commitmentToIdentity[auctionId][commitmentHash] = identityHash;
            emit ShieldedIdentityBound(auctionId, identityHash, commitmentHash);
        }
    }

    function markWinningIdentity(uint256 auctionId, bytes32 identityHash) external override onlyMarket {
        if (identityHash == bytes32(0)) {
            revert InvalidIdentityHash();
        }

        bytes32 commitmentHash = _identityToCommitment[auctionId][identityHash];
        if (commitmentHash == bytes32(0)) {
            revert IdentityNotBound(auctionId, identityHash);
        }

        bytes32 existingWinningIdentity = _winningIdentity[auctionId];
        if (existingWinningIdentity != bytes32(0) && existingWinningIdentity != identityHash) {
            revert WinningIdentityAlreadyMarked(auctionId, existingWinningIdentity);
        }

        _winningIdentity[auctionId] = identityHash;
        emit WinningIdentityMarked(auctionId, identityHash, commitmentHash);
    }

    function commitmentForIdentity(uint256 auctionId, bytes32 identityHash) external view override returns (bytes32) {
        return _identityToCommitment[auctionId][identityHash];
    }

    function identityForCommitment(uint256 auctionId, bytes32 commitmentHash) external view override returns (bytes32) {
        return _commitmentToIdentity[auctionId][commitmentHash];
    }

    function winningIdentity(uint256 auctionId) external view override returns (bytes32) {
        return _winningIdentity[auctionId];
    }
}
