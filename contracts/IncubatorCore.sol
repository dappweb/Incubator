// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

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

    struct LeaderboardState {
        address[10] topUsers;
        uint256[10] topVolumes;
        uint8 topCount;
        address[10] lastUsers;
        uint8 lastCount;
    }

    IERC20 public usdt;

    uint16 public constant BPS_DENOMINATOR = 10_000;
    uint16 public constant LEADERBOARD_TOP_SHARE_BPS = 7_500;
    uint16 public constant LEADERBOARD_LAST_SHARE_BPS = 2_500;
    uint256 public machineUnitPrice;
    uint256 public constant MAX_MACHINE_PER_ORDER = 10;
    uint256 public constant MAX_MACHINE_PER_ADDRESS = 100;

    uint256 public nodePrice;
    uint256 public superNodePrice;

    uint256 public nextIdentityId;
    address public identityMarket;
    mapping(uint256 => IdentityAccount) private identities;
    mapping(address => uint256) private ownedIdentityId;
    mapping(uint256 => mapping(address => bool)) private identityOperatorApproval;

    mapping(uint256 => MachineOrder) public machineOrders;
    mapping(address => uint256[]) private userOrderIds;
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
    address[] private rewardParticipants;
    mapping(address => bool) public isRewardParticipant;

    mapping(uint256 => LeaderboardState) private leaderboards;
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
    address[] private subAdminList;
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
    address[] private leaderboardWhitelist;
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

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

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

        // Update team stats and leaderboard for super-node purchase
        directReferralVolume[referrer] += superNodePrice;
        _updateTeamVolume(referrer, superNodePrice);
        _updateLeaderboard(currentDay(), msg.sender, superNodePrice);
        
        // Allocate super-node purchase amount across pools
        _allocateIdentityPurchase(identityId, superNodePrice, referrer, false);
        
        emit SuperNodePurchased(msg.sender, superNodePrice, identityId);
    }

    function setIdentityMarket(address market) external onlyOwner {
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

    function setRewardWeights(address[] calldata accounts, uint256[] calldata weights) external onlyOwner {
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

    function getMachineOrder(uint256 orderId) external view returns (MachineOrder memory) {
        return machineOrders[orderId];
    }

    function getUserMachineOrders(address user) external view returns (uint256[] memory) {
        return userOrderIds[user];
    }

    function getPoolConfig(uint8 poolType) external view returns (address recipient, uint16 bps) {
        require(poolType < poolConfigs.length, "invalid pool");
        PoolConfig memory config = poolConfigs[poolType];
        return (config.recipient, config.bps);
    }

    function getParticipantCount() external view returns (uint256) {
        return rewardParticipants.length;
    }

    function getParticipantAt(uint256 index) external view returns (address) {
        require(index < rewardParticipants.length, "out of range");
        return rewardParticipants[index];
    }

    function getSubAdmins() external view returns (address[] memory) {
        return subAdminList;
    }

    function isOwnerOrSubAdmin(address account) public view returns (bool) {
        return account == owner() || subAdmins[account] || managers[account];
    }

    function getLeaderboard(uint256 dayId)
        external
        view
        returns (address[10] memory topUsers, uint256[10] memory topVolumes, uint8 topCount, address[10] memory lastUsers, uint8 lastCount)
    {
        LeaderboardState storage board = leaderboards[dayId];
        return (board.topUsers, board.topVolumes, board.topCount, board.lastUsers, board.lastCount);
    }

    function currentDay() public view returns (uint256) {
        uint256 dur = cycleDuration == 0 ? 1 days : cycleDuration;
        return block.timestamp / dur;
    }

    function setCycleDuration(uint256 newDuration) external onlyOwner {
        require(newDuration >= 60 || newDuration == 0, "cycle too short");
        cycleDuration = newDuration;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function setSubAdmin(address account, bool enabled) external onlyOwner {
        require(account != address(0));

        bool exists = subAdmins[account];
        if (enabled) {
            require(!exists, "already sub admin");
            subAdmins[account] = true;
            subAdminList.push(account);
            subAdminIndexPlusOne[account] = subAdminList.length;
            emit SubAdminUpdated(account, true);
            return;
        }

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
        emit SubAdminUpdated(account, false);
    }

    function setManager(address account, bool enabled) external {
        require(isOwnerOrSubAdmin(msg.sender));
        managers[account] = enabled;
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setUsdtAddress(address newUsdtAddress) external onlyOwner {
        usdt = IERC20(newUsdtAddress);
    }

    function updateMachineUnitPrice(uint256 newPrice) external {
        _requirePriceAdmin();
        require(newPrice > 0 && newPrice <= _maxMachineUnitPrice());
        uint256 old = machineUnitPrice;
        machineUnitPrice = newPrice;
        emit PriceUpdated("MACHINE", old, newPrice);
    }

    function updateNodePrice(uint256 newPrice) external {
        _requirePriceAdmin();
        require(newPrice > 0 && newPrice <= _maxNodePrice());
        uint256 old = nodePrice;
        nodePrice = newPrice;
        emit PriceUpdated("NODE", old, newPrice);
    }

    function updateSuperNodePrice(uint256 newPrice) external onlyOwner {
        require(newPrice > 0 && newPrice <= _maxSuperNodePrice());
        uint256 old = superNodePrice;
        superNodePrice = newPrice;
        emit PriceUpdated("SUPER_NODE", old, newPrice);
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
        require(isOwnerOrSubAdmin(msg.sender));
    }

    function updatePoolRecipient(uint8 poolType, address newRecipient) external onlyOwner {
        require(poolType < poolConfigs.length, "invalid pool");
        require(newRecipient != address(0), "invalid recipient");

        poolConfigs[poolType].recipient = newRecipient;
        emit PoolConfigUpdated(poolType, newRecipient, poolConfigs[poolType].bps);
    }

    function updatePoolShare(uint8 poolType, uint16 newBps) external onlyOwner {
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

    function setLeaderboardWhitelist(address[] calldata accounts) external onlyOwner {
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

    function getLeaderboardWhitelist() external view returns (address[] memory) {
        return leaderboardWhitelist;
    }

    function setLeaderboardWhitelistAdjustPct(uint8 adjustPct) external onlyOwner {
        require(adjustPct <= 10, "adjust out of range");
        leaderboardWhitelistAdjustPct = adjustPct;
        emit LeaderboardWhitelistAdjustUpdated(adjustPct);
    }

    function fundRewardPool(uint256 amount) external onlyOwner {
        require(amount > 0, "invalid amount");
        require(address(lightToken) != address(0), "light not set");

        lightToken.safeTransferFrom(msg.sender, address(this), amount);
        rewardPoolBalance += amount;

        emit RewardPoolFunded(msg.sender, amount, rewardPoolBalance);
    }

    function initLightRewardConfig(address _lightToken, address _swapPoolManager) external onlyOwner {
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
    ) external onlyOwner {
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

    function settleDailyRewardsManual(address[] calldata participants, uint256 lightPriceInUsdt) external onlyOwner whenNotPaused {
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

    function withdrawUSDT(address to, uint256 amount) external onlyOwner {
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
    function settleLeaderboard(uint256 dayId) external onlyOwner {
        uint256 total = poolAccumulated[uint8(PoolType.Leaderboard)];
        require(total > 0, "no leaderboard balance");

        LeaderboardState storage board = leaderboards[dayId];
        require(board.topCount > 0 || board.lastCount > 0, "no board data for day");

        poolAccumulated[uint8(PoolType.Leaderboard)] = 0;

        uint256 topAmount;
        uint256 luckyAmount;

        if (board.topCount == 0) {
            luckyAmount = total;
        } else if (board.lastCount == 0) {
            topAmount = total;
        } else {
            topAmount = (total * LEADERBOARD_TOP_SHARE_BPS) / BPS_DENOMINATOR;
            luckyAmount = total - topAmount;
        }

        if (topAmount > 0) {
            _settleLeaderboardRanking(dayId, board, topAmount, true);
        }
        if (luckyAmount > 0) {
            _settleLeaderboardRanking(dayId, board, luckyAmount, false);
        }
    }

    function _settleLeaderboardRanking(
        uint256 dayId,
        LeaderboardState storage board,
        uint256 total,
        bool isTopPool
    ) private {
        uint8 count = isTopPool ? board.topCount : board.lastCount;
        require(count > 0, "no board data");

        uint256 whitelistAmount = _settleLeaderboardWhitelist(dayId, total, isTopPool);
        uint256 rankTotal = total - whitelistAmount;

        uint16 firstShare = _adjustedFirstRankShare();
        uint32 shareDenominator = 0;
        for (uint8 i = 0; i < count; i++) {
            shareDenominator += (i == 0 ? firstShare : rankShares[i]);
        }
        require(shareDenominator > 0, "zero share denominator");

        uint256 distributed = 0;
        for (uint8 i = 0; i < count; i++) {
            address user = isTopPool ? board.topUsers[i] : board.lastUsers[i];
            if (user == address(0)) continue;

            uint256 amount;
            uint16 rankShare = i == 0 ? firstShare : rankShares[i];
            if (i == count - 1) {
                amount = rankTotal - distributed;
            } else {
                amount = (rankTotal * rankShare) / shareDenominator;
            }
            if (amount > 0) {
                usdt.safeTransfer(user, amount);
                distributed += amount;
                if (isTopPool) {
                    emit LeaderboardSettled(dayId, user, i, amount);
                } else {
                    emit LeaderboardLuckySettled(dayId, user, i, amount);
                }
            }
        }
    }

    function _adjustedFirstRankShare() private view returns (uint16) {
        uint16 adjustBps = uint16(leaderboardWhitelistAdjustPct) * 100;
        require(rankShares[0] >= adjustBps, "invalid first-rank adjustment");
        return rankShares[0] - adjustBps;
    }

    function _settleLeaderboardWhitelist(uint256 dayId, uint256 total, bool isTopPool) private returns (uint256 whitelistAmount) {
        if (leaderboardWhitelist.length == 0 || leaderboardWhitelistAdjustPct == 0 || total == 0) {
            return 0;
        }

        whitelistAmount = (total * uint256(leaderboardWhitelistAdjustPct)) / 100;
        if (whitelistAmount == 0) {
            return 0;
        }

        uint256 distributed = 0;
        uint256 count = leaderboardWhitelist.length;
        for (uint256 i = 0; i < count; i++) {
            address account = leaderboardWhitelist[i];
            uint256 amount;
            if (i == count - 1) {
                amount = whitelistAmount - distributed;
            } else {
                amount = whitelistAmount / count;
            }

            if (amount > 0) {
                usdt.safeTransfer(account, amount);
                distributed += amount;
                emit LeaderboardWhitelistSettled(dayId, account, isTopPool, amount);
            }
        }
    }

    function settlePoolRewards(uint8 poolType, address[] calldata recipients, uint16[] calldata shares) external onlyOwner {
        require(poolType == uint8(PoolType.Node) || poolType == uint8(PoolType.SuperNode), "invalid pool");
        _settleAccumulatedPool(PoolType(poolType), recipients, shares);
    }

    function _settleAccumulatedPool(
        PoolType poolType,
        address[] calldata recipients,
        uint16[] calldata shares
    ) private {
        require(recipients.length > 0 && recipients.length == shares.length, "length mismatch");

        uint32 shareTotal = 0;
        for (uint256 i = 0; i < shares.length; i++) {
            shareTotal += shares[i];
        }
        require(shareTotal == BPS_DENOMINATOR, "shares must sum to 10000");

        uint256 total = poolAccumulated[uint8(poolType)];
        require(total > 0, "no pool balance");

        poolAccumulated[uint8(poolType)] = 0;

        uint256 distributed = 0;
        for (uint256 i = 0; i < recipients.length; i++) {
            require(recipients[i] != address(0), "invalid recipient");
            uint256 amount;
            if (i == recipients.length - 1) {
                amount = total - distributed;
            } else {
                amount = (total * shares[i]) / BPS_DENOMINATOR;
            }
            if (amount > 0) {
                usdt.safeTransfer(recipients[i], amount);
                distributed += amount;
                emit PoolRewardSettled(uint8(poolType), recipients[i], amount);
            }
        }
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
        uint16 referralBps;
        if (isNode) {
            referralBps = _getDynamicReferralBps(directNodeReferralCount[referrer] + 1);
        } else {
            referralBps = 2000;
        }
        uint256 referralAmount = (totalAmount * referralBps) / BPS_DENOMINATOR;

        uint256 platformAmount = _poolAmount(totalAmount, uint8(PoolType.Platform));
        uint256 leaderboardAmount = _poolAmount(totalAmount, uint8(PoolType.Leaderboard));

        uint256 fixedAllocated = referralAmount + platformAmount + leaderboardAmount;
        require(totalAmount >= fixedAllocated, "invalid referral share");

        if (referrer != address(0)) {
            if (isNode) {
                directNodeReferralCount[referrer] += 1;
            } else {
                directSuperNodeReferralCount[referrer] += 1;
            }
        }

        uint256 trackingId = isNode ? (1_000_000_000 + identityId) : (2_000_000_000 + identityId);

        _transferPool(trackingId, PoolType.Liquidity, poolConfigs[uint8(PoolType.Liquidity)].recipient, totalAmount - fixedAllocated);

        address referralRecipient = referrer != address(0) ? referrer : poolConfigs[uint8(PoolType.Referral)].recipient;
        _transferPool(trackingId, PoolType.Referral, referralRecipient, referralAmount);

        _transferPool(trackingId, PoolType.Platform, poolConfigs[uint8(PoolType.Platform)].recipient, platformAmount);
        _transferPool(trackingId, PoolType.Leaderboard, poolConfigs[uint8(PoolType.Leaderboard)].recipient, leaderboardAmount);
    }

    function _updateLeaderboard(uint256 dayId, address user, uint256 amount) private {
        LeaderboardState storage board = leaderboards[dayId];
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

    function _updateTop(uint256 dayId, LeaderboardState storage board, address user, uint256 volume) private {
        uint8 index = 10;
        for (uint8 i = 0; i < board.topCount; i++) {
            if (board.topUsers[i] == user) { index = i; break; }
        }

        uint8 targetIndex = 10;

        if (index < 10) {
            board.topVolumes[index] = volume;
            targetIndex = index;
        } else if (board.topCount < 10) {
            board.topUsers[board.topCount] = user;
            board.topVolumes[board.topCount] = volume;
            targetIndex = board.topCount;
            board.topCount += 1;
        } else if (_isTopCandidateBetter(dayId, board, user, volume, board.topUsers[board.topCount - 1], board.topVolumes[board.topCount - 1])) {
            board.topUsers[board.topCount - 1] = user;
            board.topVolumes[board.topCount - 1] = volume;
            targetIndex = board.topCount - 1;
        } else {
            return;
        }

        _sortTop(dayId, board, targetIndex);
    }

    function _updateLast(LeaderboardState storage board, address user) private {
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

    function _sortTop(uint256 dayId, LeaderboardState storage board, uint8 startIndex) private {
        uint8 cursor = startIndex;
        while (cursor > 0) {
            if (_isTopCandidateBetter(
                dayId,
                board,
                board.topUsers[cursor],
                board.topVolumes[cursor],
                board.topUsers[cursor - 1],
                board.topVolumes[cursor - 1]
            )) {
                (board.topVolumes[cursor], board.topVolumes[cursor - 1]) = (board.topVolumes[cursor - 1], board.topVolumes[cursor]);
                (board.topUsers[cursor], board.topUsers[cursor - 1]) = (board.topUsers[cursor - 1], board.topUsers[cursor]);
                cursor -= 1;
            } else {
                break;
            }
        }

        while (cursor + 1 < board.topCount) {
            if (_isTopCandidateBetter(
                dayId,
                board,
                board.topUsers[cursor + 1],
                board.topVolumes[cursor + 1],
                board.topUsers[cursor],
                board.topVolumes[cursor]
            )) {
                (board.topVolumes[cursor + 1], board.topVolumes[cursor]) = (board.topVolumes[cursor], board.topVolumes[cursor + 1]);
                (board.topUsers[cursor + 1], board.topUsers[cursor]) = (board.topUsers[cursor], board.topUsers[cursor + 1]);
                cursor += 1;
            } else {
                break;
            }
        }
    }

    function _isTopCandidateBetter(
        uint256 dayId,
        LeaderboardState storage,
        address leftUser,
        uint256 leftVolume,
        address rightUser,
        uint256 rightVolume
    ) private view returns (bool) {
        if (leftVolume > rightVolume) {
            return true;
        }
        if (leftVolume < rightVolume) {
            return false;
        }

        uint256 leftSeq = dailyFirstOrderSeq[dayId][leftUser];
        uint256 rightSeq = dailyFirstOrderSeq[dayId][rightUser];
        if (leftSeq == 0 || rightSeq == 0) {
            return leftUser < rightUser;
        }
        if (leftSeq != rightSeq) {
            return leftSeq < rightSeq;
        }

        return leftUser < rightUser;
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
}
