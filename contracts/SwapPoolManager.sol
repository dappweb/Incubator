// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IERC20Burnable is IERC20 {
    function burn(uint256 amount) external;
}

contract SwapPoolManager is OwnableUpgradeable, PausableUpgradeable, ReentrancyGuard, UUPSUpgradeable {
    constructor() {
        _disableInitializers();
    }

    function initialize(address usdtAddress, address icoAddress, address lightAddress, address initialOwner) public initializer {
        require(usdtAddress != address(0), "invalid usdt");
        require(icoAddress != address(0), "invalid ico");
        require(lightAddress != address(0), "invalid light");
        __Ownable_init(initialOwner);
        __Pausable_init();

        usdt = IERC20(usdtAddress);
        ico = IERC20(icoAddress);
        light = IERC20(lightAddress);
        lightBurnBps = 6000;
        lightBootstrapBps = 3000;
        lightNodeBps = 700;
        lightSuperNodeBps = 300;
        lightBootstrapRecipient = initialOwner;
        lightNodeRecipient = initialOwner;
        lightSuperNodeRecipient = initialOwner;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
    using SafeERC20 for IERC20;

    uint16 public constant BPS_DENOMINATOR = 10_000;

    enum PairId {
        UsdtIco,
        LightIco
    }

    struct Pool {
        address token0;
        address token1;
        uint256 reserve0;
        uint256 reserve1;
        uint16 feeBps;
        uint16 maxPriceImpactBps;
        bool exists;
    }

    IERC20 public usdt;
    IERC20 public ico;
    IERC20 public light;

    uint16 public lightBurnBps;
    uint16 public lightBootstrapBps;
    uint16 public lightNodeBps;
    uint16 public lightSuperNodeBps;
    address public lightBootstrapRecipient;
    address public lightNodeRecipient;
    address public lightSuperNodeRecipient;

    mapping(uint8 => Pool) private pools;
    mapping(uint8 => mapping(address => uint256)) public feeVault;

    // === NEW VARIABLES (appended after existing layout) ===
    uint256 public lastLightSettlementDay;
    address public rewardController;

    // === Settlement cycle config ===
    uint256 public cycleDuration;  // seconds per cycle; 0 means default 1 day

    event PoolCreated(
        uint8 indexed pairId,
        address indexed token0,
        address indexed token1,
        uint16 feeBps,
        uint16 maxPriceImpactBps
    );
    event LiquidityAdded(uint8 indexed pairId, address indexed provider, uint256 amount0, uint256 amount1);
    event LiquidityRemoved(uint8 indexed pairId, address indexed to, uint256 amount0, uint256 amount1);
    event SwapExecuted(
        uint8 indexed pairId,
        address indexed trader,
        address indexed tokenIn,
        uint256 amountIn,
        address tokenOut,
        uint256 amountOut,
        uint256 fee,
        uint256 priceImpactBps
    );
    event FeeDistributed(uint8 indexed pairId, address indexed token, address indexed to, uint256 amount);
    event PoolConfigUpdated(uint8 indexed pairId, uint16 feeBps, uint16 maxPriceImpactBps);
    event LightFeeConfigUpdated(
        uint16 burnBps,
        uint16 bootstrapBps,
        uint16 nodeBps,
        uint16 superNodeBps,
        address indexed bootstrapRecipient,
        address indexed nodeRecipient,
        address indexed superNodeRecipient
    );
    event TokenBurned(address indexed token, uint256 amount, uint8 indexed pairId);
    event LightFeesSettled(
        uint256 totalAmount,
        uint256 burnedAmount,
        uint256 bootstrapAmount,
        uint256 nodeAmount,
        uint256 superNodeAmount
    );
    event LightSettlementTriggered(address indexed operator, uint256 indexed dayId, bool manual);
    event LightRewardWithdrawn(address indexed to, uint256 amount, uint256 remainingReserve);
    event RewardControllerUpdated(address indexed controller);
    event CycleDurationUpdated(uint256 oldDuration, uint256 newDuration);

    function createDefaultPools(uint16 feeBpsUsdtIco, uint16 feeBpsLightIco, uint16 maxPriceImpactBps) external onlyOwner {
        _createPool(uint8(PairId.UsdtIco), address(usdt), address(ico), feeBpsUsdtIco, maxPriceImpactBps);
        _createPool(uint8(PairId.LightIco), address(light), address(ico), feeBpsLightIco, maxPriceImpactBps);
    }

    function createPool(
        uint8 pairId,
        address token0,
        address token1,
        uint16 feeBps,
        uint16 maxPriceImpactBps
    ) external onlyOwner {
        _createPool(pairId, token0, token1, feeBps, maxPriceImpactBps);
    }

    function addLiquidity(uint8 pairId, uint256 amount0, uint256 amount1) external onlyOwner whenNotPaused {
        Pool storage pool = _getPoolStorage(pairId);
        require(amount0 > 0 && amount1 > 0, "invalid amount");

        IERC20(pool.token0).safeTransferFrom(msg.sender, address(this), amount0);
        IERC20(pool.token1).safeTransferFrom(msg.sender, address(this), amount1);

        pool.reserve0 += amount0;
        pool.reserve1 += amount1;

        emit LiquidityAdded(pairId, msg.sender, amount0, amount1);
    }

    function removeLiquidity(uint8 pairId, uint256 amount0, uint256 amount1, address to) external onlyOwner whenNotPaused {
        Pool storage pool = _getPoolStorage(pairId);
        require(to != address(0), "invalid to");
        require(amount0 <= pool.reserve0 && amount1 <= pool.reserve1, "insufficient reserve");

        pool.reserve0 -= amount0;
        pool.reserve1 -= amount1;

        IERC20(pool.token0).safeTransfer(to, amount0);
        IERC20(pool.token1).safeTransfer(to, amount1);

        emit LiquidityRemoved(pairId, to, amount0, amount1);
    }

    function quoteExactIn(uint8 pairId, address tokenIn, uint256 amountIn)
        public
        view
        returns (uint256 amountOut, uint256 fee, uint256 priceImpactBps)
    {
        require(amountIn > 0, "invalid in");

        Pool storage pool = _getPoolStorage(pairId);
        _validateSwapDirection(pairId, tokenIn);
        (bool zeroForOne, uint256 reserveIn, uint256 reserveOut) = _resolveDirection(pool, tokenIn);
        zeroForOne;

        require(reserveIn > 0 && reserveOut > 0, "no liquidity");

        fee = (amountIn * pool.feeBps) / BPS_DENOMINATOR;
        uint256 amountInAfterFee = amountIn - fee;
        require(amountInAfterFee > 0, "too small in");

        amountOut = _computeAmountOut(amountInAfterFee, reserveIn, reserveOut);

        uint256 noSlipOut = (amountInAfterFee * reserveOut) / reserveIn;
        if (noSlipOut > amountOut && noSlipOut > 0) {
            priceImpactBps = ((noSlipOut - amountOut) * BPS_DENOMINATOR) / noSlipOut;
        }
    }

    function swapExactIn(uint8 pairId, address tokenIn, uint256 amountIn, uint256 minOut, address to)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 amountOut)
    {
        require(to != address(0), "invalid to");

        Pool storage pool = _getPoolStorage(pairId);
        _validateSwapDirection(pairId, tokenIn);
        (bool zeroForOne, uint256 reserveIn, uint256 reserveOut) = _resolveDirection(pool, tokenIn);

        (uint256 quotedOut, uint256 fee, uint256 impact) = quoteExactIn(pairId, tokenIn, amountIn);
        require(quotedOut >= minOut, "slippage exceeded");
        require(impact <= pool.maxPriceImpactBps, "price impact exceeded");
        require(quotedOut < reserveOut, "insufficient reserve");

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        uint256 amountInAfterFee = amountIn - fee;
        address tokenOut = zeroForOne ? pool.token1 : pool.token0;
        IERC20(tokenOut).safeTransfer(to, quotedOut);

        if (zeroForOne) {
            pool.reserve0 = reserveIn + amountInAfterFee;
            pool.reserve1 = reserveOut - quotedOut;
        } else {
            pool.reserve1 = reserveIn + amountInAfterFee;
            pool.reserve0 = reserveOut - quotedOut;
        }

        feeVault[pairId][tokenIn] += fee;

        emit SwapExecuted(pairId, msg.sender, tokenIn, amountIn, tokenOut, quotedOut, fee, impact);
        return quotedOut;
    }

    function distributeFees(uint8 pairId, address token, address[] calldata recipients, uint16[] calldata bps) external onlyOwner {
        require(recipients.length == bps.length, "invalid length");
        require(recipients.length > 0, "empty recipients");

        uint256 totalAmount = feeVault[pairId][token];
        require(totalAmount > 0, "no fee");

        uint16 totalBps;
        uint256 distributed;

        for (uint256 i = 0; i < recipients.length; i++) {
            address recipient = recipients[i];
            require(recipient != address(0), "invalid recipient");
            totalBps += bps[i];

            uint256 amount = i == recipients.length - 1 ? totalAmount - distributed : (totalAmount * bps[i]) / BPS_DENOMINATOR;
            if (amount == 0) {
                continue;
            }

            distributed += amount;
            IERC20(token).safeTransfer(recipient, amount);
            emit FeeDistributed(pairId, token, recipient, amount);
        }

        require(totalBps == BPS_DENOMINATOR, "invalid bps total");
        feeVault[pairId][token] = 0;
    }

    function updateLightFeeConfig(
        uint16 burnBps,
        uint16 bootstrapBps,
        uint16 nodeBps,
        uint16 superNodeBps,
        address bootstrapRecipient,
        address nodeRecipient,
        address superNodeRecipient
    ) external onlyOwner {
        require(bootstrapRecipient != address(0), "invalid bootstrap recipient");
        require(nodeRecipient != address(0), "invalid node recipient");
        require(superNodeRecipient != address(0), "invalid super recipient");
        require(
            uint256(burnBps) + uint256(bootstrapBps) + uint256(nodeBps) + uint256(superNodeBps) == BPS_DENOMINATOR,
            "invalid light bps total"
        );

        lightBurnBps = burnBps;
        lightBootstrapBps = bootstrapBps;
        lightNodeBps = nodeBps;
        lightSuperNodeBps = superNodeBps;
        lightBootstrapRecipient = bootstrapRecipient;
        lightNodeRecipient = nodeRecipient;
        lightSuperNodeRecipient = superNodeRecipient;

        emit LightFeeConfigUpdated(
            burnBps,
            bootstrapBps,
            nodeBps,
            superNodeBps,
            bootstrapRecipient,
            nodeRecipient,
            superNodeRecipient
        );
    }

    function settleLightFees() external onlyOwner whenNotPaused {
        uint256 dayId = _currentDay();
        uint8 pairId = uint8(PairId.LightIco);
        uint256 totalAmount = feeVault[pairId][address(light)];
        require(totalAmount > 0, "no light fee");

        _settleLightFees(dayId, totalAmount);
        emit LightSettlementTriggered(msg.sender, dayId, true);
    }

    function settleLightFeesIfDue() external whenNotPaused returns (bool settled) {
        uint256 dayId = _currentDay();
        if (dayId <= lastLightSettlementDay) {
            return false;
        }

        uint8 pairId = uint8(PairId.LightIco);
        uint256 totalAmount = feeVault[pairId][address(light)];
        if (totalAmount == 0) {
            return false;
        }

        _settleLightFees(dayId, totalAmount);
        emit LightSettlementTriggered(msg.sender, dayId, false);
        return true;
    }

    function _settleLightFees(uint256 dayId, uint256 totalAmount) private {
        require(dayId > lastLightSettlementDay, "already settled today");

        uint8 pairId = uint8(PairId.LightIco);

        uint256 burnedAmount = (totalAmount * lightBurnBps) / BPS_DENOMINATOR;
        uint256 bootstrapAmount = (totalAmount * lightBootstrapBps) / BPS_DENOMINATOR;
        uint256 nodeAmount = (totalAmount * lightNodeBps) / BPS_DENOMINATOR;
        uint256 superNodeAmount = totalAmount - burnedAmount - bootstrapAmount - nodeAmount;

        feeVault[pairId][address(light)] = 0;

        if (burnedAmount > 0) {
            IERC20Burnable(address(light)).burn(burnedAmount);
            emit TokenBurned(address(light), burnedAmount, pairId);
        }

        if (bootstrapAmount > 0) {
            light.safeTransfer(lightBootstrapRecipient, bootstrapAmount);
            emit FeeDistributed(pairId, address(light), lightBootstrapRecipient, bootstrapAmount);
        }

        if (nodeAmount > 0) {
            light.safeTransfer(lightNodeRecipient, nodeAmount);
            emit FeeDistributed(pairId, address(light), lightNodeRecipient, nodeAmount);
        }

        if (superNodeAmount > 0) {
            light.safeTransfer(lightSuperNodeRecipient, superNodeAmount);
            emit FeeDistributed(pairId, address(light), lightSuperNodeRecipient, superNodeAmount);
        }

        lastLightSettlementDay = dayId;
        emit LightFeesSettled(totalAmount, burnedAmount, bootstrapAmount, nodeAmount, superNodeAmount);
    }

    function _currentDay() private view returns (uint256) {
        uint256 dur = cycleDuration == 0 ? 1 days : cycleDuration;
        return block.timestamp / dur;
    }

    function updatePoolConfig(uint8 pairId, uint16 feeBps, uint16 maxPriceImpactBps) external onlyOwner {
        require(feeBps <= 2_000, "fee too high");
        require(maxPriceImpactBps > 0 && maxPriceImpactBps <= BPS_DENOMINATOR, "invalid impact");

        Pool storage pool = _getPoolStorage(pairId);
        pool.feeBps = feeBps;
        pool.maxPriceImpactBps = maxPriceImpactBps;

        emit PoolConfigUpdated(pairId, feeBps, maxPriceImpactBps);
    }

    function setUsdtAddress(address newUsdtAddress) external onlyOwner {
        require(newUsdtAddress != address(0), "invalid usdt address");
        usdt = IERC20(newUsdtAddress);
    }

    function setPairTokens(uint8 pairId, address token0, address token1) external onlyOwner {
        require(token0 != address(0) && token1 != address(0), "invalid token addresses");
        require(token0 != token1, "tokens must be different");
        Pool storage pool = _getPoolStorage(pairId);
        pool.token0 = token0;
        pool.token1 = token1;
    }

    function getPool(uint8 pairId)
        external
        view
        returns (
            address token0,
            address token1,
            uint256 reserve0,
            uint256 reserve1,
            uint16 feeBps,
            uint16 maxPriceImpactBps,
            bool exists
        )
    {
        Pool storage pool = pools[pairId];
        return (pool.token0, pool.token1, pool.reserve0, pool.reserve1, pool.feeBps, pool.maxPriceImpactBps, pool.exists);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setRewardController(address controller) external onlyOwner {
        rewardController = controller;
        emit RewardControllerUpdated(controller);
    }

    function setCycleDuration(uint256 newDuration) external onlyOwner {
        require(newDuration >= 60 || newDuration == 0, "cycle too short");
        uint256 old = cycleDuration;
        cycleDuration = newDuration;
        emit CycleDurationUpdated(old, newDuration);
    }

    function withdrawLightForRewards(uint256 amount) external whenNotPaused {
        require(msg.sender == rewardController, "not authorized");
        require(amount > 0, "invalid amount");
        Pool storage pool = pools[uint8(PairId.LightIco)];
        require(pool.exists, "pool not found");
        require(amount <= pool.reserve0, "insufficient reserve");

        pool.reserve0 -= amount;
        light.safeTransfer(msg.sender, amount);

        emit LightRewardWithdrawn(msg.sender, amount, pool.reserve0);
    }

    function _createPool(
        uint8 pairId,
        address token0,
        address token1,
        uint16 feeBps,
        uint16 maxPriceImpactBps
    ) private {
        require(token0 != address(0) && token1 != address(0), "invalid token");
        require(token0 != token1, "same token");
        require(!pools[pairId].exists, "pair exists");
        require(feeBps <= 2_000, "fee too high");
        require(maxPriceImpactBps > 0 && maxPriceImpactBps <= BPS_DENOMINATOR, "invalid impact");

        pools[pairId] = Pool({
            token0: token0,
            token1: token1,
            reserve0: 0,
            reserve1: 0,
            feeBps: feeBps,
            maxPriceImpactBps: maxPriceImpactBps,
            exists: true
        });

        emit PoolCreated(pairId, token0, token1, feeBps, maxPriceImpactBps);
    }

    function _computeAmountOut(uint256 amountInAfterFee, uint256 reserveIn, uint256 reserveOut) private pure returns (uint256) {
        return (reserveOut * amountInAfterFee) / (reserveIn + amountInAfterFee);
    }

    function _resolveDirection(Pool storage pool, address tokenIn)
        private
        view
        returns (bool zeroForOne, uint256 reserveIn, uint256 reserveOut)
    {
        if (tokenIn == pool.token0) {
            return (true, pool.reserve0, pool.reserve1);
        }
        if (tokenIn == pool.token1) {
            return (false, pool.reserve1, pool.reserve0);
        }
        revert("token not in pair");
    }

    function _validateSwapDirection(uint8 pairId, address tokenIn) private view {
        if (pairId == uint8(PairId.LightIco)) {
            require(tokenIn == address(light), "LIGHT->ICO only");
        }
    }

    function _getPoolStorage(uint8 pairId) private view returns (Pool storage pool) {
        pool = pools[pairId];
        require(pool.exists, "pair not found");
    }
}
