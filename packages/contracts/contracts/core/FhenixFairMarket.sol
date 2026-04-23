// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

import "../interfaces/ICofheAdapter.sol";

contract FhenixFairMarket is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    IERC721Receiver
{
    enum AuctionState {
        CREATED,
        ACTIVE,
        RESOLVING,
        FINALIZED,
        CANCELLED,
        VOIDED
    }

    struct Auction {
        bool exists;
        address nftContract;
        uint256 tokenId;
        address seller;
        uint64 endTime;
        uint256 sellerDeposit;
        AuctionState state;
        bool isVickrey;
        uint64 lastBlockTimestamp;
        bytes32 winnerCiphertext;
        uint256 winningAmount;
    }

    error AuctionDoesNotExist(uint256 auctionId);
    error AuctionStillRunning(uint256 auctionId, uint256 endTime);
    error AuctionAlreadyEnded(uint256 auctionId, uint256 endTime);
    error IncorrectSellerDeposit(uint256 expected, uint256 actual);
    error InvalidDuration(uint256 providedDuration);
    error InvalidStateTransition(AuctionState fromState, AuctionState toState);
    error NFTNotApproved(address nftContract, uint256 tokenId);
    error NotAuctionSeller(address caller, address seller);
    error NotNFTOwner(address nftContract, uint256 tokenId, address caller);
    error ReentrancyGuardReentrantCall();
    error UnexpectedAuctionState(AuctionState expected, AuctionState actual);
    error ZeroAddress();
    error ZeroValue();

    uint256 public constant MIN_AUCTION_DURATION = 1 hours;
    uint256 public constant MAX_AUCTION_DURATION = 30 days;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    mapping(uint256 => Auction) private _auctions;
    mapping(uint256 => mapping(address => uint256)) public escrowBalances;
    mapping(uint256 => mapping(address => bool)) public hasWithdrawn;

    uint256 public auctionCounter;
    uint256 private _reentrancyStatus;
    address public slashedPot;
    ICofheAdapter public cofheAdapter;

    event AuctionCreated(
        uint256 indexed auctionId,
        address indexed seller,
        address indexed nftContract,
        uint256 tokenId,
        uint256 endTime,
        uint256 sellerDeposit,
        bool isVickrey
    );
    event AuctionStateChanged(uint256 indexed auctionId, AuctionState fromState, AuctionState toState);
    event EscrowLocked(uint256 indexed auctionId, address indexed bidder, uint256 amount);
    event ResolutionRecorded(uint256 indexed auctionId, bytes32 winnerCiphertext, uint256 winningAmount);

    modifier auctionExists(uint256 auctionId) {
        if (!_auctions[auctionId].exists) {
            revert AuctionDoesNotExist(auctionId);
        }
        _;
    }

    modifier onlyAuctionSeller(uint256 auctionId) {
        if (_auctions[auctionId].seller != msg.sender) {
            revert NotAuctionSeller(msg.sender, _auctions[auctionId].seller);
        }
        _;
    }

    modifier onlyAuctionState(uint256 auctionId, AuctionState expectedState) {
        AuctionState actualState = _auctions[auctionId].state;
        if (actualState != expectedState) {
            revert UnexpectedAuctionState(expectedState, actualState);
        }
        _;
    }

    modifier nonReentrant() {
        if (_reentrancyStatus == _ENTERED) {
            revert ReentrancyGuardReentrantCall();
        }

        _reentrancyStatus = _ENTERED;
        _;
        _reentrancyStatus = _NOT_ENTERED;
    }

    function initialize(ICofheAdapter adapter, address initialOwner, address initialSlashedPot) external initializer {
        if (address(adapter) == address(0) || initialOwner == address(0)) {
            revert ZeroAddress();
        }

        __Ownable_init(initialOwner);

        cofheAdapter = adapter;
        slashedPot = initialSlashedPot;
        _reentrancyStatus = _NOT_ENTERED;
    }

    function contractVersion() public pure virtual returns (string memory) {
        return "phase1";
    }

    function createAuction(
        address nftContract,
        uint256 tokenId,
        uint256 duration,
        uint256 sellerDeposit,
        bool isVickrey
    ) external payable nonReentrant returns (uint256 auctionId) {
        if (nftContract == address(0)) {
            revert ZeroAddress();
        }
        if (duration < MIN_AUCTION_DURATION || duration > MAX_AUCTION_DURATION) {
            revert InvalidDuration(duration);
        }
        if (msg.value == 0 || msg.value != sellerDeposit) {
            revert IncorrectSellerDeposit(sellerDeposit, msg.value);
        }
        if (IERC721(nftContract).ownerOf(tokenId) != msg.sender) {
            revert NotNFTOwner(nftContract, tokenId, msg.sender);
        }

        address approvedAddress = IERC721(nftContract).getApproved(tokenId);
        bool approvedForAll = IERC721(nftContract).isApprovedForAll(msg.sender, address(this));
        if (approvedAddress != address(this) && !approvedForAll) {
            revert NFTNotApproved(nftContract, tokenId);
        }

        auctionId = ++auctionCounter;

        Auction storage auction = _auctions[auctionId];
        auction.exists = true;
        auction.nftContract = nftContract;
        auction.tokenId = tokenId;
        auction.seller = msg.sender;
        auction.endTime = uint64(block.timestamp + duration);
        auction.sellerDeposit = sellerDeposit;
        auction.state = AuctionState.CREATED;
        auction.isVickrey = isVickrey;
        auction.lastBlockTimestamp = uint64(block.timestamp);

        IERC721(nftContract).safeTransferFrom(msg.sender, address(this), tokenId);

        _transitionState(auctionId, AuctionState.ACTIVE);

        emit AuctionCreated(
            auctionId,
            msg.sender,
            nftContract,
            tokenId,
            auction.endTime,
            sellerDeposit,
            isVickrey
        );
    }

    function lockEscrow(uint256 auctionId)
        external
        payable
        nonReentrant
        auctionExists(auctionId)
        onlyAuctionState(auctionId, AuctionState.ACTIVE)
    {
        if (msg.value == 0) {
            revert ZeroValue();
        }
        if (block.timestamp >= _auctions[auctionId].endTime) {
            revert AuctionAlreadyEnded(auctionId, _auctions[auctionId].endTime);
        }

        escrowBalances[auctionId][msg.sender] += msg.value;
        _auctions[auctionId].lastBlockTimestamp = uint64(block.timestamp);

        emit EscrowLocked(auctionId, msg.sender, msg.value);
    }

    function triggerFinalize(uint256 auctionId)
        external
        auctionExists(auctionId)
        onlyAuctionState(auctionId, AuctionState.ACTIVE)
    {
        if (block.timestamp < _auctions[auctionId].endTime) {
            revert AuctionStillRunning(auctionId, _auctions[auctionId].endTime);
        }

        _transitionState(auctionId, AuctionState.RESOLVING);
    }

    function submitResolution(
        uint256 auctionId,
        bytes32 winnerCiphertext,
        uint256 winningAmount
    ) external onlyOwner auctionExists(auctionId) onlyAuctionState(auctionId, AuctionState.RESOLVING) {
        Auction storage auction = _auctions[auctionId];
        auction.winnerCiphertext = winnerCiphertext;
        auction.winningAmount = winningAmount;

        _transitionState(auctionId, AuctionState.FINALIZED);
        emit ResolutionRecorded(auctionId, winnerCiphertext, winningAmount);
    }

    function cancelAuction(uint256 auctionId)
        external
        nonReentrant
        auctionExists(auctionId)
        onlyAuctionSeller(auctionId)
        onlyAuctionState(auctionId, AuctionState.ACTIVE)
    {
        if (block.timestamp >= _auctions[auctionId].endTime) {
            revert AuctionAlreadyEnded(auctionId, _auctions[auctionId].endTime);
        }

        Auction storage auction = _auctions[auctionId];
        IERC721(auction.nftContract).safeTransferFrom(address(this), auction.seller, auction.tokenId);

        _transitionState(auctionId, AuctionState.CANCELLED);
    }

    function triggerFallbackVoid(uint256 auctionId)
        external
        onlyOwner
        auctionExists(auctionId)
        onlyAuctionState(auctionId, AuctionState.RESOLVING)
    {
        Auction storage auction = _auctions[auctionId];
        IERC721(auction.nftContract).safeTransferFrom(address(this), auction.seller, auction.tokenId);

        _transitionState(auctionId, AuctionState.VOIDED);
    }

    function getAuction(uint256 auctionId)
        external
        view
        auctionExists(auctionId)
        returns (
            address nftContract,
            uint256 tokenId,
            address seller,
            uint64 endTime,
            uint256 sellerDeposit,
            AuctionState state,
            bool isVickrey,
            uint64 lastBlockTimestamp,
            bytes32 winnerCiphertext,
            uint256 winningAmount
        )
    {
        Auction storage auction = _auctions[auctionId];
        return (
            auction.nftContract,
            auction.tokenId,
            auction.seller,
            auction.endTime,
            auction.sellerDeposit,
            auction.state,
            auction.isVickrey,
            auction.lastBlockTimestamp,
            auction.winnerCiphertext,
            auction.winningAmount
        );
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function _transitionState(uint256 auctionId, AuctionState nextState) internal {
        Auction storage auction = _auctions[auctionId];
        AuctionState previousState = auction.state;

        bool validTransition = (previousState == AuctionState.CREATED && nextState == AuctionState.ACTIVE) ||
            (previousState == AuctionState.ACTIVE &&
                (nextState == AuctionState.RESOLVING || nextState == AuctionState.CANCELLED)) ||
            (previousState == AuctionState.RESOLVING &&
                (nextState == AuctionState.FINALIZED || nextState == AuctionState.VOIDED));

        if (!validTransition) {
            revert InvalidStateTransition(previousState, nextState);
        }

        auction.state = nextState;
        auction.lastBlockTimestamp = uint64(block.timestamp);

        emit AuctionStateChanged(auctionId, previousState, nextState);
    }
}
