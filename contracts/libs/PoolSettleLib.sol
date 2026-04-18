// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Helper library for legacy manual pool settlement and the one-shot
/// role-list bootstrap migration. Both are rarely called, so routing them
/// through a DELEGATECALL is an acceptable gas trade-off for bytecode savings.
library PoolSettleLib {
    using SafeERC20 for IERC20;

    uint16 internal constant BPS_DENOMINATOR = 10_000;

    event PoolRewardSettled(uint8 indexed poolType, address indexed beneficiary, uint256 amountUSDT);

    /// @notice Owner-controlled weighted split of `poolAccumulated[poolType]`.
    function settleAccumulatedPool(
        uint8 poolType,
        address[] calldata recipients,
        uint16[] calldata shares,
        mapping(uint8 => uint256) storage poolAccumulated,
        IERC20 usdt
    ) external {
        require(recipients.length > 0 && recipients.length == shares.length, "length mismatch");

        uint32 shareTotal = 0;
        for (uint256 i = 0; i < shares.length; i++) {
            shareTotal += shares[i];
        }
        require(shareTotal == BPS_DENOMINATOR, "shares must sum to 10000");

        uint256 total = poolAccumulated[poolType];
        require(total > 0, "no pool balance");

        poolAccumulated[poolType] = 0;

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
                emit PoolRewardSettled(poolType, recipients[i], amount);
            }
        }
    }
}
