// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice External library housing the leaderboard pool settlement logic.
/// Deployed once and linked via `libraries: { LeaderboardLib: <addr> }`. Calls
/// from IncubatorCore are DELEGATECALLed so state reads/writes use the caller's
/// storage slots.
library LeaderboardLib {
    using SafeERC20 for IERC20;

    uint16 internal constant BPS_DENOMINATOR = 10_000;
    uint16 internal constant LEADERBOARD_TOP_SHARE_BPS = 7_500;

    // Layout MUST match IncubatorCore.LeaderboardState exactly.
    struct LeaderboardState {
        address[10] topUsers;
        uint256[10] topVolumes;
        uint8 topCount;
        address[10] lastUsers;
        uint8 lastCount;
    }

    // Pool type id matching IncubatorCore.PoolType.Leaderboard (== 5).
    uint8 internal constant POOL_LEADERBOARD = 5;

    // Events must be declared in the library but fire with the caller as emitter
    // because DELEGATECALL keeps the caller's address. Signatures mirror the ones
    // in IncubatorCore so downstream indexers continue to work.
    event LeaderboardSettled(uint256 indexed dayId, address indexed user, uint8 rank, uint256 amountUSDT);
    event LeaderboardLuckySettled(uint256 indexed dayId, address indexed user, uint8 luckyRank, uint256 amountUSDT);
    event LeaderboardWhitelistSettled(uint256 indexed dayId, address indexed user, bool indexed isTopPool, uint256 amountUSDT);
    event LeaderboardPoolSettledOnChain(uint256 indexed dayId, uint256 poolBalance);

    /// @notice Distribute the accumulated leaderboard pool for `dayId`.
    /// Mirrors the previous in-contract settleLeaderboard logic.
    function settle(
        uint256 dayId,
        mapping(uint8 => uint256) storage poolAccumulated,
        mapping(uint256 => LeaderboardState) storage leaderboards,
        mapping(uint256 => bool) storage leaderboardSettledDay,
        uint16[10] storage rankShares,
        address[] storage leaderboardWhitelist,
        uint8 adjustPct,
        IERC20 usdt
    ) external {
        require(!leaderboardSettledDay[dayId], "already settled");
        uint256 total = poolAccumulated[POOL_LEADERBOARD];
        require(total > 0, "no leaderboard balance");

        LeaderboardState storage board = leaderboards[dayId];
        require(board.topCount > 0 || board.lastCount > 0, "no board data for day");

        leaderboardSettledDay[dayId] = true;
        poolAccumulated[POOL_LEADERBOARD] = 0;

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
            _settleRanking(dayId, board, topAmount, true, rankShares, leaderboardWhitelist, adjustPct, usdt);
        }
        if (luckyAmount > 0) {
            _settleRanking(dayId, board, luckyAmount, false, rankShares, leaderboardWhitelist, adjustPct, usdt);
        }

        emit LeaderboardPoolSettledOnChain(dayId, total);
    }

    function _settleRanking(
        uint256 dayId,
        LeaderboardState storage board,
        uint256 total,
        bool isTopPool,
        uint16[10] storage rankShares,
        address[] storage leaderboardWhitelist,
        uint8 adjustPct,
        IERC20 usdt
    ) private {
        uint8 count = isTopPool ? board.topCount : board.lastCount;
        require(count > 0, "no board data");

        uint256 whitelistAmount = _settleWhitelist(dayId, total, isTopPool, leaderboardWhitelist, adjustPct, usdt);
        uint256 rankTotal = total - whitelistAmount;

        uint16 adjustBps = uint16(adjustPct) * 100;
        require(rankShares[0] >= adjustBps, "invalid first-rank adjustment");
        uint16 firstShare = rankShares[0] - adjustBps;

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

    function _settleWhitelist(
        uint256 dayId,
        uint256 total,
        bool isTopPool,
        address[] storage leaderboardWhitelist,
        uint8 adjustPct,
        IERC20 usdt
    ) private returns (uint256 whitelistAmount) {
        if (leaderboardWhitelist.length == 0 || adjustPct == 0 || total == 0) {
            return 0;
        }

        whitelistAmount = (total * uint256(adjustPct)) / 100;
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

    /// @notice Insert/update `user` with `volume` into the top-10 ranking on `board`.
    /// Handles the replace / append / reject path and then stable-sorts the perturbed entry.
    function updateTop(
        uint256 dayId,
        LeaderboardState storage board,
        address user,
        uint256 volume,
        mapping(uint256 => mapping(address => uint256)) storage dailyFirstOrderSeq
    ) external {
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
        } else if (_isBetter(
            dayId, user, volume,
            board.topUsers[board.topCount - 1], board.topVolumes[board.topCount - 1],
            dailyFirstOrderSeq
        )) {
            board.topUsers[board.topCount - 1] = user;
            board.topVolumes[board.topCount - 1] = volume;
            targetIndex = board.topCount - 1;
        } else {
            return;
        }

        _sortTop(dayId, board, targetIndex, dailyFirstOrderSeq);
    }

    function _sortTop(
        uint256 dayId,
        LeaderboardState storage board,
        uint8 startIndex,
        mapping(uint256 => mapping(address => uint256)) storage dailyFirstOrderSeq
    ) private {
        uint8 cursor = startIndex;
        while (cursor > 0) {
            if (_isBetter(
                dayId,
                board.topUsers[cursor], board.topVolumes[cursor],
                board.topUsers[cursor - 1], board.topVolumes[cursor - 1],
                dailyFirstOrderSeq
            )) {
                (board.topVolumes[cursor], board.topVolumes[cursor - 1]) = (board.topVolumes[cursor - 1], board.topVolumes[cursor]);
                (board.topUsers[cursor], board.topUsers[cursor - 1]) = (board.topUsers[cursor - 1], board.topUsers[cursor]);
                cursor -= 1;
            } else {
                break;
            }
        }

        while (cursor + 1 < board.topCount) {
            if (_isBetter(
                dayId,
                board.topUsers[cursor + 1], board.topVolumes[cursor + 1],
                board.topUsers[cursor], board.topVolumes[cursor],
                dailyFirstOrderSeq
            )) {
                (board.topVolumes[cursor + 1], board.topVolumes[cursor]) = (board.topVolumes[cursor], board.topVolumes[cursor + 1]);
                (board.topUsers[cursor + 1], board.topUsers[cursor]) = (board.topUsers[cursor], board.topUsers[cursor + 1]);
                cursor += 1;
            } else {
                break;
            }
        }
    }

    function _isBetter(
        uint256 dayId,
        address leftUser,
        uint256 leftVolume,
        address rightUser,
        uint256 rightVolume,
        mapping(uint256 => mapping(address => uint256)) storage dailyFirstOrderSeq
    ) private view returns (bool) {
        if (leftVolume > rightVolume) return true;
        if (leftVolume < rightVolume) return false;
        uint256 leftSeq = dailyFirstOrderSeq[dayId][leftUser];
        uint256 rightSeq = dailyFirstOrderSeq[dayId][rightUser];
        if (leftSeq == 0 || rightSeq == 0) return leftUser < rightUser;
        if (leftSeq != rightSeq) return leftSeq < rightSeq;
        return leftUser < rightUser;
    }
}
