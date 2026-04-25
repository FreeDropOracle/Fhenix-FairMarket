// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

import "../adapters/NFTGuard.sol";
import "../interfaces/ICofheAdapter.sol";
import "../interfaces/ISettlementEngine.sol";
import "../interfaces/ISlashedPot.sol";

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
        address winner;
        uint256 totalEscrow;
        uint256 slashAmount;
        uint64 createdAt;
        uint64 resolvingSince;
        bool sellerClaimed;
        bool assetClaimed;
        uint32 bidCount;
    }

    struct PendingResolutionRequest {
        bool exists;
        bytes32 requestId;
        bytes32 winnerHandle;
        bytes32 amountHandle;
        uint64 requestedAt;
    }

    error AuctionDoesNotExist(uint256 auctionId);
    error AuctionStillRunning(uint256 auctionId, uint256 endTime);
    error AuctionAlreadyEnded(uint256 auctionId, uint256 endTime);
    error IncorrectSellerDeposit(uint256 expected, uint256 actual);
    error InvalidDuration(uint256 providedDuration);
    error InvalidStateTransition(AuctionState fromState, AuctionState toState);
    error AssetAlreadyClaimed(uint256 auctionId);
    error BidExceedsEscrow(uint256 auctionId, address bidder);
    error FinalizeRewardAlreadyClaimed(uint256 auctionId);
    error FinalizeRewardNotReady(uint256 auctionId, AuctionState currentState);
    error FallbackThresholdNotReached(uint256 elapsed, uint256 requiredThreshold);
    error InvalidWinningAmount(uint256 auctionId, uint256 winningAmount, uint256 availableEscrow);
    error InvalidAVSProof(uint256 auctionId, bytes32 requestId);
    error MissingEncryptedBid(uint256 auctionId, address bidder);
    error MissingResolutionRequest(uint256 auctionId);
    error NativeTransferFailed(address recipient, uint256 amount);
    error NoClaimableBalance(uint256 auctionId, address claimant);
    error NoEscrowLocked(uint256 auctionId, address bidder);
    error NFTNotApproved(address nftContract, uint256 tokenId);
    error NotAuctionSeller(address caller, address seller);
    error NotNFTOwner(address nftContract, uint256 tokenId, address caller);
    error ReentrancyGuardReentrantCall();
    error SellerProceedsAlreadyClaimed(uint256 auctionId);
    error SlashedPotNotConfigured();
    error UnexpectedAuctionState(AuctionState expected, AuctionState actual);
    error UnauthorizedAssetClaim(uint256 auctionId, address caller, address expectedRecipient);
    error UnauthorizedFinalizeRewardClaim(uint256 auctionId, address caller, address executor);
    error WinnerRequiredForWinningAmount(uint256 auctionId, uint256 winningAmount);
    error ResolutionAlreadyRequested(uint256 auctionId, bytes32 requestId);
    error ZeroWinningAmount(uint256 auctionId, address winner);
    error ZeroAddress();
    error ZeroValue();

    uint256 public constant MIN_AUCTION_DURATION = 1 hours;
    uint256 public constant MAX_AUCTION_DURATION = 30 days;
    uint256 private constant _BPS_DENOMINATOR = 10_000;
    uint256 private constant _DEFAULT_DYNAMIC_TIMEOUT = 30 minutes;
    uint256 private constant _KEEPER_FINALIZE_REWARD_BPS = 20;
    uint256 private constant _NETWORK_SAMPLE_CEILING = 10 minutes;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    mapping(uint256 => Auction) private _auctions;
    mapping(uint256 => mapping(address => uint256)) public escrowBalances;
    mapping(uint256 => mapping(address => bool)) public hasWithdrawn;
    mapping(uint256 => mapping(address => bytes32)) private _encryptedBids;

    uint256 public auctionCounter;
    uint256 private _reentrancyStatus;
    address public slashedPot;
    ICofheAdapter public cofheAdapter;
    ISettlementEngine public settlementEngine;
    uint64 public lastObservationTimestamp;
    uint64 public movingAverageBlockDelta;
    // New Phase 3 storage must stay append-only to preserve the Phase 2 proxy layout.
    mapping(uint256 => mapping(address => bool)) private _knownBidders;
    mapping(uint256 => address[]) private _bidders;
    mapping(uint256 => PendingResolutionRequest) private _resolutionRequests;
    // Phase 4 keeper storage must stay append-only after the Phase 3 layout.
    mapping(uint256 => address) private _finalizationExecutors;
    mapping(uint256 => uint256) private _finalizationRewards;
    mapping(uint256 => uint256) private _finalizationNonces;
    mapping(uint256 => bytes32) private _finalizationSalts;
    mapping(uint256 => bool) private _finalizationRewardClaimed;

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
    event BidPlaced(uint256 indexed auctionId, address indexed bidder, bytes32 bidHandle);
    event EscrowLocked(uint256 indexed auctionId, address indexed bidder, uint256 amount);
    event ResolutionRecorded(uint256 indexed auctionId, address indexed winner, bytes32 winnerCiphertext);
    event ResolutionRejected(uint256 indexed auctionId, bytes32 indexed requestId);
    event RefundClaimed(uint256 indexed auctionId, address indexed claimant, uint256 escrowRefund, uint256 compensation);
    event SellerProceedsClaimed(uint256 indexed auctionId, address indexed seller, uint256 amount);
    event AssetClaimed(uint256 indexed auctionId, address indexed recipient, uint256 tokenId);
    event SettlementDependenciesUpdated(address indexed settlementEngine, address indexed slashedPot);
    event FallbackTriggered(uint256 indexed auctionId, uint256 elapsed, uint256 threshold);
    event FinalizationIncentiveReserved(
        uint256 indexed auctionId,
        address indexed executor,
        uint256 reward,
        uint256 nonce,
        bytes32 raceSalt
    );
    event FinalizationTriggered(uint256 indexed auctionId, bytes32 indexed requestId);
    event FinalizeRewardClaimed(uint256 indexed auctionId, address indexed executor, uint256 amount);
    event DecryptionRequested(
        uint256 indexed auctionId,
        bytes32 indexed requestId,
        bytes32 winnerHandle,
        bytes32 amountHandle
    );

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
        return "phase4";
    }

    function setSettlementEngine(ISettlementEngine newSettlementEngine) external onlyOwner {
        if (address(newSettlementEngine) == address(0)) {
            revert ZeroAddress();
        }

        settlementEngine = newSettlementEngine;
        emit SettlementDependenciesUpdated(address(newSettlementEngine), slashedPot);
    }

    function setSlashedPot(address newSlashedPot) external onlyOwner {
        if (newSlashedPot == address(0)) {
            revert ZeroAddress();
        }

        slashedPot = newSlashedPot;
        emit SettlementDependenciesUpdated(address(settlementEngine), newSlashedPot);
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
        auction.createdAt = uint64(block.timestamp);
        auction.lastBlockTimestamp = uint64(block.timestamp);

        _observeNetwork();
        NFTGuard.lockIntoEscrow(nftContract, msg.sender, address(this), tokenId);

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
        _auctions[auctionId].totalEscrow += msg.value;
        _auctions[auctionId].lastBlockTimestamp = uint64(block.timestamp);
        _observeNetwork();

        emit EscrowLocked(auctionId, msg.sender, msg.value);
    }

    function placeBid(uint256 auctionId, bytes32 encryptedBid)
        external
        nonReentrant
        auctionExists(auctionId)
        onlyAuctionState(auctionId, AuctionState.ACTIVE)
    {
        Auction storage auction = _auctions[auctionId];
        if (block.timestamp >= auction.endTime) {
            revert AuctionAlreadyEnded(auctionId, auction.endTime);
        }

        uint256 availableEscrow = escrowBalances[auctionId][msg.sender];
        if (availableEscrow == 0) {
            revert NoEscrowLocked(auctionId, msg.sender);
        }
        if (!cofheAdapter.lte(encryptedBid, availableEscrow)) {
            revert BidExceedsEscrow(auctionId, msg.sender);
        }

        if (_encryptedBids[auctionId][msg.sender] == bytes32(0)) {
            auction.bidCount += 1;
        }
        if (!_knownBidders[auctionId][msg.sender]) {
            _knownBidders[auctionId][msg.sender] = true;
            _bidders[auctionId].push(msg.sender);
        }

        _encryptedBids[auctionId][msg.sender] = encryptedBid;
        auction.lastBlockTimestamp = uint64(block.timestamp);
        _observeNetwork();

        emit BidPlaced(auctionId, msg.sender, encryptedBid);
    }

    function triggerFinalize(uint256 auctionId)
        external
        auctionExists(auctionId)
        onlyAuctionState(auctionId, AuctionState.ACTIVE)
    {
        Auction storage auction = _auctions[auctionId];
        if (block.timestamp < auction.endTime) {
            revert AuctionStillRunning(auctionId, auction.endTime);
        }

        PendingResolutionRequest storage existingRequest = _resolutionRequests[auctionId];
        if (existingRequest.exists) {
            revert ResolutionAlreadyRequested(auctionId, existingRequest.requestId);
        }

        _observeNetwork();
        _transitionState(auctionId, AuctionState.RESOLVING);
        auction.resolvingSince = uint64(block.timestamp);

        uint256 finalizeNonce = _finalizationNonces[auctionId] + 1;
        bytes32 raceSalt = _deriveFinalizationSalt(auctionId, finalizeNonce);
        uint256 finalizeReward = _computeFinalizeReward(auction.sellerDeposit);

        _finalizationExecutors[auctionId] = msg.sender;
        _finalizationRewards[auctionId] = finalizeReward;
        _finalizationNonces[auctionId] = finalizeNonce;
        _finalizationSalts[auctionId] = raceSalt;

        ISettlementEngine.ResolutionRequest memory nextRequest = _prepareResolutionRequest(
            auctionId,
            auction,
            finalizeNonce,
            raceSalt
        );
        _resolutionRequests[auctionId] = PendingResolutionRequest({
            exists: true,
            requestId: nextRequest.requestId,
            winnerHandle: nextRequest.winnerHandle,
            amountHandle: nextRequest.amountHandle,
            requestedAt: uint64(block.timestamp)
        });

        emit FinalizationIncentiveReserved(auctionId, msg.sender, finalizeReward, finalizeNonce, raceSalt);
        emit FinalizationTriggered(auctionId, nextRequest.requestId);
        emit DecryptionRequested(auctionId, nextRequest.requestId, nextRequest.winnerHandle, nextRequest.amountHandle);
    }

    function submitResolution(
        uint256 auctionId,
        bytes32 winnerCiphertext,
        uint256 winningAmount,
        bytes calldata avsProof
    ) external onlyOwner auctionExists(auctionId) onlyAuctionState(auctionId, AuctionState.RESOLVING) returns (bool) {
        return _submitResolution(auctionId, address(0), winnerCiphertext, winningAmount, avsProof);
    }

    function submitResolution(
        uint256 auctionId,
        address winner,
        bytes32 winnerCiphertext,
        uint256 winningAmount,
        bytes calldata avsProof
    ) external onlyOwner auctionExists(auctionId) onlyAuctionState(auctionId, AuctionState.RESOLVING) returns (bool) {
        return _submitResolution(auctionId, winner, winnerCiphertext, winningAmount, avsProof);
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
        auction.slashAmount = _computeCancellationSlash(auction);
        _registerSlash(auctionId, auction.totalEscrow, auction.slashAmount);
        _observeNetwork();

        NFTGuard.releaseFromEscrow(auction.nftContract, address(this), auction.seller, auction.tokenId);
        _transitionState(auctionId, AuctionState.CANCELLED);
    }

    function triggerFallbackVoid(uint256 auctionId)
        external
        nonReentrant
        auctionExists(auctionId)
        onlyAuctionState(auctionId, AuctionState.RESOLVING)
    {
        Auction storage auction = _auctions[auctionId];
        uint256 timeoutWindow = previewDynamicTimeout();
        uint256 elapsed = block.timestamp - auction.resolvingSince;

        if (elapsed < timeoutWindow) {
            revert FallbackThresholdNotReached(elapsed, timeoutWindow);
        }

        uint256 finalizeReward = _finalizationRewards[auctionId];
        auction.slashAmount = auction.totalEscrow == 0
            ? 0
            : (finalizeReward >= auction.sellerDeposit ? 0 : auction.sellerDeposit - finalizeReward);
        _registerSlash(auctionId, auction.totalEscrow, auction.slashAmount);
        _observeNetwork();
        delete _resolutionRequests[auctionId];

        NFTGuard.releaseFromEscrow(auction.nftContract, address(this), auction.seller, auction.tokenId);
        _transitionState(auctionId, AuctionState.VOIDED);

        emit FallbackTriggered(auctionId, elapsed, timeoutWindow);
    }

    function claimRefund(uint256 auctionId) external nonReentrant auctionExists(auctionId) {
        if (hasWithdrawn[auctionId][msg.sender]) {
            revert NoClaimableBalance(auctionId, msg.sender);
        }

        (uint256 escrowRefund, uint256 compensation) = previewRefund(auctionId, msg.sender);
        if (escrowRefund == 0 && compensation == 0) {
            revert NoClaimableBalance(auctionId, msg.sender);
        }

        hasWithdrawn[auctionId][msg.sender] = true;
        if (escrowRefund != 0) {
            escrowBalances[auctionId][msg.sender] = 0;
            _sendValue(payable(msg.sender), escrowRefund);
        }

        if (compensation != 0) {
            compensation = ISlashedPot(slashedPot).claimFor(auctionId, msg.sender, escrowRefund);
        }

        emit RefundClaimed(auctionId, msg.sender, escrowRefund, compensation);
    }

    function claimSellerProceeds(uint256 auctionId)
        external
        nonReentrant
        auctionExists(auctionId)
        onlyAuctionSeller(auctionId)
    {
        Auction storage auction = _auctions[auctionId];
        if (auction.sellerClaimed) {
            revert SellerProceedsAlreadyClaimed(auctionId);
        }

        uint256 sellerPayout = previewSellerPayout(auctionId);
        if (sellerPayout == 0) {
            revert NoClaimableBalance(auctionId, msg.sender);
        }

        auction.sellerClaimed = true;
        _sendValue(payable(msg.sender), sellerPayout);

        emit SellerProceedsClaimed(auctionId, msg.sender, sellerPayout);
    }

    function claimFinalizeReward(uint256 auctionId) external nonReentrant auctionExists(auctionId) {
        address executor = _finalizationExecutors[auctionId];
        if (executor != msg.sender) {
            revert UnauthorizedFinalizeRewardClaim(auctionId, msg.sender, executor);
        }
        if (_finalizationRewardClaimed[auctionId]) {
            revert FinalizeRewardAlreadyClaimed(auctionId);
        }

        AuctionState state = _auctions[auctionId].state;
        if (state != AuctionState.FINALIZED && state != AuctionState.VOIDED) {
            revert FinalizeRewardNotReady(auctionId, state);
        }

        uint256 reward = _finalizationRewards[auctionId];
        _finalizationRewardClaimed[auctionId] = true;

        if (reward != 0) {
            _sendValue(payable(msg.sender), reward);
        }

        emit FinalizeRewardClaimed(auctionId, msg.sender, reward);
    }

    function claimAsset(uint256 auctionId) external nonReentrant auctionExists(auctionId) onlyAuctionState(auctionId, AuctionState.FINALIZED) {
        Auction storage auction = _auctions[auctionId];
        if (auction.assetClaimed) {
            revert AssetAlreadyClaimed(auctionId);
        }

        address expectedRecipient = auction.winner == address(0) ? auction.seller : auction.winner;
        if (msg.sender != expectedRecipient) {
            revert UnauthorizedAssetClaim(auctionId, msg.sender, expectedRecipient);
        }

        auction.assetClaimed = true;
        NFTGuard.releaseFromEscrow(auction.nftContract, address(this), expectedRecipient, auction.tokenId);

        emit AssetClaimed(auctionId, expectedRecipient, auction.tokenId);
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

    function getAuctionPhase2Details(uint256 auctionId)
        external
        view
        auctionExists(auctionId)
        returns (
            address winner,
            uint256 totalEscrow,
            uint256 slashAmount,
            uint64 createdAt,
            uint64 resolvingSince,
            bool sellerClaimed,
            bool assetClaimed,
            uint32 bidCount
        )
    {
        Auction storage auction = _auctions[auctionId];
        return (
            auction.winner,
            auction.totalEscrow,
            auction.slashAmount,
            auction.createdAt,
            auction.resolvingSince,
            auction.sellerClaimed,
            auction.assetClaimed,
            auction.bidCount
        );
    }

    function getEncryptedBid(uint256 auctionId, address bidder)
        external
        view
        auctionExists(auctionId)
        returns (bytes32)
    {
        return _encryptedBids[auctionId][bidder];
    }

    function getBidders(uint256 auctionId) external view auctionExists(auctionId) returns (address[] memory) {
        return _bidders[auctionId];
    }

    function getResolutionRequest(uint256 auctionId)
        external
        view
        auctionExists(auctionId)
        returns (bytes32 requestId, bytes32 winnerHandle, bytes32 amountHandle, uint64 requestedAt)
    {
        PendingResolutionRequest storage request = _resolutionRequests[auctionId];
        if (!request.exists) {
            revert MissingResolutionRequest(auctionId);
        }

        return (request.requestId, request.winnerHandle, request.amountHandle, request.requestedAt);
    }

    function getKeeperFinalization(uint256 auctionId)
        external
        view
        auctionExists(auctionId)
        returns (address executor, uint256 reward, uint256 nonce, bytes32 raceSalt, bool claimed)
    {
        return (
            _finalizationExecutors[auctionId],
            _finalizationRewards[auctionId],
            _finalizationNonces[auctionId],
            _finalizationSalts[auctionId],
            _finalizationRewardClaimed[auctionId]
        );
    }

    function previewDynamicTimeout() public view returns (uint256) {
        if (address(settlementEngine) == address(0)) {
            return _DEFAULT_DYNAMIC_TIMEOUT;
        }

        return settlementEngine.computeDynamicTimeout(movingAverageBlockDelta);
    }

    function previewFinalizeReward(uint256 auctionId) public view auctionExists(auctionId) returns (uint256) {
        AuctionState state = _auctions[auctionId].state;
        if (_finalizationRewardClaimed[auctionId] || (state != AuctionState.FINALIZED && state != AuctionState.VOIDED)) {
            return 0;
        }

        return _finalizationRewards[auctionId];
    }

    function previewRefund(uint256 auctionId, address claimant)
        public
        view
        auctionExists(auctionId)
        returns (uint256 escrowRefund, uint256 compensation)
    {
        Auction storage auction = _auctions[auctionId];
        uint256 escrowContribution = escrowBalances[auctionId][claimant];

        if (auction.state == AuctionState.FINALIZED) {
            if (claimant == auction.winner) {
                escrowRefund = _computeWinningRefund(escrowContribution, auction.winningAmount);
            } else {
                escrowRefund = escrowContribution;
            }

            return (escrowRefund, 0);
        }

        if (auction.state == AuctionState.CANCELLED || auction.state == AuctionState.VOIDED) {
            escrowRefund = escrowContribution;
            if (escrowContribution != 0 && auction.slashAmount != 0 && slashedPot != address(0)) {
                compensation = ISlashedPot(slashedPot).previewClaim(auctionId, escrowContribution);
            }

            return (escrowRefund, compensation);
        }

        return (0, 0);
    }

    function previewSellerPayout(uint256 auctionId) public view auctionExists(auctionId) returns (uint256) {
        Auction storage auction = _auctions[auctionId];
        uint256 finalizeReward = _finalizationRewards[auctionId];

        if (auction.state == AuctionState.FINALIZED) {
            uint256 grossPayout = _computeSellerPayout(auction.sellerDeposit, auction.winningAmount);
            return finalizeReward >= grossPayout ? 0 : grossPayout - finalizeReward;
        }

        if (auction.state == AuctionState.CANCELLED) {
            return _computeSellerCancellationPayout(auction.sellerDeposit, auction.slashAmount);
        }

        if (auction.state == AuctionState.VOIDED) {
            if (auction.totalEscrow == 0) {
                return finalizeReward >= auction.sellerDeposit ? 0 : auction.sellerDeposit - finalizeReward;
            }

            return 0;
        }

        return 0;
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function _submitResolution(
        uint256 auctionId,
        address winner,
        bytes32 winnerCiphertext,
        uint256 winningAmount,
        bytes calldata avsProof
    ) internal returns (bool) {
        Auction storage auction = _auctions[auctionId];
        PendingResolutionRequest storage request = _resolutionRequests[auctionId];
        if (!request.exists) {
            revert MissingResolutionRequest(auctionId);
        }

        if (address(settlementEngine) == address(0)) {
            revert InvalidAVSProof(auctionId, request.requestId);
        }

        if (winner == address(0)) {
            if (winningAmount != 0) {
                revert WinnerRequiredForWinningAmount(auctionId, winningAmount);
            }
        } else {
            if (winningAmount == 0) {
                revert ZeroWinningAmount(auctionId, winner);
            }
            if (_encryptedBids[auctionId][winner] == bytes32(0)) {
                revert MissingEncryptedBid(auctionId, winner);
            }
            if (!cofheAdapter.lte(winnerCiphertext, escrowBalances[auctionId][winner])) {
                revert BidExceedsEscrow(auctionId, winner);
            }
            if (winningAmount > escrowBalances[auctionId][winner]) {
                revert InvalidWinningAmount(auctionId, winningAmount, escrowBalances[auctionId][winner]);
            }
        }

        if (
            !settlementEngine.verifyResolutionProof(
                address(this),
                auctionId,
                request.requestId,
                winner,
                winnerCiphertext,
                winningAmount,
                avsProof
            )
        ) {
            emit ResolutionRejected(auctionId, request.requestId);
            return false;
        }

        auction.winner = winner;
        auction.winnerCiphertext = winnerCiphertext;
        auction.winningAmount = winningAmount;
        delete _resolutionRequests[auctionId];
        _observeNetwork();

        _transitionState(auctionId, AuctionState.FINALIZED);
        emit ResolutionRecorded(auctionId, winner, winnerCiphertext);
        return true;
    }

    function _prepareResolutionRequest(
        uint256 auctionId,
        Auction storage auction,
        uint256 finalizeNonce,
        bytes32 raceSalt
    )
        internal
        view
        returns (ISettlementEngine.ResolutionRequest memory)
    {
        if (address(settlementEngine) == address(0)) {
            bytes32 requestId = keccak256(
                abi.encode(address(this), block.chainid, auctionId, auction.bidCount, auction.endTime, finalizeNonce, raceSalt)
            );
            return
                ISettlementEngine.ResolutionRequest({
                    requestId: requestId,
                    winnerHandle: keccak256(abi.encode(requestId, "winner")),
                    amountHandle: keccak256(abi.encode(requestId, "amount"))
                });
        }

        return settlementEngine.prepareResolutionRequest(
            address(this),
            auctionId,
            auction.bidCount,
            auction.endTime,
            finalizeNonce,
            raceSalt
        );
    }

    function _observeNetwork() internal {
        uint64 currentTimestamp = uint64(block.timestamp);
        if (lastObservationTimestamp == 0) {
            lastObservationTimestamp = currentTimestamp;
            return;
        }

        uint64 delta = currentTimestamp - lastObservationTimestamp;
        if (delta == 0) {
            return;
        }
        if (delta > _NETWORK_SAMPLE_CEILING) {
            lastObservationTimestamp = currentTimestamp;
            return;
        }

        if (movingAverageBlockDelta == 0) {
            movingAverageBlockDelta = delta;
        } else {
            movingAverageBlockDelta = uint64((uint256(movingAverageBlockDelta) * 7 + delta) / 8);
        }

        lastObservationTimestamp = currentTimestamp;
    }

    function _registerSlash(uint256 auctionId, uint256 totalEscrow, uint256 slashAmount) internal {
        if (slashAmount == 0) {
            return;
        }
        if (slashedPot == address(0)) {
            revert SlashedPotNotConfigured();
        }

        ISlashedPot(slashedPot).registerSlash{value: slashAmount}(auctionId, totalEscrow);
    }

    function _computeWinningRefund(uint256 escrowContribution, uint256 winningAmount) internal view returns (uint256) {
        if (address(settlementEngine) == address(0)) {
            return winningAmount >= escrowContribution ? 0 : escrowContribution - winningAmount;
        }

        return settlementEngine.computeWinningRefund(escrowContribution, winningAmount);
    }

    function _computeSellerPayout(uint256 sellerDeposit, uint256 winningAmount) internal view returns (uint256) {
        if (address(settlementEngine) == address(0)) {
            return sellerDeposit + winningAmount;
        }

        return settlementEngine.computeSellerPayout(sellerDeposit, winningAmount);
    }

    function _computeSellerCancellationPayout(uint256 sellerDeposit, uint256 slashAmount) internal view returns (uint256) {
        if (address(settlementEngine) == address(0)) {
            return slashAmount >= sellerDeposit ? 0 : sellerDeposit - slashAmount;
        }

        return settlementEngine.computeSellerCancellationPayout(sellerDeposit, slashAmount);
    }

    function _computeCancellationSlash(Auction storage auction) internal view returns (uint256) {
        if (auction.totalEscrow == 0) {
            return 0;
        }
        if (address(settlementEngine) == address(0)) {
            return auction.sellerDeposit / 2;
        }

        uint256 elapsed = block.timestamp - auction.createdAt;
        uint256 duration = uint256(auction.endTime) - auction.createdAt;

        return settlementEngine.computeCancellationSlash(auction.sellerDeposit, elapsed, duration, auction.totalEscrow);
    }

    function _computeFinalizeReward(uint256 sellerDeposit) internal pure returns (uint256) {
        if (sellerDeposit == 0) {
            return 0;
        }

        return (sellerDeposit * _KEEPER_FINALIZE_REWARD_BPS) / _BPS_DENOMINATOR;
    }

    function _deriveFinalizationSalt(uint256 auctionId, uint256 finalizeNonce) internal view returns (bytes32) {
        bytes32 priorBlockhash = blockhash(block.number - 1);
        if (priorBlockhash != bytes32(0)) {
            return priorBlockhash;
        }

        return keccak256(abi.encode(address(this), block.chainid, auctionId, finalizeNonce, msg.sender, block.timestamp));
    }

    function _sendValue(address payable recipient, uint256 amount) internal {
        (bool success,) = recipient.call{value: amount}("");
        if (!success) {
            revert NativeTransferFailed(recipient, amount);
        }
    }

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
