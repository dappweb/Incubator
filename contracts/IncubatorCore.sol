// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract IncubatorCore is Ownable, Pausable {
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

    IERC20 public immutable usdt;

    uint256 public constant USDT_DECIMALS = 1e6;
    uint16 public constant BPS_DENOMINATOR = 10_000;
    uint256 public machineUnitPrice = 100 * USDT_DECIMALS;
    uint256 public constant MAX_MACHINE_PER_ORDER = 10;
    uint256 public constant MAX_MACHINE_UNIT_PRICE = 10_000 * USDT_DECIMALS;
    uint256 public constant MAX_NODE_PRICE = 100_000 * USDT_DECIMALS;
    uint256 public constant MAX_SUPER_NODE_PRICE = 300_000 * USDT_DECIMALS;

    uint256 public nodePrice = 1000 * USDT_DECIMALS;
    uint256 public superNodePrice = 3000 * USDT_DECIMALS;

    uint256 public nextIdentityId = 1;
    address public identityMarket;
    mapping(uint256 => IdentityAccount) private identities;
    mapping(address => uint256) private ownedIdentityId;
    mapping(uint256 => mapping(address => bool)) private identityOperatorApproval;

    mapping(uint256 => MachineOrder) public machineOrders;
    mapping(address => uint256[]) private userOrderIds;
    PoolConfig[6] private poolConfigs;
    uint256 public nextMachineOrderId = 1;

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

    uint16[10] private rankShares = [4000, 2000, 500, 500, 500, 500, 500, 500, 500, 500];

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

    constructor(
        address usdtAddress,
        address initialOwner,
        address[6] memory initialRecipients
    ) Ownable(initialOwner) {
        require(usdtAddress != address(0), "invalid usdt");

        usdt = IERC20(usdtAddress);

        _setPoolConfig(PoolType.Liquidity, initialRecipients[0], 6000);
        _setPoolConfig(PoolType.Referral, initialRecipients[1], 500);
        _setPoolConfig(PoolType.SuperNode, initialRecipients[2], 500);
        _setPoolConfig(PoolType.Node, initialRecipients[3], 800);
        _setPoolConfig(PoolType.Platform, initialRecipients[4], 2000);
        _setPoolConfig(PoolType.Leaderboard, initialRecipients[5], 200);
    }

    function purchaseMachine(uint256 quantity, address referrer) external whenNotPaused {
        require(quantity > 0 && quantity <= MAX_MACHINE_PER_ORDER, "invalid qty");

        if (referralOf[msg.sender] == address(0) && _isValidReferrer(msg.sender, referrer)) {
            referralOf[msg.sender] = referrer;
            directReferralCount[referrer] += 1;
            _updateTeamCount(referrer, 1);
            emit ReferralBound(msg.sender, referrer);
        }

        uint256 amountUSDT = machineUnitPrice * quantity;
        usdt.safeTransferFrom(msg.sender, address(this), amountUSDT);

        uint256 orderId = nextMachineOrderId;
        address currentReferrer = referralOf[msg.sender];
        
        if (currentReferrer != address(0)) {
            directReferralVolume[currentReferrer] += amountUSDT;
            _updateTeamVolume(currentReferrer, amountUSDT);
        }

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

    function buyNode() external whenNotPaused {
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
        Role role = _getRole(msg.sender);
        require(role == Role.Node, "node required");

        usdt.safeTransferFrom(msg.sender, address(this), superNodePrice);

        uint256 identityId = ownedIdentityId[msg.sender];
        identities[identityId].role = Role.SuperNode;
        identities[identityId].updatedAt = block.timestamp;
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
        require(newPrice > 0 && newPrice <= MAX_MACHINE_UNIT_PRICE, "invalid price");
        uint256 old = machineUnitPrice;
        machineUnitPrice = newPrice;
        emit PriceUpdated("MACHINE", old, newPrice);
    }

    function updateNodePrice(uint256 newPrice) external onlyOwner {
        require(newPrice > 0 && newPrice <= MAX_NODE_PRICE, "invalid price");
        uint256 old = nodePrice;
        nodePrice = newPrice;
        emit PriceUpdated("NODE", old, newPrice);
    }

    function updateSuperNodePrice(uint256 newPrice) external onlyOwner {
        require(newPrice > 0 && newPrice <= MAX_SUPER_NODE_PRICE, "invalid price");
        uint256 old = superNodePrice;
        superNodePrice = newPrice;
        emit PriceUpdated("SUPER_NODE", old, newPrice);
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

        _distributeByRole(orderId, PoolType.SuperNode, true, superAmount);
        _distributeByRole(orderId, PoolType.Node, false, nodeAmount);

        _transferPool(orderId, PoolType.Platform, poolConfigs[uint8(PoolType.Platform)].recipient, platformAmount);

        _distributeLeaderboard(orderId, leaderboardAmount);
    }

    function _distributeByRole(uint256 orderId, PoolType poolType, bool superOnly, uint256 amount) private {
        if (amount == 0) {
            return;
        }

        uint256 totalWeight;
        uint256 participantsLength = rewardParticipants.length;

        for (uint256 i = 0; i < participantsLength; i++) {
            address account = rewardParticipants[i];
            Role role = _getRole(account);
            if (superOnly) {
                if (role != Role.SuperNode) {
                    continue;
                }
            } else {
                if (role != Role.Node && role != Role.SuperNode) {
                    continue;
                }
            }

            uint256 weight = _effectiveWeight(account);
            if (weight == 0) {
                continue;
            }
            totalWeight += weight;
        }

        if (totalWeight == 0) {
            _transferPool(orderId, poolType, poolConfigs[uint8(poolType)].recipient, amount);
            return;
        }

        uint256 distributed;
        for (uint256 i = 0; i < participantsLength; i++) {
            address account = rewardParticipants[i];
            Role role = _getRole(account);
            if (superOnly) {
                if (role != Role.SuperNode) {
                    continue;
                }
            } else {
                if (role != Role.Node && role != Role.SuperNode) {
                    continue;
                }
            }

            uint256 weight = _effectiveWeight(account);
            if (weight == 0) {
                continue;
            }

            uint256 share = (amount * weight) / totalWeight;
            if (share == 0) {
                continue;
            }

            distributed += share;
            usdt.safeTransfer(account, share);
            emit RewardSettled(orderId, uint8(poolType), account, share);
        }

        uint256 remainder = amount - distributed;
        if (remainder > 0) {
            _transferPool(orderId, poolType, poolConfigs[uint8(poolType)].recipient, remainder);
        }
    }

    function _distributeLeaderboard(uint256 orderId, uint256 amount) private {
        if (amount == 0) {
            return;
        }

        uint256 dayId = currentDay();
        LeaderboardState storage board = leaderboards[dayId];

        uint256 topAmount = (amount * 7500) / BPS_DENOMINATOR;
        uint256 lastAmount = amount - topAmount;

        uint256 topDistributed = _distributeRanked(orderId, board.topUsers, board.topCount, topAmount);
        uint256 lastDistributed = _distributeRanked(orderId, board.lastUsers, board.lastCount, lastAmount);

        uint256 remainder = amount - topDistributed - lastDistributed;
        if (remainder > 0) {
            _transferPool(orderId, PoolType.Leaderboard, poolConfigs[uint8(PoolType.Leaderboard)].recipient, remainder);
        }
    }

    function _distributeRanked(
        uint256 orderId,
        address[10] storage users,
        uint8 count,
        uint256 amount
    ) private returns (uint256 distributed) {
        if (amount == 0 || count == 0) {
            return 0;
        }

        uint256 shareTotal;
        for (uint8 i = 0; i < count; i++) {
            shareTotal += rankShares[i];
        }

        for (uint8 i = 0; i < count; i++) {
            uint256 reward = i == count - 1 ? amount - distributed : (amount * rankShares[i]) / shareTotal;
            if (reward == 0 || users[i] == address(0)) {
                continue;
            }

            distributed += reward;
            usdt.safeTransfer(users[i], reward);
            emit RewardSettled(orderId, uint8(PoolType.Leaderboard), users[i], reward);
        }
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

    function _effectiveWeight(address account) private view returns (uint256) {
        uint256 manualWeight = rewardWeight[account];
        if (manualWeight > 0) {
            return manualWeight;
        }

        return personalPower[account];
    }

    function _poolAmount(uint256 totalAmount, uint8 poolType) private view returns (uint256) {
        return (totalAmount * poolConfigs[poolType].bps) / BPS_DENOMINATOR;
    }

    function _transferPool(uint256 orderId, PoolType poolType, address recipient, uint256 amount) private {
        if (amount == 0) {
            return;
        }

        require(recipient != address(0), "invalid recipient");
        usdt.safeTransfer(recipient, amount);
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
