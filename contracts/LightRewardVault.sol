// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title LightRewardVault
 * @notice Escrow contract that receives the 3%+7% LIGHT slice from SwapPoolManager
 *         on every LIGHT->ICO P7 swap, and exposes per-user claim() for
 *         super-node / node rewards allocated by an off-chain operator.
 * @dev    Non-upgradeable. Treasury can be replaced by owner setting a new
 *         `lightRewardTreasury` on SwapPoolManager.
 */
contract LightRewardVault is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable light;
    address public operator;

    mapping(address => uint256) public claimable;
    uint256 public totalPending;
    uint256 public totalClaimed;

    event OperatorUpdated(address indexed previous, address indexed next);
    event ClaimableSet(address indexed user, uint256 previous, uint256 next);
    event ClaimableAdded(address indexed user, uint256 amount, uint256 next);
    event Claimed(address indexed user, uint256 amount);
    event Rescued(address indexed token, address indexed to, uint256 amount);

    modifier onlyOperator() {
        require(msg.sender == operator || msg.sender == owner(), "NOT_OPERATOR");
        _;
    }

    constructor(address lightToken, address initialOwner) Ownable(initialOwner) {
        require(lightToken != address(0), "LIGHT_ZERO");
        light = IERC20(lightToken);
        operator = initialOwner;
        emit OperatorUpdated(address(0), initialOwner);
    }

    function setOperator(address next) external onlyOwner {
        address prev = operator;
        operator = next;
        emit OperatorUpdated(prev, next);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function setClaimable(address[] calldata users, uint256[] calldata amounts) external onlyOperator {
        require(users.length == amounts.length, "LEN");
        for (uint256 i = 0; i < users.length; i++) {
            address u = users[i];
            uint256 prev = claimable[u];
            uint256 next = amounts[i];
            claimable[u] = next;
            if (next >= prev) {
                totalPending += (next - prev);
            } else {
                totalPending -= (prev - next);
            }
            emit ClaimableSet(u, prev, next);
        }
    }

    function addClaimable(address[] calldata users, uint256[] calldata amounts) external onlyOperator {
        require(users.length == amounts.length, "LEN");
        uint256 sum;
        for (uint256 i = 0; i < users.length; i++) {
            uint256 amt = amounts[i];
            if (amt == 0) continue;
            address u = users[i];
            uint256 next = claimable[u] + amt;
            claimable[u] = next;
            sum += amt;
            emit ClaimableAdded(u, amt, next);
        }
        totalPending += sum;
    }

    function claim() external nonReentrant whenNotPaused returns (uint256 amount) {
        amount = claimable[msg.sender];
        require(amount > 0, "NOTHING");
        claimable[msg.sender] = 0;
        totalPending -= amount;
        totalClaimed += amount;
        light.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    function vaultBalance() external view returns (uint256) {
        return light.balanceOf(address(this));
    }

    function undistributedBalance() external view returns (uint256) {
        uint256 bal = light.balanceOf(address(this));
        if (bal <= totalPending) return 0;
        return bal - totalPending;
    }

    function rescue(address token, address to, uint256 amount) external onlyOwner {
        require(to != address(0), "TO_ZERO");
        IERC20(token).safeTransfer(to, amount);
        emit Rescued(token, to, amount);
    }
}
