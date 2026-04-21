// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {LeaderboardLib} from "./libs/LeaderboardLib.sol";
import {NodePoolLib} from "./libs/NodePoolLib.sol";
import {PoolSettleLib} from "./libs/PoolSettleLib.sol";

interface IERC20Burnable is IERC20 {
    function burn(uint256 amount) external;
}

interface ISwapPoolManager {
    function withdrawLightForRewards(uint256 amount) external;
}

contract IncubatorCore is OwnableUpgradeable, PausableUpgradeable, ReentrancyGuard, UUPSUpgradeable {
    using SafeERC20 for IERC20;

    enum Role {
        None,
        Node,
        SuperNode
    }

    enum PoolType {
        Liquidity,
        Referral,
        SuperNode,
        Node,
        Platform,
        Leaderboard
    }

    struct MachineOrder {
        uint256 id;
        address user;
        uint256 quantity;
        uint256 amountUSDT;
        address referrer;
        uint256 createdAt;
    }

    struct OrderRewardLedger {
        uint256 capAmount;
        uint256 staticPaid;
        uint256 dynamicPaid;
        bool exited;
    }

    struct PoolConfig {
        address recipient;
        uint16 bps;
    }

    struct IdentityAccount {
        uint256 id;
        address owner;
        Role role;
        uint256 updatedAt;
    }

    // LeaderboardState lives in LeaderboardLib (identical layout).
    IERC20 public usdt;

    uint16 public constant BPS_DENOMINATOR = 10_000;
    uint16 public constant LEADERBOARD_TOP_SHARE_BPS = 7_500;
    uint16 public constant LEADERBOARD_LAST_SHARE_BPS = 2_500;
    uint256 public machineUnitPrice;
    uint256 public constant MAX_MACHINE_PER_ORDER = 10;
    uint256 public constant MAX_MACHINE_PER_ADDRESS = 100;
    uint256 public constant MAX_PURCHASE_RESIDUAL_RECIPIENTS = 20;

    uint256 public nodePrice;
    uint256 public superNodePrice;

    uint256 public nextIdentityId;
    address public identityMarket;
    mapping(uint256 => IdentityAccount) private identities;
    mapping(address => uint256) private ownedIdentityId;
    mapping(uint256 => mapping(address => bool)) private identityOperatorApproval;

    mapping(uint256 => MachineOrder) public machineOrders;
    mapping(address => uint256[]) public userOrderIds;
    PoolConfig[6] private poolConfigs;
    uint256 public nextMachineOrderId;

    mapping(address => address) public referralOf;
    mapping(address => uint256) public personalPower;
    mapping(address => uint256) public rewardWeight;

    // Team Stats
    mapping(address => uint256) public directReferralCount;
    mapping(address => uint256) public teamTotalMemberCount;
    mapping(address => uint256) public directReferralVolume;
    mapping(address => uint256) public teamTotalVolume;

    // --- original layout boundary (slot 25) ---
    address[] public rewardParticipants;
    mapping(address => bool) public isRewardParticipant;

    mapping(uint256 => LeaderboardLib.LeaderboardState) private leaderboards;
    mapping(uint256 => mapping(address => uint256)) public dailyVolume;

    uint16[10] private rankShares;

    // Internal pool accumulation: when poolConfig recipient == address(this),
    // USDT stays in the contract and is tracked here for later settlement.
    mapping(uint8 => uint256) public poolAccumulated;

    // Stored USDT decimals for price scaling. Value 0 means legacy default (6).
    uint8 public usdtTokenDecimals;
    bool public usdtScaleMigrated;

    // Sub-admin access control (stored on-chain). Keep newly added storage at the end.
    mapping(address => bool) public subAdmins;
    address[] public subAdminList;
    mapping(address => uint256) private subAdminIndexPlusOne;

    // === NEW VARIABLES (appended after slot 34) ===

    // Daily release and reward settlement config.
    uint16 public releaseDailyBps;
    uint16 public releaseImmediateBurnBps;
    uint16 public releaseSecondaryBurnBps;
    uint16 public releaseStaticBps;
    uint16 public releaseDynamicBps;
    uint16 public rewardCapBps;
    uint256 public rewardPoolBalance;
    uint256 public lastRewardSettlementDay;
    address public rewardBurnAddress;
    mapping(uint256 => OrderRewardLedger) public orderRewardLedger;

    // Direct referral count for dynamic reward ratio (nodes and super-nodes)
    mapping(address => uint256) public directNodeReferralCount;
    mapping(address => uint256) public directSuperNodeReferralCount;

    uint8 public leaderboardWhitelistAdjustPct;
    address[] public leaderboardWhitelist;
    mapping(address => uint256) private leaderboardWhitelistIndexPlusOne;
    mapping(uint256 => mapping(address => uint256)) private dailyFirstOrderSeq;
    mapping(uint256 => uint256) private dailyOrderSeq;

    // === LIGHT reward system (appended after dailyOrderSeq) ===
    IERC20 public lightToken;
    address public swapPoolManager;
    uint256 private _transientLightPrice;

    // === Settlement cycle config (appended after _transientLightPrice) ===
    uint256 public cycleDuration;  // seconds per cycle; 0 means default 1 day

    // Manager access control (appended at storage tail for upgrade safety).
    mapping(address => bool) private managers;

    // === On-chain settlement for Node / SuperNode / Leaderboard pools ===
    // Role lists maintained on identity purchase / upgrade / OTC transfer.
    address[] public nodeList;
    address[] public superNodeList;
    mapping(address => uint256) private nodeIndexPlusOne;
    mapping(address => uint256) private superNodeIndexPlusOne;

    // Daily idempotency locks for on-chain pool settlement.
    uint256 public lastNodePoolSettleDay;
    uint256 public lastSuperNodePoolSettleDay;
    mapping(uint256 => bool) public leaderboardSettledDay;

    // Minimum pool balance required to run a settlement (dust protection).
    uint256 public minPoolSettleAmount;

    // When true, settle*OnChain functions are callable by any address.
    // Otherwise only owner/sub-admin/manager may trigger.
    bool public publicSettleEnabled;

    // One-time flag for bootstrap migration of pre-existing identities.
    bool public roleListsBootstrapped;

    // Purchase residual recipients. When unset, residuals fall back to the platform recipient.
    address[] private nodePurchaseResidualRecipients;
    address[] private superNodePurchaseResidualRecipients;

    event NodePoolSettledOnChain(uint256 indexed dayId, uint256 poolBalance, uint256 totalWeight, uint256 participantCount);
    event SuperNodePoolSettledOnChain(uint256 indexed dayId, uint256 poolBalance, uint256 totalWeight, uint256 participantCount);
    event LeaderboardPoolSettledOnChain(uint256 indexed dayId, uint256 poolBalance);
    event RoleListUpdated(address indexed account, uint8 indexed role, bool added);
    event SettlementConfigUpdated(uint256 minPoolSettleAmount, bool publicSettleEnabled);
    event PurchaseResidualRecipientsUpdated(bool indexed isNodePurchase, address[] recipients);
    event IdentityPurchaseResidualAllocated(
        uint256 indexed trackingId,
        bool indexed isNodePurchase,
        address indexed recipient,
        uint256 amountUSDT
    );

    event MachinePurchased(
        address indexed user,
        uint256 indexed orderId,
        uint256 quantity,
        uint256 amountUSDT,
        address indexed referrer
    );

    event NodePurchased(address indexed user, uint256 amountUSDT, uint256 indexed identityId);
    event SuperNodePurchased(
        address indexed user,
        uint256 amountUSDT,
        uint256 indexed identityId
    );
    event IdentityMarketUpdated(address indexed market);
    event IdentityOperatorApproved(uint256 indexed identityId, address indexed operator, bool approved);
    event IdentityTransferred(uint256 indexed identityId, address indexed from, address indexed to, uint8 role);
    event PriceUpdated(string indexed target, uint256 oldPrice, uint256 newPrice);
    event PoolConfigUpdated(uint8 indexed poolType, address indexed recipient, uint16 bps);
    event PoolAllocated(
        uint256 indexed orderId,
        uint8 indexed poolType,
        address indexed recipient,
        address token,
        uint256 amountUSDT
    );
    event RewardSettled(
        uint256 indexed orderId,
        uint8 indexed poolType,
        address indexed beneficiary,
        uint256 amountUSDT
    );
    event ReferralBound(address indexed user, address indexed referrer);
    event RewardWeightUpdated(address indexed account, uint256 weight);
    event LeaderboardUpdated(uint256 indexed dayId, address indexed user, uint256 totalVolume);
    event LeaderboardSettled(uint256 indexed dayId, address indexed user, uint8 rank, uint256 amountUSDT);
    event LeaderboardLuckySettled(uint256 indexed dayId, address indexed user, uint8 luckyRank, uint256 amountUSDT);
    event PoolRewardSettled(uint8 indexed poolType, address indexed beneficiary, uint256 amountUSDT);
    event RewardPoolFunded(address indexed operator, uint256 amountUSDT, uint256 newPoolBalance);
    event RewardConfigUpdated(
        uint16 releaseDailyBps,
        uint16 releaseImmediateBurnBps,
        uint16 releaseSecondaryBurnBps,
        uint16 releaseStaticBps,
        uint16 releaseDynamicBps,
        uint16 rewardCapBps,
        address indexed rewardBurnAddress
    );
    event DailyRewardsSettled(
        uint256 indexed dayId,
        uint256 releaseAmount,
        uint256 burnedAmount,
        uint256 rewardPoolAmount,
        uint256 distributedAmount,
        uint256 carryBackAmount,
        bool manual
    );
    event OrderRewardDistributed(
        uint256 indexed dayId,
        uint256 indexed orderId,
        address indexed beneficiary,
        uint256 staticAmount,
        uint256 dynamicAmount,
        uint256 cumulativePaid,
        uint256 remainingCap
    );
    event OrderExited(uint256 indexed orderId, address indexed beneficiary, uint256 capAmount, uint256 totalPaid);
    event SubAdminUpdated(address indexed account, bool enabled);
    event LeaderboardWhitelistUpdated(address[] accounts);
    event LeaderboardWhitelistAdjustUpdated(uint8 adjustPct);
    event LeaderboardWhitelistSettled(uint256 indexed dayId, address indexed user, bool indexed isTopPool, uint256 amountUSDT);

    constructor() {
        _disableInitializers();
    }

    function initialize(
        address usdtAddress,
        address initialOwner,
        address[6] memory initialRecipients
    ) public initializer {
        require(usdtAddress != address(0), "invalid usdt");
        __Ownable_init(initialOwner);
        __Pausable_init();

        usdt = IERC20(usdtAddress);
        usdtTokenDecimals = IERC20Metadata(usdtAddress).decimals();
        machineUnitPrice = 100 * _usdtUnit();
        nodePrice = 1000 * _usdtUnit();
        superNodePrice = 3000 * _usdtUnit();
        nextIdentityId = 1;
        nextMachineOrderId = 1;
        rankShares = [4000, 2000, 500, 500, 500, 500, 500, 500, 500, 500];

        _setPoolConfig(PoolType.Liquidity, initialRecipients[0], 6000);
        _setPoolConfig(PoolType.Referral, initialRecipients[1], 500);
        _setPoolConfig(PoolType.SuperNode, initialRecipients[2], 500);
        _setPoolConfig(PoolType.Node, initialRecipients[3], 800);
        _setPoolConfig(PoolType.Platform, initialRecipients[4], 2000);
        _setPoolConfig(PoolType.Leaderboard, initialRecipients[5], 200);

        releaseDailyBps = 200;
        releaseImmediateBurnBps = 4000;
        releaseSecondaryBurnBps = 2000;
        releaseStaticBps = 6000;
        releaseDynamicBps = 4000;
        rewardCapBps = 30000;
        rewardBurnAddress = 0x000000000000000000000000000000000000dEaD;
        leaderboardWhitelistAdjustPct = 0;
    }

    modifier onlyOwnerOrSubAdmin() {
        require(_isOwnerOrSubAdmin(msg.sender), "not authorized");
        _;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwnerOrSubAdmin {}

    // ============ Main Functions ============

    function purchaseMachine(uint256 quantity) external whenNotPaused nonReentrant {
        require(quantity > 0 && quantity <= MAX_MACHINE_PER_ORDER, "invalid qty");
        require(referralOf[msg.sender] != address(0), "bind referrer first");
        require(personalPower[msg.sender] + quantity <= MAX_MACHINE_PER_ADDRESS, "exceeds address limit");

        uint256 amountUSDT = machineUnitPrice * quantity;
        usdt.safeTransferFrom(msg.sender, address(this), amountUSDT);

        uint256 orderId = nextMachineOrderId;
        address currentReferrer = referralOf[msg.sender];

        directReferralVolume[currentReferrer] += amountUSDT;
        _updateTeamVolume(currentReferrer, amountUSDT);

        machineOrders[orderId] = MachineOrder({
            id: orderId,
            user: msg.sender,
            quantity: quantity,
            amountUSDT: amountUSDT,
            referrer: currentReferrer,
            createdAt: block.timestamp
        });
        userOrderIds[msg.sender].push(orderId);
        nextMachineOrderId = orderId + 1;

        orderRewardLedger[orderId].capAmount = (amountUSDT * rewardCapBps) / BPS_DENOMINATOR;

        uint256 newPower = personalPower[msg.sender] + quantity;
        personalPower[msg.sender] = newPower;

        _registerParticipant(msg.sender);
        _updateLeaderboard(currentDay(), msg.sender, amountUSDT);
        _allocateMachineOrder(orderId, amountUSDT, currentReferrer);

        emit MachinePurchased(msg.sender, orderId, quantity, amountUSDT, currentReferrer);
    }

    function bindReferrer(address referrer) external whenNotPaused {
        require(referralOf[msg.sender] == address(0), "already bound");
        require(_isValidReferrer(msg.sender, referrer), "invalid referrer");

        _bindReferrer(msg.sender, referrer);
    }

    function buyNode() external whenNotPaused nonReentrant {
        require(referralOf[msg.sender] != address(0), "bind referrer first");
        Role role = _getRole(msg.sender);
        require(role == Role.None, "already has role");

        usdt.safeTransferFrom(msg.sender, address(this), nodePrice);

        uint256 identityId = nextIdentityId;
        nextIdentityId = identityId + 1;

        identities[identityId] = IdentityAccount({
            id: identityId,
            owner: msg.sender,
            role: Role.Node,
            updatedAt: block.timestamp
        });
        ownedIdentityId[msg.sender] = identityId;

        address referrer = referralOf[msg.sender];
        _registerParticipant(msg.sender);

        // Maintain role list for on-chain settlement.
        _addToNodeList(msg.sender);

        // Update team stats and leaderboard for node purchase
        directReferralVolume[referrer] += nodePrice;
        _updateTeamVolume(referrer, nodePrice);
        _updateLeaderboard(currentDay(), msg.sender, nodePrice);
        
        // Allocate node purchase amount across pools
        _allocateIdentityPurchase(identityId, nodePrice, referrer, true);
        
        emit NodePurchased(msg.sender, nodePrice, identityId);
    }

    function buySuperNode() external whenNotPaused nonReentrant {
        require(referralOf[msg.sender] != address(0), "bind referrer first");
        Role currentRole = _getRole(msg.sender);
        require(currentRole != Role.SuperNode, "already a super node");

        usdt.safeTransferFrom(msg.sender, address(this), superNodePrice);

        uint256 identityId;
        if (currentRole == Role.None) {
            identityId = nextIdentityId;
            nextIdentityId = identityId + 1;
            identities[identityId] = IdentityAccount({
                id: identityId,
                owner: msg.sender,
                role: Role.SuperNode,
                updatedAt: block.timestamp
            });
            ownedIdentityId[msg.sender] = identityId;
        } else {
            identityId = ownedIdentityId[msg.sender];
            identities[identityId].role = Role.SuperNode;
            identities[identityId].updatedAt = block.timestamp;
        }
        
        address referrer = referralOf[msg.sender];
        _registerParticipant(msg.sender);

        // Maintain role list: if previously Node, move to SuperNode; else just add.
        if (currentRole == Role.Node) {
            _removeFromNodeList(msg.sender);
        }
        _addToSuperNodeList(msg.sender);

        // Update team stats and leaderboard for super-node purchase
        directReferralVolume[referrer] += superNodePrice;
        _updateTeamVolume(referrer, superNodePrice);
        _updateLeaderboard(currentDay(), msg.sender, superNodePrice);
        
        // Allocate super-node purchase amount across pools
        _allocateIdentityPurchase(identityId, superNodePrice, referrer, false);
        
        emit SuperNodePurchased(msg.sender, superNodePrice, identityId);
    }

    function setIdentityMarket(address market) external onlyOwnerOrSubAdmin {
        require(market != address(0), "invalid market");
        identityMarket = market;
        emit IdentityMarketUpdated(market);
    }

    function approveIdentityOperator(uint256 identityId, address operator, bool approved) external {
        require(operator != address(0), "invalid operator");

        IdentityAccount storage identity = identities[identityId];
        require(identity.owner == msg.sender, "not owner");

        identityOperatorApproval[identityId][operator] = approved;
        emit IdentityOperatorApproved(identityId, operator, approved);
    }

    function isIdentityOperatorApproved(uint256 identityId, address operator) external view returns (bool) {
        return identityOperatorApproval[identityId][operator];
    }

    function transferIdentityByMarket(uint256 identityId, address from, address to) external {
        require(msg.sender == identityMarket, "not market");
        require(to != address(0), "invalid to");
        require(ownedIdentityId[to] == 0, "recipient has identity");

        IdentityAccount storage identity = identities[identityId];
        require(identity.owner == from, "invalid owner");
        require(identityOperatorApproval[identityId][msg.sender], "market not approved");

        delete ownedIdentityId[from];
        ownedIdentityId[to] = identityId;
        identity.owner = to;
        identity.updatedAt = block.timestamp;
        // NOTE: Do NOT delete referralOf[from] — seller should retain their
        // referral binding so they can continue purchasing machines and
        // participating in the ecosystem after selling their identity.
        delete identityOperatorApproval[identityId][msg.sender];

        // Sync role lists so settlement reflects the new owner immediately.
        _transferRoleList(from, to, identity.role);

        emit IdentityTransferred(identityId, from, to, uint8(identity.role));
    }

    function ownerOfIdentity(uint256 identityId) external view returns (address) {
        return identities[identityId].owner;
    }

    function getUserIdentityId(address user) external view returns (uint256) {
        return ownedIdentityId[user];
    }

    function getIdentity(uint256 identityId)
        external
        view
        returns (uint256 id, address owner, Role role, uint256 updatedAt)
    {
        IdentityAccount memory identity = identities[identityId];
        return (identity.id, identity.owner, identity.role, identity.updatedAt);
    }

    function setRewardWeights(address[] calldata accounts, uint256[] calldata weights) external onlyOwnerOrSubAdmin {
        require(accounts.length == weights.length, "invalid length");

        for (uint256 i = 0; i < accounts.length; i++) {
            address account = accounts[i];
            require(account != address(0), "invalid account");
            rewardWeight[account] = weights[i];
            emit RewardWeightUpdated(account, weights[i]);
        }
    }

    function getUserRole(address user) external view returns (Role) {
        return _getRole(user);
    }

    function getPoolConfig(uint8 poolType) external view returns (address recipient, uint16 bps) {
        require(poolType < poolConfigs.length, "invalid pool");
        PoolConfig memory config = poolConfigs[poolType];
        return (config.recipient, config.bps);
    }

    function rewardParticipantsLength() external view returns (uint256) {
        return rewardParticipants.length;
    }

    function subAdminListLength() external view returns (uint256) {
        return subAdminList.length;
    }

    function userOrderIdsLength(address user) external view returns (uint256) {
        return userOrderIds[user].length;
    }

    function _isOwnerOrSubAdmin(address account) private view returns (bool) {
        return account == owner() || subAdmins[account];
    }

    function isOwnerOrSubAdmin(address account) public view returns (bool) {
        return _isOwnerOrSubAdmin(account);
    }

    function isOwnerSubAdminOrManager(address account) public view returns (bool) {
        return _isOwnerOrSubAdmin(account) || managers[account];
    }

    function getLeaderboard(uint256 dayId)
        external
        view
        returns (address[10] memory topUsers, uint256[10] memory topVolumes, uint8 topCount, address[10] memory lastUsers, uint8 lastCount)
    {
        LeaderboardLib.LeaderboardState storage board = leaderboards[dayId];
        return (board.topUsers, board.topVolumes, board.topCount, board.lastUsers, board.lastCount);
    }

    function currentDay() public view returns (uint256) {
        uint256 dur = cycleDuration == 0 ? 1 days : cycleDuration;
        return block.timestamp / dur;
    }

    function setCycleDuration(uint256 newDuration) external onlyOwnerOrSubAdmin {
        require(newDuration >= 60 || newDuration == 0, "cycle too short");
        cycleDuration = newDuration;
    }

    function pause() external onlyOwnerOrSubAdmin {
        _pause();
    }

    function setAdminRole(address account, uint8 kind, bool enabled) external {
        require(account != address(0));
        // kind: 1 = subAdmin, 2 = manager
        if (kind == 1) {
            require(_isOwnerOrSubAdmin(msg.sender), "not authorized");
            bool exists = subAdmins[account];
            if (enabled) {
                require(!exists, "already sub admin");
                subAdmins[account] = true;
                subAdminList.push(account);
                subAdminIndexPlusOne[account] = subAdminList.length;
            } else {
                require(exists, "not sub admin");
                subAdmins[account] = false;
                uint256 removeIndex = subAdminIndexPlusOne[account] - 1;
                uint256 lastIndex = subAdminList.length - 1;
                if (removeIndex != lastIndex) {
                    address lastAccount = subAdminList[lastIndex];
                    subAdminList[removeIndex] = lastAccount;
                    subAdminIndexPlusOne[lastAccount] = removeIndex + 1;
                }
                subAdminList.pop();
                delete subAdminIndexPlusOne[account];
            }
            emit SubAdminUpdated(account, enabled);
        } else if (kind == 2) {
            require(_isOwnerOrSubAdmin(msg.sender), "not authorized");
            managers[account] = enabled;
        } else {
            revert();
        }
    }

    function unpause() external onlyOwnerOrSubAdmin {
        _unpause();
    }

    function setUsdtAddress(address newUsdtAddress) external onlyOwnerOrSubAdmin {
        usdt = IERC20(newUsdtAddress);
    }

    function updatePrice(uint8 kind, uint256 newPrice) external {
        require(newPrice > 0);
        if (kind == 0) {
            _requirePriceAdmin();
            require(newPrice <= _maxMachineUnitPrice());
            emit PriceUpdated("MACHINE", machineUnitPrice, newPrice);
            machineUnitPrice = newPrice;
        } else if (kind == 1) {
            _requirePriceAdmin();
            require(newPrice <= _maxNodePrice());
            emit PriceUpdated("NODE", nodePrice, newPrice);
            nodePrice = newPrice;
        } else if (kind == 2) {
            require(_isOwnerOrSubAdmin(msg.sender), "not authorized");
            require(newPrice <= _maxSuperNodePrice());
            emit PriceUpdated("SUPER_NODE", superNodePrice, newPrice);
            superNodePrice = newPrice;
        } else {
            revert();
        }
    }



    function _effectiveUsdtDecimals() internal view returns (uint8) {
        // Legacy proxies used 6-decimal scaling before this variable existed.
        return usdtTokenDecimals == 0 ? 6 : usdtTokenDecimals;
    }

    function _usdtUnit() internal view returns (uint256) {
        return 10 ** uint256(_effectiveUsdtDecimals());
    }

    function _maxMachineUnitPrice() internal view returns (uint256) {
        return 10_000 * _usdtUnit();
    }

    function _maxNodePrice() internal view returns (uint256) {
        return 100_000 * _usdtUnit();
    }

    function _maxSuperNodePrice() internal view returns (uint256) {
        return 300_000 * _usdtUnit();
    }

    function _requirePriceAdmin() internal view {
        require(isOwnerSubAdminOrManager(msg.sender), "not authorized");
    }

    function updatePoolRecipient(uint8 poolType, address newRecipient) external onlyOwnerOrSubAdmin {
        require(poolType < poolConfigs.length, "invalid pool");
        require(newRecipient != address(0), "invalid recipient");

        poolConfigs[poolType].recipient = newRecipient;
        emit PoolConfigUpdated(poolType, newRecipient, poolConfigs[poolType].bps);
    }

    function updatePoolShare(uint8 poolType, uint16 newBps) external onlyOwnerOrSubAdmin {
        require(poolType < poolConfigs.length, "invalid pool");
        require(newBps > 0, "invalid bps");
        require(newBps <= BPS_DENOMINATOR, "bps exceeds denominator");

        uint16 oldBps = poolConfigs[poolType].bps;
        poolConfigs[poolType].bps = newBps;

        if (_poolShareTotal() != BPS_DENOMINATOR) {
            poolConfigs[poolType].bps = oldBps;
            revert("invalid pool total");
        }

        emit PoolConfigUpdated(poolType, poolConfigs[poolType].recipient, newBps);
    }

    function getNodePurchaseResidualRecipients() external view returns (address[] memory) {
        return nodePurchaseResidualRecipients;
    }

    function getSuperNodePurchaseResidualRecipients() external view returns (address[] memory) {
        return superNodePurchaseResidualRecipients;
    }

    function setNodePurchaseResidualRecipients(address[] calldata recipients) external onlyOwnerOrSubAdmin {
        _setPurchaseResidualRecipients(true, recipients);
    }

    function setSuperNodePurchaseResidualRecipients(address[] calldata recipients) external onlyOwnerOrSubAdmin {
        _setPurchaseResidualRecipients(false, recipients);
    }

    function setLeaderboardWhitelist(address[] calldata accounts) external onlyOwnerOrSubAdmin {
        for (uint256 i = 0; i < leaderboardWhitelist.length; i++) {
            address oldAccount = leaderboardWhitelist[i];
            delete leaderboardWhitelistIndexPlusOne[oldAccount];
        }
        delete leaderboardWhitelist;

        for (uint256 i = 0; i < accounts.length; i++) {
            address account = accounts[i];
            require(account != address(0), "invalid whitelist account");
            require(leaderboardWhitelistIndexPlusOne[account] == 0, "duplicate whitelist account");
            leaderboardWhitelist.push(account);
            leaderboardWhitelistIndexPlusOne[account] = i + 1;
        }

        emit LeaderboardWhitelistUpdated(accounts);
    }

    function leaderboardWhitelistLength() external view returns (uint256) {
        return leaderboardWhitelist.length;
    }

    function setLeaderboardWhitelistAdjustPct(uint8 adjustPct) external onlyOwnerOrSubAdmin {
        require(adjustPct <= 10, "adjust out of range");
        leaderboardWhitelistAdjustPct = adjustPct;
        emit LeaderboardWhitelistAdjustUpdated(adjustPct);
    }

    function fundRewardPool(uint256 amount) external onlyOwnerOrSubAdmin {
        require(amount > 0, "invalid amount");
        require(address(lightToken) != address(0), "light not set");

        lightToken.safeTransferFrom(msg.sender, address(this), amount);
        rewardPoolBalance += amount;

        emit RewardPoolFunded(msg.sender, amount, rewardPoolBalance);
    }

    function initLightRewardConfig(address _lightToken, address _swapPoolManager) external onlyOwnerOrSubAdmin {
        require(_lightToken != address(0) && _swapPoolManager != address(0), "invalid addr");
        lightToken = IERC20(_lightToken);
        swapPoolManager = _swapPoolManager;
    }

    function updateRewardConfig(
        uint16 newReleaseDailyBps,
        uint16 newImmediateBurnBps,
        uint16 newSecondaryBurnBps,
        uint16 newStaticBps,
        uint16 newDynamicBps,
        uint16 newRewardCapBps
    ) external onlyOwnerOrSubAdmin {
        require(newReleaseDailyBps > 0 && newReleaseDailyBps <= BPS_DENOMINATOR, "invalid daily bps");
        require(newImmediateBurnBps <= BPS_DENOMINATOR, "invalid immediate burn bps");
        require(newSecondaryBurnBps <= BPS_DENOMINATOR, "invalid secondary burn bps");
        require(uint32(newStaticBps) + uint32(newDynamicBps) == BPS_DENOMINATOR, "invalid reward split");
        require(newRewardCapBps >= BPS_DENOMINATOR, "invalid cap bps");

        releaseDailyBps = newReleaseDailyBps;
        releaseImmediateBurnBps = newImmediateBurnBps;
        releaseSecondaryBurnBps = newSecondaryBurnBps;
        releaseStaticBps = newStaticBps;
        releaseDynamicBps = newDynamicBps;
        rewardCapBps = newRewardCapBps;

        emit RewardConfigUpdated(
            newReleaseDailyBps,
            newImmediateBurnBps,
            newSecondaryBurnBps,
            newStaticBps,
            newDynamicBps,
            newRewardCapBps,
            address(0)
        );
    }

    function settleDailyRewardsManual(address[] calldata participants, uint256 lightPriceInUsdt) external onlyOwnerOrSubAdmin whenNotPaused {
        _settleDailyRewards(participants, true, lightPriceInUsdt);
    }

    function settleDailyRewardsIfDue(address[] calldata participants, uint256 lightPriceInUsdt) external whenNotPaused returns (bool settled) {
        uint256 dayId = currentDay();
        if (dayId <= lastRewardSettlementDay) {
            return false;
        }
        if (rewardPoolBalance == 0) {
            return false;
        }

        _settleDailyRewards(participants, false, lightPriceInUsdt);
        return true;
    }

    function withdrawUSDT(address to, uint256 amount) external onlyOwnerOrSubAdmin {
        require(to != address(0), "invalid to");
        usdt.safeTransfer(to, amount);
    }

    function _settleDailyRewards(address[] calldata participants, bool manual, uint256 lightPriceInUsdt) private {
        uint256 dayId = currentDay();
        require(dayId > lastRewardSettlementDay, "already settled today");
        require(lightPriceInUsdt > 0, "invalid price");
        _transientLightPrice = lightPriceInUsdt;

        uint256 poolBefore = rewardPoolBalance;
        require(poolBefore > 0, "no reward pool");

        uint256 releaseAmount = (poolBefore * releaseDailyBps) / BPS_DENOMINATOR;
        if (releaseAmount == 0) {
            releaseAmount = poolBefore;
        }

        rewardPoolBalance = poolBefore - releaseAmount;

        uint256 immediateBurnAmount = (releaseAmount * releaseImmediateBurnBps) / BPS_DENOMINATOR;
        uint256 secondaryAmount = releaseAmount - immediateBurnAmount;
        uint256 secondaryBurnAmount = (secondaryAmount * releaseSecondaryBurnBps) / BPS_DENOMINATOR;
        uint256 burnedAmount = immediateBurnAmount + secondaryBurnAmount;
        uint256 rewardAmount = releaseAmount - burnedAmount;

        if (burnedAmount > 0) {
            IERC20Burnable(address(lightToken)).burn(burnedAmount);
        }

        (uint256 staticDenominator, uint256 dynamicDenominator) = _collectRewardDenominators(participants);

        uint256 staticPoolAmount = (rewardAmount * releaseStaticBps) / BPS_DENOMINATOR;
        uint256 dynamicPoolAmount = rewardAmount - staticPoolAmount;

        uint256 distributedAmount = _distributeDailyRewards(
            dayId,
            participants,
            staticPoolAmount,
            dynamicPoolAmount,
            staticDenominator,
            dynamicDenominator
        );

        uint256 carryBackAmount = rewardAmount - distributedAmount;
        if (carryBackAmount > 0) {
            rewardPoolBalance += carryBackAmount;
        }

        lastRewardSettlementDay = dayId;

        emit DailyRewardsSettled(
            dayId,
            releaseAmount,
            burnedAmount,
            rewardAmount,
            distributedAmount,
            carryBackAmount,
            manual
        );
    }

    function _collectRewardDenominators(address[] calldata participants)
        private
        view
        returns (uint256 staticDenominator, uint256 dynamicDenominator)
    {
        for (uint256 i = 0; i < participants.length; i++) {
            address user = participants[i];
            if (user == address(0)) {
                continue;
            }

            uint256 remainingCap = _userRemainingCap(user);
            if (remainingCap == 0) {
                continue;
            }

            uint256 staticWeight = _effectiveStaticWeight(user);
            if (staticWeight > 0) {
                staticDenominator += staticWeight;
            }

            uint256 dynamicWeight = teamTotalVolume[user];
            if (dynamicWeight > 0) {
                dynamicDenominator += dynamicWeight;
            }
        }
    }

    function _distributeDailyRewards(
        uint256 dayId,
        address[] calldata participants,
        uint256 staticPoolAmount,
        uint256 dynamicPoolAmount,
        uint256 staticDenominator,
        uint256 dynamicDenominator
    ) private returns (uint256 distributedAmount) {
        for (uint256 i = 0; i < participants.length; i++) {
            address user = participants[i];
            if (user == address(0)) {
                continue;
            }

            uint256 remainingCap = _userRemainingCap(user);
            if (remainingCap == 0) {
                continue;
            }

            uint256 userStaticAmount;
            if (staticDenominator > 0) {
                uint256 staticWeight = _effectiveStaticWeight(user);
                if (staticWeight > 0) {
                    userStaticAmount = (staticPoolAmount * staticWeight) / staticDenominator;
                }
            }

            uint256 userDynamicAmount;
            if (dynamicDenominator > 0) {
                uint256 dynamicWeight = teamTotalVolume[user];
                if (dynamicWeight > 0) {
                    userDynamicAmount = (dynamicPoolAmount * dynamicWeight) / dynamicDenominator;
                }
            }

            if (userStaticAmount == 0 && userDynamicAmount == 0) {
                continue;
            }

            distributedAmount += _distributeUserRewards(dayId, user, userStaticAmount, userDynamicAmount);
        }
    }

    function _distributeUserRewards(
        uint256 dayId,
        address user,
        uint256 userStaticAmount,
        uint256 userDynamicAmount
    ) private returns (uint256 distributedAmount) {
        uint256[] storage orderIds = userOrderIds[user];

        uint256 totalRemaining;
        uint256 activeCount;
        for (uint256 i = 0; i < orderIds.length; i++) {
            uint256 remaining = _orderRemainingCap(orderIds[i]);
            if (remaining == 0) {
                continue;
            }
            totalRemaining += remaining;
            activeCount += 1;
        }

        if (activeCount == 0 || totalRemaining == 0) {
            return 0;
        }

        uint256 consumedStatic;
        uint256 consumedDynamic;
        uint256 handled;

        for (uint256 i = 0; i < orderIds.length; i++) {
            uint256 remaining = _orderRemainingCap(orderIds[i]);
            if (remaining == 0) {
                continue;
            }

            handled += 1;

            uint256 pStatic = handled == activeCount ? userStaticAmount - consumedStatic : (userStaticAmount * remaining) / totalRemaining;
            uint256 pDynamic = handled == activeCount ? userDynamicAmount - consumedDynamic : (userDynamicAmount * remaining) / totalRemaining;

            (uint256 pLight, uint256 sLight, uint256 dLight) = _processOrderReward(
                dayId, orderIds[i], user, remaining, pStatic, pDynamic
            );

            consumedStatic += sLight;
            consumedDynamic += dLight;
            distributedAmount += pLight;
        }
    }

    function _processOrderReward(
        uint256 dayId,
        uint256 orderId,
        address user,
        uint256 remaining,
        uint256 plannedStatic,
        uint256 plannedDynamic
    ) private returns (uint256 payableLight, uint256 staticLightUsed, uint256 dynamicLightUsed) {
        uint256 plannedTotal = plannedStatic + plannedDynamic;
        if (plannedTotal == 0) {
            return (0, 0, 0);
        }

        uint256 lightPrice = _transientLightPrice;
        uint256 payableUsdt = (plannedTotal * lightPrice) / 1e18;
        payableLight = plannedTotal;

        if (payableUsdt > remaining) {
            payableLight = (remaining * 1e18) / lightPrice;
            payableUsdt = remaining;
        }
        if (payableLight == 0) {
            return (0, 0, 0);
        }

        // LIGHT split
        staticLightUsed = payableLight == plannedTotal ? plannedStatic : (plannedStatic * payableLight) / plannedTotal;
        dynamicLightUsed = payableLight - staticLightUsed;

        // USDT split for ledger
        uint256 sUsdt = payableLight == plannedTotal
            ? (plannedStatic * lightPrice) / 1e18
            : (plannedTotal > 0 ? (plannedStatic * payableUsdt) / plannedTotal : 0);

        OrderRewardLedger storage ledger = orderRewardLedger[orderId];
        ledger.staticPaid += sUsdt;
        ledger.dynamicPaid += payableUsdt - sUsdt;

        lightToken.safeTransfer(user, payableLight);

        uint256 totalPaid = ledger.staticPaid + ledger.dynamicPaid;
        uint256 newRemaining = ledger.capAmount > totalPaid ? ledger.capAmount - totalPaid : 0;

        emit OrderRewardDistributed(dayId, orderId, user, staticLightUsed, dynamicLightUsed, totalPaid, newRemaining);

        if (newRemaining == 0 && !ledger.exited) {
            ledger.exited = true;
            emit OrderExited(orderId, user, ledger.capAmount, totalPaid);
        }
    }

    function _effectiveStaticWeight(address user) private view returns (uint256) {
        uint256 customWeight = rewardWeight[user];
        if (customWeight > 0) {
            return customWeight;
        }
        return personalPower[user];
    }

    function _orderRemainingCap(uint256 orderId) private view returns (uint256) {
        OrderRewardLedger storage ledger = orderRewardLedger[orderId];
        if (ledger.exited || ledger.capAmount == 0) {
            return 0;
        }

        uint256 paid = ledger.staticPaid + ledger.dynamicPaid;
        if (paid >= ledger.capAmount) {
            return 0;
        }

        return ledger.capAmount - paid;
    }

    function _userRemainingCap(address user) private view returns (uint256 remainingCap) {
        uint256[] storage orderIds = userOrderIds[user];
        for (uint256 i = 0; i < orderIds.length; i++) {
            remainingCap += _orderRemainingCap(orderIds[i]);
        }
    }

    /// @notice Distribute accumulated leaderboard pool to top and lucky rankings of a given day.
    /// 2% leaderboard pool is split as: 1.5% (top ranking) + 0.5% (lucky ranking).
    /// Only works when the Leaderboard pool recipient was set to address(this).
    /// Actual settlement logic lives in the external LeaderboardLib (linked at deploy time).
    function settleLeaderboard(uint256 dayId) external {
        _requireSettlementAuth();
        LeaderboardLib.settle(
            dayId,
            poolAccumulated,
            leaderboards,
            leaderboardSettledDay,
            rankShares,
            leaderboardWhitelist,
            leaderboardWhitelistAdjustPct,
            usdt
        );
    }

    function settlePoolRewards(uint8 poolType, address[] calldata recipients, uint16[] calldata shares) external onlyOwnerOrSubAdmin {
        require(poolType == uint8(PoolType.Node) || poolType == uint8(PoolType.SuperNode), "invalid pool");
        _settleAccumulatedPool(PoolType(poolType), recipients, shares);
    }

    function _settleAccumulatedPool(
        PoolType poolType,
        address[] calldata recipients,
        uint16[] calldata shares
    ) private {
        PoolSettleLib.settleAccumulatedPool(uint8(poolType), recipients, shares, poolAccumulated, usdt);
    }

    function _allocateMachineOrder(uint256 orderId, uint256 totalAmount, address referrer) private {
        uint256 liquidityAmount = _poolAmount(totalAmount, uint8(PoolType.Liquidity));
        uint256 referralAmount = _poolAmount(totalAmount, uint8(PoolType.Referral));
        uint256 superAmount = _poolAmount(totalAmount, uint8(PoolType.SuperNode));
        uint256 nodeAmount = _poolAmount(totalAmount, uint8(PoolType.Node));
        uint256 platformAmount = _poolAmount(totalAmount, uint8(PoolType.Platform));

        uint256 allocated = liquidityAmount + referralAmount + superAmount + nodeAmount + platformAmount;
        uint256 leaderboardAmount = totalAmount - allocated;

        _transferPool(orderId, PoolType.Liquidity, poolConfigs[uint8(PoolType.Liquidity)].recipient, liquidityAmount);

        address referralRecipient = referrer != address(0) ? referrer : poolConfigs[uint8(PoolType.Referral)].recipient;
        _transferPool(orderId, PoolType.Referral, referralRecipient, referralAmount);

        // Node and super-node rewards accrue into their pool wallets first.
        // Daily settlement is handled off the purchase path to match the business flow.
        _transferPool(orderId, PoolType.SuperNode, poolConfigs[uint8(PoolType.SuperNode)].recipient, superAmount);
        _transferPool(orderId, PoolType.Node, poolConfigs[uint8(PoolType.Node)].recipient, nodeAmount);

        _transferPool(orderId, PoolType.Platform, poolConfigs[uint8(PoolType.Platform)].recipient, platformAmount);

        // Leaderboard money also accumulates in the dedicated reward pool.
        // Ranking data is still tracked on-chain for the daily settlement job.
        _transferPool(orderId, PoolType.Leaderboard, poolConfigs[uint8(PoolType.Leaderboard)].recipient, leaderboardAmount);
    }

    function _allocateIdentityPurchase(uint256 identityId, uint256 totalAmount, address referrer, bool isNode) private {
        // Node / SuperNode purchase split:
        //   1) Direct referrer takes a referral share (dynamic for node, fixed 20% for super node).
        //   2) Remaining USDT is distributed across the configured recipient set.
        //      When not configured yet, it falls back to the Platform pool recipient.
        // No funds are routed to Liquidity / Leaderboard / Node / SuperNode pools on identity purchases.
        uint16 referralBps;
        if (isNode) {
            referralBps = _getDynamicReferralBps(directNodeReferralCount[referrer] + 1);
        } else {
            referralBps = 2000;
        }
        uint256 referralAmount = (totalAmount * referralBps) / BPS_DENOMINATOR;
        require(totalAmount >= referralAmount, "invalid referral share");
        uint256 platformAmount = totalAmount - referralAmount;

        if (referrer != address(0)) {
            if (isNode) {
                directNodeReferralCount[referrer] += 1;
            } else {
                directSuperNodeReferralCount[referrer] += 1;
            }
        }

        uint256 trackingId = isNode ? (1_000_000_000 + identityId) : (2_000_000_000 + identityId);

        address referralRecipient = referrer != address(0) ? referrer : poolConfigs[uint8(PoolType.Referral)].recipient;
        _transferPool(trackingId, PoolType.Referral, referralRecipient, referralAmount);

        _distributeIdentityPurchaseResidual(trackingId, platformAmount, isNode);
    }

    function _updateLeaderboard(uint256 dayId, address user, uint256 amount) private {
        LeaderboardLib.LeaderboardState storage board = leaderboards[dayId];
        uint256 updatedVolume = dailyVolume[dayId][user] + amount;
        dailyVolume[dayId][user] = updatedVolume;

        uint256 firstOrderSeq = dailyFirstOrderSeq[dayId][user];
        if (firstOrderSeq == 0) {
            uint256 seq = dailyOrderSeq[dayId] + 1;
            dailyOrderSeq[dayId] = seq;
            dailyFirstOrderSeq[dayId][user] = seq;
        }

        _updateTop(dayId, board, user, updatedVolume);
        _updateLast(board, user);

        emit LeaderboardUpdated(dayId, user, updatedVolume);
    }

    function _updateTop(uint256 dayId, LeaderboardLib.LeaderboardState storage board, address user, uint256 volume) private {
        LeaderboardLib.updateTop(dayId, board, user, volume, dailyFirstOrderSeq);
    }

    function _updateLast(LeaderboardLib.LeaderboardState storage board, address user) private {
        if (board.lastCount < 10) {
            board.lastUsers[board.lastCount] = user;
            board.lastCount += 1;
            return;
        }

        for (uint8 i = 0; i < 9; i++) {
            board.lastUsers[i] = board.lastUsers[i + 1];
        }
        board.lastUsers[9] = user;
    }

    function _registerParticipant(address account) private {
        if (account == address(0) || isRewardParticipant[account]) {
            return;
        }

        isRewardParticipant[account] = true;
        rewardParticipants.push(account);
    }

    function _isValidReferrer(address user, address referrer) private pure returns (bool) {
        return referrer != address(0) && referrer != user;
    }

    function _bindReferrer(address user, address referrer) private {
        referralOf[user] = referrer;
        directReferralCount[referrer] += 1;
        _updateTeamCount(referrer, 1);
        emit ReferralBound(user, referrer);
    }

    function _poolAmount(uint256 totalAmount, uint8 poolType) private view returns (uint256) {
        return (totalAmount * poolConfigs[poolType].bps) / BPS_DENOMINATOR;
    }

    /// @notice Calculate dynamic referral BPS based on direct referral count (30%/20%/50% cycle)
    /// Count 1: 30%, Count 2: 20%, Count 3: 50%, Count 4: 30%, ...
    function _getDynamicReferralBps(uint256 count) private pure returns (uint16) {
        uint256 cycle = count % 3;
        if (cycle == 1) return 3000;  // 30%
        if (cycle == 2) return 2000;  // 20%
        return 5000;                   // 50% (count % 3 == 0)
    }

    function _transferPool(uint256 orderId, PoolType poolType, address recipient, uint256 amount) private {
        if (amount == 0) {
            return;
        }

        require(recipient != address(0), "invalid recipient");
        if (recipient == address(this)) {
            // Self-custody: funds stay in the contract for on-chain settlement.
            poolAccumulated[uint8(poolType)] += amount;
        } else {
            usdt.safeTransfer(recipient, amount);
        }
        emit PoolAllocated(orderId, uint8(poolType), recipient, address(usdt), amount);
    }

    function _distributeIdentityPurchaseResidual(uint256 trackingId, uint256 amount, bool isNode) private {
        if (amount == 0) {
            return;
        }

        address[] storage recipients = isNode ? nodePurchaseResidualRecipients : superNodePurchaseResidualRecipients;
        if (recipients.length == 0) {
            _transferPool(trackingId, PoolType.Platform, poolConfigs[uint8(PoolType.Platform)].recipient, amount);
            return;
        }

        uint256 baseShare = amount / recipients.length;
        uint256 distributed;
        for (uint256 i = 0; i < recipients.length; i++) {
            address recipient = recipients[i];
            require(recipient != address(0), "invalid residual recipient");

            uint256 share = i + 1 == recipients.length ? amount - distributed : baseShare;
            distributed += share;
            if (share == 0) {
                continue;
            }

            usdt.safeTransfer(recipient, share);
            emit IdentityPurchaseResidualAllocated(trackingId, isNode, recipient, share);
        }
    }

    function _setPurchaseResidualRecipients(bool isNodePurchase, address[] calldata recipients) private {
        require(recipients.length > 0, "empty residual recipients");
        require(recipients.length <= MAX_PURCHASE_RESIDUAL_RECIPIENTS, "too many residual recipients");

        address[] storage target = isNodePurchase ? nodePurchaseResidualRecipients : superNodePurchaseResidualRecipients;
        while (target.length > 0) {
            target.pop();
        }

        for (uint256 i = 0; i < recipients.length; i++) {
            address recipient = recipients[i];
            require(recipient != address(0), "invalid residual recipient");
            target.push(recipient);
        }

        emit PurchaseResidualRecipientsUpdated(isNodePurchase, recipients);
    }

    function _poolShareTotal() private view returns (uint16 total) {
        for (uint8 i = 0; i < poolConfigs.length; i++) {
            total += poolConfigs[i].bps;
        }
    }

    function _setPoolConfig(PoolType poolType, address recipient, uint16 bps) private {
        require(recipient != address(0), "invalid recipient");
        require(bps > 0, "invalid bps");

        poolConfigs[uint8(poolType)] = PoolConfig({recipient: recipient, bps: bps});
        emit PoolConfigUpdated(uint8(poolType), recipient, bps);
    }

    function _getRole(address user) private view returns (Role) {
        uint256 identityId = ownedIdentityId[user];
        if (identityId == 0) {
            return Role.None;
        }

        return identities[identityId].role;
    }

    function _updateTeamCount(address user, uint256 count) private {
        address current = referralOf[user];
        for (uint256 i = 0; i < 20; i++) {
            if (current == address(0)) break;
            teamTotalMemberCount[current] += count;
            current = referralOf[current];
        }
    }

    function _updateTeamVolume(address user, uint256 amount) private {
        address current = referralOf[user];
        for (uint256 i = 0; i < 20; i++) {
            if (current == address(0)) break;
            teamTotalVolume[current] += amount;
            current = referralOf[current];
        }
    }

    // ============ On-chain pool settlement ============

    function _requireSettlementAuth() private view {
        if (publicSettleEnabled) return;
        require(_isOwnerOrSubAdmin(msg.sender), "not authorized");
    }

    function _addToNodeList(address account) private {
        if (nodeIndexPlusOne[account] != 0) return;
        nodeList.push(account);
        nodeIndexPlusOne[account] = nodeList.length;
        emit RoleListUpdated(account, uint8(Role.Node), true);
    }

    function _removeFromNodeList(address account) private {
        uint256 indexPlusOne = nodeIndexPlusOne[account];
        if (indexPlusOne == 0) return;
        uint256 index = indexPlusOne - 1;
        uint256 lastIndex = nodeList.length - 1;
        if (index != lastIndex) {
            address last = nodeList[lastIndex];
            nodeList[index] = last;
            nodeIndexPlusOne[last] = index + 1;
        }
        nodeList.pop();
        delete nodeIndexPlusOne[account];
        emit RoleListUpdated(account, uint8(Role.Node), false);
    }

    function _addToSuperNodeList(address account) private {
        if (superNodeIndexPlusOne[account] != 0) return;
        superNodeList.push(account);
        superNodeIndexPlusOne[account] = superNodeList.length;
        emit RoleListUpdated(account, uint8(Role.SuperNode), true);
    }

    function _removeFromSuperNodeList(address account) private {
        uint256 indexPlusOne = superNodeIndexPlusOne[account];
        if (indexPlusOne == 0) return;
        uint256 index = indexPlusOne - 1;
        uint256 lastIndex = superNodeList.length - 1;
        if (index != lastIndex) {
            address last = superNodeList[lastIndex];
            superNodeList[index] = last;
            superNodeIndexPlusOne[last] = index + 1;
        }
        superNodeList.pop();
        delete superNodeIndexPlusOne[account];
        emit RoleListUpdated(account, uint8(Role.SuperNode), false);
    }

    function _transferRoleList(address from, address to, Role role) private {
        if (role == Role.Node) {
            _removeFromNodeList(from);
            _addToNodeList(to);
        } else if (role == Role.SuperNode) {
            _removeFromSuperNodeList(from);
            _addToSuperNodeList(to);
        }
    }

    function setMinPoolSettleAmount(uint256 amount) external onlyOwnerOrSubAdmin {
        minPoolSettleAmount = amount;
        emit SettlementConfigUpdated(amount, publicSettleEnabled);
    }

    function setPublicSettleEnabled(bool enabled) external onlyOwnerOrSubAdmin {
        publicSettleEnabled = enabled;
        emit SettlementConfigUpdated(minPoolSettleAmount, enabled);
    }

    /// @notice One-time bootstrap to populate role lists from existing identities.
    /// @dev Iterates rewardParticipants and classifies by current role.
    function bootstrapRoleLists() external onlyOwnerOrSubAdmin {
        require(!roleListsBootstrapped, "already bootstrapped");
        roleListsBootstrapped = true;
        uint256 n = rewardParticipants.length;
        for (uint256 i = 0; i < n; i++) {
            address account = rewardParticipants[i];
            Role r = _getRole(account);
            if (r == Role.Node) {
                _addToNodeList(account);
            } else if (r == Role.SuperNode) {
                _addToSuperNodeList(account);
            }
        }
    }

    function nodeListLength() external view returns (uint256) {
        return nodeList.length;
    }

    function superNodeListLength() external view returns (uint256) {
        return superNodeList.length;
    }

    /// @notice Effective team weight = directReferralVolume + teamTotalVolume.
    function _teamWeight(address acc) private view returns (uint256) {
        return directReferralVolume[acc] + teamTotalVolume[acc];
    }

    function settleNodePoolOnChain() external whenNotPaused nonReentrant returns (bool) {
        _requireSettlementAuth();
        uint256 dayId = currentDay();
        require(dayId > lastNodePoolSettleDay, "already settled today");
        lastNodePoolSettleDay = dayId;
        return NodePoolLib.distribute(
            uint8(PoolType.Node), dayId, true, minPoolSettleAmount,
            poolAccumulated, nodeList, superNodeList,
            directReferralVolume, teamTotalVolume, usdt
        );
    }

    function settleSuperNodePoolOnChain() external whenNotPaused nonReentrant returns (bool) {
        _requireSettlementAuth();
        uint256 dayId = currentDay();
        require(dayId > lastSuperNodePoolSettleDay, "already settled today");
        lastSuperNodePoolSettleDay = dayId;
        return NodePoolLib.distribute(
            uint8(PoolType.SuperNode), dayId, false, minPoolSettleAmount,
            poolAccumulated, nodeList, superNodeList,
            directReferralVolume, teamTotalVolume, usdt
        );
    }
}
