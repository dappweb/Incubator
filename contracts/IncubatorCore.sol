// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract IncubatorCore is OwnableUpgradeable, PausableUpgradeable, UUPSUpgradeable {
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
    event UsdtDecimalsSynced(uint8 decimals);
    event PriceScaleMigrated(uint8 fromDecimals, uint8 toDecimals, uint256 machineUnitPrice, uint256 nodePrice, uint256 superNodePrice);

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
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ============ Main Functions ============

    function purchaseMachine(uint256 quantity) external whenNotPaused {
        require(quantity > 0 && quantity <= MAX_MACHINE_PER_ORDER, "invalid qty");
        require(referralOf[msg.sender] != address(0), "bind referrer first");

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

    function buyNode() external whenNotPaused {
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

        _registerParticipant(msg.sender);
        emit NodePurchased(msg.sender, nodePrice, identityId);
    }

    function buySuperNode() external whenNotPaused {
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
        _registerParticipant(msg.sender);
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
        delete referralOf[from];
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

    function syncParticipant(address account) external {
        _registerParticipant(account);
    }

    function setRewardWeight(address account, uint256 weight) external onlyOwner {
        require(account != address(0), "invalid account");
        rewardWeight[account] = weight;
        emit RewardWeightUpdated(account, weight);
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

    function roles(address user) external view returns (uint8) {
        return uint8(_getRole(user));
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

    function getLeaderboard(uint256 dayId)
        external
        view
        returns (address[10] memory topUsers, uint256[10] memory topVolumes, uint8 topCount, address[10] memory lastUsers, uint8 lastCount)
    {
        LeaderboardState storage board = leaderboards[dayId];
        return (board.topUsers, board.topVolumes, board.topCount, board.lastUsers, board.lastCount);
    }

    function currentDay() public view returns (uint256) {
        return block.timestamp / 1 days;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function updateMachineUnitPrice(uint256 newPrice) external onlyOwner {
        require(newPrice > 0 && newPrice <= _maxMachineUnitPrice(), "invalid price");
        uint256 old = machineUnitPrice;
        machineUnitPrice = newPrice;
        emit PriceUpdated("MACHINE", old, newPrice);
    }

    function updateNodePrice(uint256 newPrice) external onlyOwner {
        require(newPrice > 0 && newPrice <= _maxNodePrice(), "invalid price");
        uint256 old = nodePrice;
        nodePrice = newPrice;
        emit PriceUpdated("NODE", old, newPrice);
    }

    function updateSuperNodePrice(uint256 newPrice) external onlyOwner {
        require(newPrice > 0 && newPrice <= _maxSuperNodePrice(), "invalid price");
        uint256 old = superNodePrice;
        superNodePrice = newPrice;
        emit PriceUpdated("SUPER_NODE", old, newPrice);
    }

    /// @notice Refresh cached token decimals from the USDT contract.
    function syncUsdtTokenDecimals() external onlyOwner {
        uint8 decimals = IERC20Metadata(address(usdt)).decimals();
        usdtTokenDecimals = decimals;
        emit UsdtDecimalsSynced(decimals);
    }

    /// @notice One-time migration: rescale prices from `oldDecimals` to token decimals.
    function migratePriceScaleToTokenDecimals(uint8 oldDecimals) external onlyOwner {
        require(!usdtScaleMigrated, "already migrated");

        uint8 targetDecimals = IERC20Metadata(address(usdt)).decimals();
        usdtTokenDecimals = targetDecimals;

        if (targetDecimals > oldDecimals) {
            uint256 factorUp = _pow10(targetDecimals - oldDecimals);
            machineUnitPrice = machineUnitPrice * factorUp;
            nodePrice = nodePrice * factorUp;
            superNodePrice = superNodePrice * factorUp;
        } else if (targetDecimals < oldDecimals) {
            uint256 factorDown = _pow10(oldDecimals - targetDecimals);
            machineUnitPrice = machineUnitPrice / factorDown;
            nodePrice = nodePrice / factorDown;
            superNodePrice = superNodePrice / factorDown;
        }

        require(machineUnitPrice <= _maxMachineUnitPrice(), "machine price overflow");
        require(nodePrice <= _maxNodePrice(), "node price overflow");
        require(superNodePrice <= _maxSuperNodePrice(), "super price overflow");

        usdtScaleMigrated = true;
        emit PriceScaleMigrated(oldDecimals, targetDecimals, machineUnitPrice, nodePrice, superNodePrice);
    }

    function _effectiveUsdtDecimals() internal view returns (uint8) {
        // Legacy proxies used 6-decimal scaling before this variable existed.
        return usdtTokenDecimals == 0 ? 6 : usdtTokenDecimals;
    }

    function _pow10(uint8 exponent) internal pure returns (uint256) {
        require(exponent <= 77, "decimals too large");
        return 10 ** uint256(exponent);
    }

    function _usdtUnit() internal view returns (uint256) {
        return _pow10(_effectiveUsdtDecimals());
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

    function updatePoolRecipient(uint8 poolType, address newRecipient) external onlyOwner {
        require(poolType < poolConfigs.length, "invalid pool");
        require(newRecipient != address(0), "invalid recipient");

        poolConfigs[poolType].recipient = newRecipient;
        emit PoolConfigUpdated(poolType, newRecipient, poolConfigs[poolType].bps);
    }

    function updatePoolShare(uint8 poolType, uint16 newBps) external onlyOwner {
        require(poolType < poolConfigs.length, "invalid pool");
        require(newBps > 0, "invalid bps");

        uint16 oldBps = poolConfigs[poolType].bps;
        poolConfigs[poolType].bps = newBps;

        if (_poolShareTotal() != BPS_DENOMINATOR) {
            poolConfigs[poolType].bps = oldBps;
            revert("invalid pool total");
        }

        emit PoolConfigUpdated(poolType, poolConfigs[poolType].recipient, newBps);
    }

    function withdrawUSDT(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "invalid to");
        usdt.safeTransfer(to, amount);
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
            _settleLeaderboardTop(dayId, board, topAmount);
        }
        if (luckyAmount > 0) {
            _settleLeaderboardLucky(dayId, board, luckyAmount);
        }
    }

    function _settleLeaderboardTop(uint256 dayId, LeaderboardState storage board, uint256 total) private {
        uint32 shareDenominator = 0;
        for (uint8 i = 0; i < board.topCount; i++) {
            shareDenominator += rankShares[i];
        }
        require(shareDenominator > 0, "zero share denominator");

        uint256 distributed = 0;
        for (uint8 i = 0; i < board.topCount; i++) {
            address user = board.topUsers[i];
            if (user == address(0)) continue;

            uint256 amount;
            if (i == board.topCount - 1) {
                amount = total - distributed;
            } else {
                amount = (total * rankShares[i]) / shareDenominator;
            }
            if (amount > 0) {
                usdt.safeTransfer(user, amount);
                distributed += amount;
                emit LeaderboardSettled(dayId, user, i, amount);
            }
        }
    }

    function _settleLeaderboardLucky(uint256 dayId, LeaderboardState storage board, uint256 total) private {
        uint8 validCount = 0;
        for (uint8 i = 0; i < board.lastCount; i++) {
            if (board.lastUsers[i] != address(0)) {
                validCount += 1;
            }
        }
        require(validCount > 0, "no lucky board data");

        uint256 perRecipient = total / validCount;
        uint256 distributed = 0;
        uint8 paid = 0;

        for (uint8 i = 0; i < board.lastCount; i++) {
            address user = board.lastUsers[i];
            if (user == address(0)) continue;

            uint256 amount;
            if (paid == validCount - 1) {
                amount = total - distributed;
            } else {
                amount = perRecipient;
            }
            if (amount > 0) {
                usdt.safeTransfer(user, amount);
                distributed += amount;
                emit LeaderboardLuckySettled(dayId, user, paid, amount);
            }
            paid += 1;
        }
    }

    /// @notice Distribute accumulated node pool to the provided list of recipients.
    /// `shares` must be in BPS and sum to 10 000.
    /// Only works when the Node pool recipient was set to address(this).
    function settleNodeRewards(address[] calldata recipients, uint16[] calldata shares) external onlyOwner {
        _settleAccumulatedPool(PoolType.Node, recipients, shares);
    }

    /// @notice Distribute accumulated super-node pool to the provided list of recipients.
    /// `shares` must be in BPS and sum to 10 000.
    /// Only works when the SuperNode pool recipient was set to address(this).
    function settleSuperNodeRewards(address[] calldata recipients, uint16[] calldata shares) external onlyOwner {
        _settleAccumulatedPool(PoolType.SuperNode, recipients, shares);
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

    function _updateLeaderboard(uint256 dayId, address user, uint256 amount) private {
        LeaderboardState storage board = leaderboards[dayId];
        uint256 updatedVolume = dailyVolume[dayId][user] + amount;
        dailyVolume[dayId][user] = updatedVolume;

        _updateTop(board, user, updatedVolume);
        _updateLast(board, user);

        emit LeaderboardUpdated(dayId, user, updatedVolume);
    }

    function _updateTop(LeaderboardState storage board, address user, uint256 volume) private {
        uint8 index = _findTopIndex(board, user);

        if (index < 10) {
            board.topVolumes[index] = volume;
        } else if (board.topCount < 10) {
            board.topUsers[board.topCount] = user;
            board.topVolumes[board.topCount] = volume;
            board.topCount += 1;
        } else if (volume > board.topVolumes[board.topCount - 1]) {
            board.topUsers[board.topCount - 1] = user;
            board.topVolumes[board.topCount - 1] = volume;
        } else {
            return;
        }

        _sortTop(board);
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

    function _sortTop(LeaderboardState storage board) private {
        for (uint8 i = 0; i < board.topCount; i++) {
            for (uint8 j = i + 1; j < board.topCount; j++) {
                if (board.topVolumes[j] > board.topVolumes[i]) {
                    (board.topVolumes[i], board.topVolumes[j]) = (board.topVolumes[j], board.topVolumes[i]);
                    (board.topUsers[i], board.topUsers[j]) = (board.topUsers[j], board.topUsers[i]);
                }
            }
        }
    }

    function _findTopIndex(LeaderboardState storage board, address user) private view returns (uint8) {
        for (uint8 i = 0; i < board.topCount; i++) {
            if (board.topUsers[i] == user) {
                return i;
            }
        }

        return 10;
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
