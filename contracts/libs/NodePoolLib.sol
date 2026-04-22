// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice External library implementing the weighted Node/SuperNode pool
/// distributor. Linked into IncubatorCore at deploy time.
library NodePoolLib {
    using SafeERC20 for IERC20;

    uint8 internal constant POOL_NODE = 3;
    uint8 internal constant POOL_SUPER_NODE = 2;

    event PoolRewardSettled(uint8 indexed poolType, address indexed beneficiary, uint256 amountUSDT);
    event NodePoolSettledOnChain(uint256 indexed dayId, uint256 poolBalance, uint256 totalWeight, uint256 participantCount);
    event SuperNodePoolSettledOnChain(uint256 indexed dayId, uint256 poolBalance, uint256 totalWeight, uint256 participantCount);

    function _weight(
        address acc,
        mapping(address => uint256) storage teamTotalVolume,
        mapping(address => uint256) storage maxBranchVolume
    ) private view returns (uint256) {
        uint256 total = teamTotalVolume[acc];
        uint256 maxBranch = maxBranchVolume[acc];
        // 小区业绩 = 团队总业绩 - 最大区
        return total > maxBranch ? total - maxBranch : 0;
    }

    /// @notice Distribute `poolAccumulated[poolType]` across nodeList ∪ superNodeList
    /// weighted by 小区业绩 (= teamTotalVolume - maxBranchVolume). For Node pool
    /// `includeNodeList` is true; for SuperNode pool only superNodeList participates.
    function distribute(
        uint8 poolType,
        uint256 dayId,
        bool includeNodeList,
        uint256 minPoolSettleAmount,
        mapping(uint8 => uint256) storage poolAccumulated,
        address[] storage nodeList,
        address[] storage superNodeList,
        mapping(address => uint256) storage teamTotalVolume,
        mapping(address => uint256) storage maxBranchVolume,
        IERC20 usdt
    ) external returns (bool) {
        uint256 pool = poolAccumulated[poolType];
        if (pool < minPoolSettleAmount || pool == 0) return false;

        uint256 lenA = includeNodeList ? nodeList.length : 0;
        uint256 lenB = superNodeList.length;
        uint256 total = lenA + lenB;
        if (total == 0) return false;

        uint256 totalWeight;
        for (uint256 i = 0; i < lenA; i++) {
            totalWeight += _weight(nodeList[i], teamTotalVolume, maxBranchVolume);
        }
        for (uint256 j = 0; j < lenB; j++) {
            totalWeight += _weight(superNodeList[j], teamTotalVolume, maxBranchVolume);
        }
        if (totalWeight == 0) return false;

        poolAccumulated[poolType] = 0;

        uint256 distributed;
        uint256 lastK = total - 1;
        uint256 k;
        for (uint256 i = 0; i < lenA; i++) {
            address acc = nodeList[i];
            uint256 amount = (k == lastK)
                ? pool - distributed
                : (pool * _weight(acc, teamTotalVolume, maxBranchVolume)) / totalWeight;
            if (amount > 0) {
                usdt.safeTransfer(acc, amount);
                distributed += amount;
                emit PoolRewardSettled(poolType, acc, amount);
            }
            k++;
        }
        for (uint256 j = 0; j < lenB; j++) {
            address acc = superNodeList[j];
            uint256 amount = (k == lastK)
                ? pool - distributed
                : (pool * _weight(acc, teamTotalVolume, maxBranchVolume)) / totalWeight;
            if (amount > 0) {
                usdt.safeTransfer(acc, amount);
                distributed += amount;
                emit PoolRewardSettled(poolType, acc, amount);
            }
            k++;
        }

        if (poolType == POOL_NODE) {
            emit NodePoolSettledOnChain(dayId, pool, totalWeight, total);
        } else {
            emit SuperNodePoolSettledOnChain(dayId, pool, totalWeight, total);
        }
        return true;
    }
}
