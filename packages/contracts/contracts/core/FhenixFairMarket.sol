// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

import "../adapters/NFTGuard.sol";
import "../interfaces/ICofheAdapter.sol";
import "../interfaces/IShieldedEscrowVault.sol";
import "../interfaces/IShieldedIdentityRegistry.sol";
import "../interfaces/IShieldedRefundSource.sol";
import "../interfaces/ISettlementEngine.sol";
import "../interfaces/ISlashedPot.sol";

contract FhenixFairMarket is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    IERC721Receiver,
    IShieldedRefundSource
{
    using Address for address payable;

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
        uint256 startingPrice;
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
    error LegacyWitnessClaimsDisabled();
    error BidBelowStartingPrice(uint256 auctionId, address bidder, uint256 requiredMinimum);
    error BidExceedsEscrow(uint256 auctionId, address bidder);
    error FinalizeRewardAlreadyClaimed(uint256 auctionId);
    error FinalizeRewardNotReady(uint256 auctionId, AuctionState currentState);
    error FallbackThresholdNotReached(uint256 elapsed, uint256 requiredThreshold);
    error InvalidWinningAmount(uint256 auctionId, uint256 winningAmount, uint256 availableEscrow);
    error InvalidAVSProof(uint256 auctionId, bytes32 requestId);
    error InvalidDependency(address dependency);
    error InvalidStartingPrice(uint256 providedStartingPrice);
    error MissingEncryptedBid(uint256 auctionId, address bidder);
    error MissingShieldedEncryptedBid(uint256 auctionId, bytes32 commitmentHash);
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
    error ResolutionAlreadyRequested(uint256 auctionId, bytes32 requestId);
    error UnauthorizedShieldedRefundSource(address caller, address expectedVault);
    error ShieldedEscrowVaultNotConfigured();
    error ShieldedIdentityRegistryNotConfigured();
    error InvalidCommitmentHash();
    error InvalidIdentityHash();
    error UnexpectedShieldedWinningCiphertext(uint256 auctionId, bytes32 expectedCiphertext, bytes32 providedCiphertext);
    error ShieldedRefundAlreadyClaimed(uint256 auctionId, bytes32 nullifierHash);
    error ShieldedRefundsNotReady(uint256 auctionId, AuctionState currentState);
    error WinnerRequiredForWinningAmount(uint256 auctionId, uint256 winningAmount);
    error WinningAmountBelowStartingPrice(uint256 auctionId, uint256 winningAmount, uint256 requiredMinimum);
    error UnauthorizedShieldedIdentityClaim(uint256 auctionId, bytes32 providedIdentityHash, bytes32 expectedIdentityHash);
    error UnauthorizedShieldedAssetClaim(uint256 auctionId, bytes32 providedCommitmentHash, bytes32 expectedCommitmentHash);
    error ShieldedWinnerMustClaimPrivately(uint256 auctionId);
    error ZeroWinningAmount(uint256 auctionId, address winner);
    error ZeroAddress();
    error ZeroValue();

    uint256 public constant MIN_AUCTION_DURATION = 1 minutes;
    uint256 public constant MAX_AUCTION_DURATION = 90 days;
    uint256 private constant _BPS_DENOMINATOR = 10_000;
    uint256 private constant _DEFAULT_DYNAMIC_TIMEOUT = 30 minutes;
    uint256 private constant _KEEPER_FINALIZE_REWARD_BPS = 20;
    uint256 private constant _MAX_CONFIDENTIAL_BID_VALUE = type(uint96).max;
    uint256 private constant _NETWORK_SAMPLE_CEILING = 10 minutes;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    mapping(uint256 => Auction) private _auctions;
    mapping(uint256 => mapping(address => uint256)) public escrowBalances;
    mapping(uint256 => mapping(address => bool)) public hasWithdrawn;
    mapping(uint256 => mapping(address => bytes32)) private _encryptedBids;

    uint256 public auctionCounter;
    uint256 private _reentrancyStatus;
    /// @custom:security non-reentrant
    ISlashedPot public slashedPot;
    ICofheAdapter public cofheAdapter;
    /// @custom:security non-reentrant
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
    // Privacy Phase 1 storage must stay append-only after the Phase 4 layout.
    IShieldedEscrowVault public shieldedEscrowVault;
    mapping(uint256 => bool) public shieldedRefundsUnlocked;
    mapping(uint256 => mapping(bytes32 => bool)) private _shieldedRefundClaimed;
    // Privacy Phase 2 storage must stay append-only after Privacy Phase 1.
    mapping(uint256 => mapping(bytes32 => bytes32)) private _shieldedEncryptedBids;
    mapping(uint256 => mapping(bytes32 => bool)) private _knownShieldedCommitments;
    mapping(uint256 => bytes32[]) private _shieldedCommitments;
    mapping(uint256 => bytes32) private _winningCommitments;
    IShieldedIdentityRegistry public shieldedIdentityRegistry;

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
    event ShieldedEscrowLocked(uint256 indexed auctionId, bytes32 indexed commitmentHash, uint256 amount);
    event ShieldedBidPlaced(uint256 indexed auctionId, bytes32 indexed commitmentHash, bytes32 bidHandle);
    event ShieldedRefundPathOpened(uint256 indexed auctionId);
    event ShieldedRefundSettled(
        uint256 indexed auctionId,
        bytes32 indexed nullifierHash,
        address indexed recipient,
        uint256 escrowContribution,
        uint256 compensation
    );
    event ResolutionRecorded(uint256 indexed auctionId, address indexed winner, bytes32 winnerCiphertext);
    event ResolutionRejected(uint256 indexed auctionId, bytes32 indexed requestId);
    event RefundClaimed(uint256 indexed auctionId, address indexed claimant, uint256 escrowRefund, uint256 compensation);
    event SellerProceedsClaimed(uint256 indexed auctionId, address indexed seller, uint256 amount);
    event AssetClaimed(uint256 indexed auctionId, address indexed recipient, uint256 tokenId);
    event CofheAdapterUpdated(address indexed previousAdapter, address indexed nextAdapter);
    event ShieldedEscrowVaultUpdated(address indexed previousVault, address indexed nextVault);
    event ShieldedIdentityRegistryUpdated(address indexed previousRegistry, address indexed nextRegistry);
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
        if (initialOwner == address(0)) {
            revert ZeroAddress();
        }
        _requireDependency(address(adapter));
        _requireDependency(initialSlashedPot);

        __Ownable_init(initialOwner);

        cofheAdapter = adapter;
        slashedPot = ISlashedPot(initialSlashedPot);
        _reentrancyStatus = _NOT_ENTERED;
    }

    function contractVersion() public pure virtual returns (string memory) {
        return "phase4-privacy4";
    }

    receive() external payable {}

    function setSettlementEngine(ISettlementEngine newSettlementEngine) external onlyOwner {
        _requireDependency(address(newSettlementEngine));

        settlementEngine = newSettlementEngine;
        emit SettlementDependenciesUpdated(address(newSettlementEngine), address(slashedPot));
    }

    function setSlashedPot(ISlashedPot newSlashedPot) external onlyOwner {
        _requireDependency(address(newSlashedPot));

        slashedPot = newSlashedPot;
        emit SettlementDependenciesUpdated(address(settlementEngine), address(newSlashedPot));
    }

    function setCofheAdapter(ICofheAdapter newAdapter) external onlyOwner {
        _requireDependency(address(newAdapter));

        address previousAdapter = address(cofheAdapter);
        cofheAdapter = newAdapter;

        emit CofheAdapterUpdated(previousAdapter, address(newAdapter));
    }

    function setShieldedEscrowVault(IShieldedEscrowVault newVault) external onlyOwner {
        _requireDependency(address(newVault));

        address previousVault = address(shieldedEscrowVault);
        shieldedEscrowVault = newVault;

        emit ShieldedEscrowVaultUpdated(previousVault, address(newVault));
    }

    function setShieldedIdentityRegistry(IShieldedIdentityRegistry newRegistry) external onlyOwner {
        _requireDependency(address(newRegistry));

        address previousRegistry = address(shieldedIdentityRegistry);
        shieldedIdentityRegistry = newRegistry;

        emit ShieldedIdentityRegistryUpdated(previousRegistry, address(newRegistry));
    }

    function createAuction(
        address nftContract,
        uint256 tokenId,
        uint256 duration,
        uint256 sellerDeposit,
        bool isVickrey
    ) external payable nonReentrant returns (uint256 auctionId) {
        return _createAuction(nftContract, tokenId, duration, 0, sellerDeposit, isVickrey);
    }

    function createAuction(
        address nftContract,
        uint256 tokenId,
        uint256 duration,
        uint256 startingPrice,
        uint256 sellerDeposit,
        bool isVickrey
    ) external payable nonReentrant returns (uint256 auctionId) {
        return _createAuction(nftContract, tokenId, duration, startingPrice, sellerDeposit, isVickrey);
    }

    function _createAuction(
        address nftContract,
        uint256 tokenId,
        uint256 duration,
        uint256 startingPrice,
        uint256 sellerDeposit,
        bool isVickrey
    ) internal returns (uint256 auctionId) {
        if (nftContract == address(0)) {
            revert ZeroAddress();
        }
        if (duration < MIN_AUCTION_DURATION || duration > MAX_AUCTION_DURATION) {
            revert InvalidDuration(duration);
        }
        if (startingPrice > _MAX_CONFIDENTIAL_BID_VALUE) {
            revert InvalidStartingPrice(startingPrice);
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
        auction.startingPrice = startingPrice;

        _observeNetwork();
        _transitionState(auctionId, AuctionState.ACTIVE);
        NFTGuard.lockIntoEscrow(nftContract, msg.sender, address(this), tokenId);

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

    function lockShieldedEscrow(uint256 auctionId, bytes32 identityHash, bytes32 commitmentHash, address claimAuthority)
        external
        payable
        nonReentrant
        auctionExists(auctionId)
        onlyAuctionState(auctionId, AuctionState.ACTIVE)
    {
        if (msg.value == 0) {
            revert ZeroValue();
        }
        if (identityHash == bytes32(0)) {
            revert InvalidIdentityHash();
        }
        if (commitmentHash == bytes32(0)) {
            revert InvalidCommitmentHash();
        }
        if (block.timestamp >= _auctions[auctionId].endTime) {
            revert AuctionAlreadyEnded(auctionId, _auctions[auctionId].endTime);
        }
        if (address(shieldedEscrowVault).code.length < 1) {
            revert ShieldedEscrowVaultNotConfigured();
        }
        if (address(shieldedIdentityRegistry).code.length < 1) {
            revert ShieldedIdentityRegistryNotConfigured();
        }

        _auctions[auctionId].lastBlockTimestamp = uint64(block.timestamp);
        _observeNetwork();
        shieldedIdentityRegistry.bindIdentity(auctionId, identityHash, commitmentHash);
        shieldedEscrowVault.lockEscrow{value: msg.value}(auctionId, commitmentHash, claimAuthority);

        emit ShieldedEscrowLocked(auctionId, commitmentHash, msg.value);
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
        if (auction.startingPrice != 0 && !cofheAdapter.gt(encryptedBid, auction.startingPrice - 1)) {
            revert BidBelowStartingPrice(auctionId, msg.sender, auction.startingPrice);
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

    function placeShieldedBid(
        uint256 auctionId,
        bytes32 commitmentHash,
        bytes32 encryptedBid,
        uint256 coverageDeadline,
        bytes calldata coverageProof
    )
        external
        nonReentrant
        auctionExists(auctionId)
        onlyAuctionState(auctionId, AuctionState.ACTIVE)
    {
        Auction storage auction = _auctions[auctionId];
        if (block.timestamp >= auction.endTime) {
            revert AuctionAlreadyEnded(auctionId, auction.endTime);
        }
        if (commitmentHash == bytes32(0)) {
            revert InvalidCommitmentHash();
        }
        if (address(shieldedEscrowVault).code.length < 1) {
            revert ShieldedEscrowVaultNotConfigured();
        }

        (uint256 commitmentAuctionId, bool refundUnlocked, bool claimed) =
            shieldedEscrowVault.commitmentState(commitmentHash);
        if (commitmentAuctionId != auctionId || claimed) {
            revert MissingShieldedEncryptedBid(auctionId, commitmentHash);
        }
        if (refundUnlocked) {
            revert AuctionAlreadyEnded(auctionId, auction.endTime);
        }
        if (auction.startingPrice != 0 && !cofheAdapter.gt(encryptedBid, auction.startingPrice - 1)) {
            revert BidBelowStartingPrice(auctionId, msg.sender, auction.startingPrice);
        }
        shieldedEscrowVault.verifyBidCoverageProof(commitmentHash, encryptedBid, coverageDeadline, coverageProof);

        if (_shieldedEncryptedBids[auctionId][commitmentHash] == bytes32(0)) {
            auction.bidCount += 1;
        }
        if (!_knownShieldedCommitments[auctionId][commitmentHash]) {
            _knownShieldedCommitments[auctionId][commitmentHash] = true;
            _shieldedCommitments[auctionId].push(commitmentHash);
        }

        _shieldedEncryptedBids[auctionId][commitmentHash] = encryptedBid;
        auction.lastBlockTimestamp = uint64(block.timestamp);
        _observeNetwork();

        emit ShieldedBidPlaced(auctionId, commitmentHash, encryptedBid);
    }

    function triggerFinalize(uint256 auctionId)
        external
        nonReentrant
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
        address winner,
        bytes32 winnerCiphertext,
        uint256 winningAmount,
        bytes calldata avsProof
    ) external nonReentrant auctionExists(auctionId) onlyAuctionState(auctionId, AuctionState.RESOLVING) returns (bool) {
        return _submitResolution(auctionId, winner, winnerCiphertext, winningAmount, avsProof);
    }

    function submitShieldedResolution(
        uint256 auctionId,
        bytes32 winnerIdentityHash,
        bytes32 winnerCiphertext,
        uint256 winningAmount,
        bytes calldata avsProof
    ) external nonReentrant auctionExists(auctionId) onlyAuctionState(auctionId, AuctionState.RESOLVING) returns (bool) {
        return _submitShieldedResolution(auctionId, winnerIdentityHash, winnerCiphertext, winningAmount, avsProof);
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
        auction.slashAmount = _computeCancellationSlash(auctionId, auction);
        _observeNetwork();
        _transitionState(auctionId, AuctionState.CANCELLED);
        _registerSlash(auctionId, auction.totalEscrow, auction.slashAmount);
        _openShieldedRefundPath(auctionId);

        NFTGuard.releaseFromEscrow(auction.nftContract, address(this), auction.seller, auction.tokenId);
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
        uint256 totalEscrowIncludingShielded = _totalEscrowIncludingShielded(auctionId, auction);

        if (elapsed < timeoutWindow) {
            revert FallbackThresholdNotReached(elapsed, timeoutWindow);
        }

        uint256 finalizeReward = _finalizationRewards[auctionId];
        auction.slashAmount = totalEscrowIncludingShielded == 0
            ? 0
            : (finalizeReward >= auction.sellerDeposit ? 0 : auction.sellerDeposit - finalizeReward);
        _observeNetwork();
        delete _resolutionRequests[auctionId];
        _transitionState(auctionId, AuctionState.VOIDED);
        _registerSlash(auctionId, auction.totalEscrow, auction.slashAmount);
        _openShieldedRefundPath(auctionId);

        NFTGuard.releaseFromEscrow(auction.nftContract, address(this), auction.seller, auction.tokenId);

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
            compensation = slashedPot.claimFor(auctionId, msg.sender, escrowRefund);
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
        if (_winningCommitments[auctionId] != bytes32(0)) {
            revert ShieldedWinnerMustClaimPrivately(auctionId);
        }

        address expectedRecipient = auction.winner == address(0) ? auction.seller : auction.winner;
        if (msg.sender != expectedRecipient) {
            revert UnauthorizedAssetClaim(auctionId, msg.sender, expectedRecipient);
        }

        auction.assetClaimed = true;
        NFTGuard.releaseFromEscrow(auction.nftContract, address(this), expectedRecipient, auction.tokenId);

        emit AssetClaimed(auctionId, expectedRecipient, auction.tokenId);
    }

    function claimShieldedAsset(uint256 auctionId, bytes32 secret, bytes32 nullifier, address recipient)
        external
        pure
    {
        (auctionId, secret, nullifier, recipient);
        revert LegacyWitnessClaimsDisabled();
    }

    function claimShieldedAssetWithAuthorization(
        uint256 auctionId,
        bytes32 winnerIdentityHash,
        address recipient,
        uint256 deadline,
        bytes calldata signature
    ) external nonReentrant auctionExists(auctionId) onlyAuctionState(auctionId, AuctionState.FINALIZED) {
        Auction storage auction = _auctions[auctionId];
        if (auction.assetClaimed) {
            revert AssetAlreadyClaimed(auctionId);
        }
        if (recipient == address(0)) {
            revert ZeroAddress();
        }
        if (address(shieldedEscrowVault).code.length < 1) {
            revert ShieldedEscrowVaultNotConfigured();
        }

        bytes32 expectedIdentityHash = _winningCommitments[auctionId];
        if (expectedIdentityHash == bytes32(0) || winnerIdentityHash != expectedIdentityHash) {
            revert UnauthorizedShieldedIdentityClaim(auctionId, winnerIdentityHash, expectedIdentityHash);
        }

        auction.assetClaimed = true;
        bytes32 commitmentHash = _resolveShieldedCommitment(auctionId, winnerIdentityHash);
        bytes32 authorizationDigest =
            shieldedEscrowVault.authorizeAssetClaim(auctionId, commitmentHash, recipient, deadline, signature);
        (authorizationDigest);
        NFTGuard.releaseFromEscrow(auction.nftContract, address(this), recipient, auction.tokenId);

        emit AssetClaimed(auctionId, recipient, auction.tokenId);
    }

    function settleShieldedRefund(uint256 auctionId, bytes32 nullifierHash, address recipient, uint256 escrowContribution)
        external
        override
        nonReentrant
        auctionExists(auctionId)
        returns (uint256 compensation)
    {
        if (msg.sender != address(shieldedEscrowVault)) {
            revert UnauthorizedShieldedRefundSource(msg.sender, address(shieldedEscrowVault));
        }
        if (_shieldedRefundClaimed[auctionId][nullifierHash]) {
            revert ShieldedRefundAlreadyClaimed(auctionId, nullifierHash);
        }

        Auction storage auction = _auctions[auctionId];
        if (auction.state != AuctionState.CANCELLED && auction.state != AuctionState.VOIDED && auction.state != AuctionState.FINALIZED) {
            revert ShieldedRefundsNotReady(auctionId, auction.state);
        }
        if (!shieldedRefundsUnlocked[auctionId]) {
            revert ShieldedRefundsNotReady(auctionId, auction.state);
        }

        _shieldedRefundClaimed[auctionId][nullifierHash] = true;
        emit ShieldedRefundSettled(auctionId, nullifierHash, recipient, escrowContribution, compensation);
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

    function getAuctionStartingPrice(uint256 auctionId) external view auctionExists(auctionId) returns (uint256) {
        return _auctions[auctionId].startingPrice;
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

    function getShieldedEncryptedBid(uint256 auctionId, bytes32 commitmentHash)
        external
        view
        auctionExists(auctionId)
        returns (bytes32)
    {
        return _shieldedEncryptedBids[auctionId][commitmentHash];
    }

    function getShieldedCommitments(uint256 auctionId)
        external
        view
        auctionExists(auctionId)
        returns (bytes32[] memory)
    {
        return _shieldedCommitments[auctionId];
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
            if (escrowContribution != 0 && auction.slashAmount != 0 && address(slashedPot) != address(0)) {
                compensation = slashedPot.previewClaim(auctionId, escrowContribution);
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
            if (auction.slashAmount != 0 || _totalEscrowIncludingShielded(auctionId, auction) != 0) {
                return 0;
            }

            return finalizeReward >= auction.sellerDeposit ? 0 : auction.sellerDeposit - finalizeReward;
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
            if (winningAmount < auction.startingPrice) {
                revert WinningAmountBelowStartingPrice(auctionId, winningAmount, auction.startingPrice);
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
        _openShieldedRefundPath(auctionId);
        emit ResolutionRecorded(auctionId, winner, winnerCiphertext);
        return true;
    }

    function _submitShieldedResolution(
        uint256 auctionId,
        bytes32 winnerIdentityHash,
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
        bytes32 winnerCommitmentHash =
            _validateShieldedResolutionBid(auctionId, winnerIdentityHash, winnerCiphertext, winningAmount, auction.startingPrice);

        if (
            !settlementEngine.verifyShieldedResolutionProof(
                address(this),
                auctionId,
                request.requestId,
                winnerIdentityHash,
                winnerCiphertext,
                winningAmount,
                avsProof
            )
        ) {
            emit ResolutionRejected(auctionId, request.requestId);
            return false;
        }

        auction.winner = address(0);
        auction.winnerCiphertext = winnerCiphertext;
        auction.winningAmount = winningAmount;
        _winningCommitments[auctionId] = winnerIdentityHash;
        delete _resolutionRequests[auctionId];
        _transitionState(auctionId, AuctionState.FINALIZED);
        _observeNetwork();

        uint256 remainingRefund =
            shieldedEscrowVault.settleWinningCommitment(auctionId, winnerCommitmentHash, winningAmount);
        (remainingRefund);

        _openShieldedRefundPath(auctionId);
        shieldedIdentityRegistry.markWinningIdentity(auctionId, winnerIdentityHash);
        emit ResolutionRecorded(auctionId, address(0), winnerCiphertext);
        return true;
    }

    function _validateShieldedResolutionBid(
        uint256 auctionId,
        bytes32 winnerIdentityHash,
        bytes32 winnerCiphertext,
        uint256 winningAmount,
        uint256 startingPrice
    ) internal view returns (bytes32 winnerCommitmentHash) {
        if (winnerIdentityHash == bytes32(0)) {
            revert InvalidIdentityHash();
        }
        if (winningAmount == 0) {
            revert ZeroWinningAmount(auctionId, address(0));
        }
        if (winningAmount < startingPrice) {
            revert WinningAmountBelowStartingPrice(auctionId, winningAmount, startingPrice);
        }
        winnerCommitmentHash = _resolveShieldedCommitment(auctionId, winnerIdentityHash);
        bytes32 storedBid = _shieldedEncryptedBids[auctionId][winnerCommitmentHash];
        if (storedBid == bytes32(0)) {
            revert MissingShieldedEncryptedBid(auctionId, winnerCommitmentHash);
        }
        if (storedBid != winnerCiphertext) {
            revert UnexpectedShieldedWinningCiphertext(auctionId, storedBid, winnerCiphertext);
        }
        if (address(shieldedEscrowVault).code.length < 1) {
            revert ShieldedEscrowVaultNotConfigured();
        }

        (uint256 commitmentAuctionId, bool refundUnlocked, bool claimed) =
            shieldedEscrowVault.commitmentState(winnerCommitmentHash);
        (refundUnlocked);
        if (commitmentAuctionId != auctionId || claimed) {
            revert MissingShieldedEncryptedBid(auctionId, winnerCommitmentHash);
        }
    }

    function _resolveShieldedCommitment(uint256 auctionId, bytes32 identityHash) internal view returns (bytes32 commitmentHash) {
        if (identityHash == bytes32(0)) {
            revert InvalidIdentityHash();
        }
        if (address(shieldedIdentityRegistry).code.length < 1) {
            revert ShieldedIdentityRegistryNotConfigured();
        }

        commitmentHash = shieldedIdentityRegistry.commitmentForIdentity(auctionId, identityHash);
        if (commitmentHash == bytes32(0)) {
            revert MissingShieldedEncryptedBid(auctionId, identityHash);
        }
    }

    function _openShieldedRefundPath(uint256 auctionId) internal {
        if (shieldedRefundsUnlocked[auctionId]) {
            return;
        }
        if (address(shieldedEscrowVault).code.length < 1) {
            return;
        }

        shieldedRefundsUnlocked[auctionId] = true;
        shieldedEscrowVault.unlockRefunds(auctionId);
        emit ShieldedRefundPathOpened(auctionId);
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
        if (lastObservationTimestamp < 1) {
            lastObservationTimestamp = currentTimestamp;
            return;
        }

        uint64 delta = currentTimestamp - lastObservationTimestamp;
        if (delta < 1) {
            return;
        }
        if (delta > _NETWORK_SAMPLE_CEILING) {
            lastObservationTimestamp = currentTimestamp;
            return;
        }

        if (movingAverageBlockDelta < 1) {
            movingAverageBlockDelta = delta;
        } else {
            movingAverageBlockDelta = uint64((uint256(movingAverageBlockDelta) * 7 + delta) / 8);
        }

        lastObservationTimestamp = currentTimestamp;
    }

    function _registerSlash(uint256 auctionId, uint256 totalEscrow, uint256 slashAmount) internal {
        if (slashAmount < 1) {
            return;
        }
        uint256 publicSlashAllocation = slashAmount;
        if (address(shieldedEscrowVault).code.length > 0) {
            publicSlashAllocation = shieldedEscrowVault.allocateSlash{value: slashAmount}(auctionId, totalEscrow);
        }
        if (publicSlashAllocation < 1) {
            return;
        }
        if (address(slashedPot).code.length < 1) {
            revert SlashedPotNotConfigured();
        }

        // slither-disable-next-line arbitrary-send-eth
        slashedPot.registerSlash{value: publicSlashAllocation}(auctionId, totalEscrow);
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

    function _computeCancellationSlash(uint256 auctionId, Auction storage auction) internal view returns (uint256) {
        uint256 totalEscrowIncludingShielded = _totalEscrowIncludingShielded(auctionId, auction);
        if (totalEscrowIncludingShielded == 0) {
            return 0;
        }
        if (address(settlementEngine) == address(0)) {
            return auction.sellerDeposit / 2;
        }

        uint256 elapsed = block.timestamp - auction.createdAt;
        uint256 duration = uint256(auction.endTime) - auction.createdAt;

        return
            settlementEngine.computeCancellationSlash(
                auction.sellerDeposit,
                elapsed,
                duration,
                totalEscrowIncludingShielded
            );
    }

    function _totalEscrowIncludingShielded(uint256 auctionId, Auction storage auction) internal view returns (uint256) {
        return auction.totalEscrow + _shieldedEscrowTotal(auctionId);
    }

    function _shieldedEscrowTotal(uint256 auctionId) internal view returns (uint256) {
        if (address(shieldedEscrowVault).code.length < 1) {
            return 0;
        }

        return shieldedEscrowVault.totalEscrowForAuction(auctionId);
    }

    function _computeFinalizeReward(uint256 sellerDeposit) internal pure returns (uint256) {
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
        recipient.sendValue(amount);
    }

    function _requireDependency(address dependency) internal view {
        if (dependency == address(0)) {
            revert ZeroAddress();
        }
        if (dependency.code.length == 0) {
            revert InvalidDependency(dependency);
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
