// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IERC20BurnableExt is IERC20 {
    function burn(uint256 amount) external;
}

interface IRouterV2Like {
    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts);

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

interface IFactoryV2Like {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}

interface IPairV2Like {
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);

    function token0() external view returns (address);

    function token1() external view returns (address);
}

contract PrimarySwapController is OwnableUpgradeable, ReentrancyGuard, UUPSUpgradeable {
    using SafeERC20 for IERC20;

    uint16 public constant BPS_DENOMINATOR = 10_000;
    uint16 public constant DEFAULT_BUY_FEE_BPS = 500;
    uint16 public constant DEFAULT_SELL_FEE_BPS = 500;
    uint16 public constant DEFAULT_SUPER_NODE_FEE_BPS = 100;
    uint16 public constant DEFAULT_NODE_POOL_FEE_BPS = 200;
    uint16 public constant DEFAULT_PLATFORM_FEE_BPS = 200;
    uint16 public constant DEFAULT_SELL_BURN_BPS = 1000;
    uint16 public constant DEFAULT_SELL_PLATFORM_ICO_BPS = 2000;
    uint16 public constant DEFAULT_SELL_LIQUIDITY_ICO_BPS = 7000;

    IERC20 public usdt;
    IERC20BurnableExt public ico;
    IRouterV2Like public router;
    IFactoryV2Like public factory;
    address public pair;

    address public superNodeFeeRecipient;
    address public nodePoolFeeRecipient;
    address public platformRecipient;

    uint16 public buyFeeBps;
    uint16 public sellFeeBps;
    uint16 public superNodeFeeBps;
    uint16 public nodePoolFeeBps;
    uint16 public platformFeeBps;

    uint16 public sellBurnBps;
    uint16 public sellPlatformIcoBps;
    uint16 public sellLiquidityIcoBps;

    bool public sellUsdtEnabled;
    uint256 public minUsdtReserveToEnableSell;
    uint256 public minIcoHolderCountToEnableSell;
    uint256 public reportedIcoHolderCount;

    event BuyFeeConfigUpdated(uint16 buyFeeBps, uint16 superNodeFeeBps, uint16 nodePoolFeeBps, uint16 platformFeeBps);
    event SellConfigUpdated(uint16 sellFeeBps, uint16 burnBps, uint16 platformIcoBps, uint16 liquidityIcoBps);
    event ThresholdConfigUpdated(uint256 minUsdtReserveToEnableSell, uint256 minIcoHolderCountToEnableSell);
    event RecipientsUpdated(address indexed superNodeFeeRecipient, address indexed nodePoolFeeRecipient, address indexed platformRecipient);
    event PairUpdated(address indexed pair);
    event IcoHolderCountReported(uint256 holderCount);
    event SellUsdtEnabledUpdated(bool enabled);
    event UsdtAddressUpdated(address indexed oldUsdt, address indexed newUsdt, address indexed pair);
    event PrimaryBuyExecuted(address indexed buyer, uint256 amountInUsdt, uint256 feeUsdt, uint256 amountOutIco);
    event PrimarySellExecuted(
        address indexed seller,
        uint256 amountInIco,
        uint256 burnAmountIco,
        uint256 platformAmountIco,
        uint256 liquidityAmountIco,
        uint256 grossUsdtOut,
        uint256 feeUsdt,
        uint256 netUsdtOut
    );
    event TreasuryWithdrawn(address indexed token, address indexed to, uint256 amount);

    constructor() {
        _disableInitializers();
    }

    function initialize(
        address usdtAddress,
        address icoAddress,
        address routerAddress,
        address factoryAddress,
        address initialOwner,
        address[3] memory recipients
    ) public initializer {
        require(usdtAddress != address(0), "invalid usdt");
        require(icoAddress != address(0), "invalid ico");
        require(routerAddress != address(0), "invalid router");
        require(factoryAddress != address(0), "invalid factory");
        require(recipients[0] != address(0) && recipients[1] != address(0) && recipients[2] != address(0), "invalid recipient");

        __Ownable_init(initialOwner);

        usdt = IERC20(usdtAddress);
        ico = IERC20BurnableExt(icoAddress);
        router = IRouterV2Like(routerAddress);
        factory = IFactoryV2Like(factoryAddress);

        superNodeFeeRecipient = recipients[0];
        nodePoolFeeRecipient = recipients[1];
        platformRecipient = recipients[2];

        buyFeeBps = DEFAULT_BUY_FEE_BPS;
        sellFeeBps = DEFAULT_SELL_FEE_BPS;
        superNodeFeeBps = DEFAULT_SUPER_NODE_FEE_BPS;
        nodePoolFeeBps = DEFAULT_NODE_POOL_FEE_BPS;
        platformFeeBps = DEFAULT_PLATFORM_FEE_BPS;

        sellBurnBps = DEFAULT_SELL_BURN_BPS;
        sellPlatformIcoBps = DEFAULT_SELL_PLATFORM_ICO_BPS;
        sellLiquidityIcoBps = DEFAULT_SELL_LIQUIDITY_ICO_BPS;

        minUsdtReserveToEnableSell = 50_000_000 * (10 ** IERC20Metadata(usdtAddress).decimals());
        minIcoHolderCountToEnableSell = 100_000;

        pair = factory.getPair(usdtAddress, icoAddress);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function quoteBuyIco(uint256 amountInUsdt) public view returns (uint256 amountOutIco, uint256 feeUsdt) {
        if (amountInUsdt == 0) {
            return (0, 0);
        }

        feeUsdt = (amountInUsdt * buyFeeBps) / BPS_DENOMINATOR;
        uint256 netSwapIn = amountInUsdt - feeUsdt;
        address[] memory path = new address[](2);
        path[0] = address(usdt);
        path[1] = address(ico);
        uint256[] memory amounts = router.getAmountsOut(netSwapIn, path);
        amountOutIco = amounts[amounts.length - 1];
    }

    function quoteSellIco(uint256 amountInIco)
        public
        view
        returns (uint256 amountOutUsdt, uint256 feeUsdt, uint256 burnAmountIco, uint256 platformAmountIco, uint256 liquidityAmountIco)
    {
        if (!sellUsdtEnabled || amountInIco == 0) {
            return (0, 0, 0, 0, 0);
        }

        burnAmountIco = (amountInIco * sellBurnBps) / BPS_DENOMINATOR;
        platformAmountIco = (amountInIco * sellPlatformIcoBps) / BPS_DENOMINATOR;
        liquidityAmountIco = amountInIco - burnAmountIco - platformAmountIco;

        address[] memory path = new address[](2);
        path[0] = address(ico);
        path[1] = address(usdt);
        uint256[] memory amounts = router.getAmountsOut(liquidityAmountIco, path);
        uint256 grossUsdtOut = amounts[amounts.length - 1];
        feeUsdt = (grossUsdtOut * sellFeeBps) / BPS_DENOMINATOR;
        amountOutUsdt = grossUsdtOut - feeUsdt;
    }

    function buyIcoExactIn(uint256 amountInUsdt, uint256 minOutIco, address recipient) external nonReentrant returns (uint256 amountOutIco) {
        require(recipient != address(0), "invalid recipient");
        require(amountInUsdt > 0, "invalid amount");

        usdt.safeTransferFrom(msg.sender, address(this), amountInUsdt);

        uint256 feeUsdt = (amountInUsdt * buyFeeBps) / BPS_DENOMINATOR;
        uint256 netSwapIn = amountInUsdt - feeUsdt;

        _distributeUsdtFee(feeUsdt);
        amountOutIco = _swap(address(usdt), address(ico), netSwapIn, minOutIco, recipient);

        emit PrimaryBuyExecuted(msg.sender, amountInUsdt, feeUsdt, amountOutIco);
    }

    function sellIcoForUsdt(uint256 amountInIco, uint256 minOutUsdt, address recipient) external nonReentrant returns (uint256 netUsdtOut) {
        require(sellUsdtEnabled, "sell usdt disabled");
        require(recipient != address(0), "invalid recipient");
        require(amountInIco > 0, "invalid amount");

        IERC20(address(ico)).safeTransferFrom(msg.sender, address(this), amountInIco);

        uint256 burnAmountIco = (amountInIco * sellBurnBps) / BPS_DENOMINATOR;
        uint256 platformAmountIco = (amountInIco * sellPlatformIcoBps) / BPS_DENOMINATOR;
        uint256 liquidityAmountIco = amountInIco - burnAmountIco - platformAmountIco;

        if (burnAmountIco > 0) {
            ico.burn(burnAmountIco);
        }
        if (platformAmountIco > 0) {
            IERC20(address(ico)).safeTransfer(platformRecipient, platformAmountIco);
        }

        uint256 grossOutMin = _grossFromNet(minOutUsdt, sellFeeBps);
        uint256 grossUsdtOut = _swap(address(ico), address(usdt), liquidityAmountIco, grossOutMin, address(this));

        uint256 feeUsdt = (grossUsdtOut * sellFeeBps) / BPS_DENOMINATOR;
        netUsdtOut = grossUsdtOut - feeUsdt;
        require(netUsdtOut >= minOutUsdt, "min out not met");

        _distributeUsdtFee(feeUsdt);
        usdt.safeTransfer(recipient, netUsdtOut);

        emit PrimarySellExecuted(msg.sender, amountInIco, burnAmountIco, platformAmountIco, liquidityAmountIco, grossUsdtOut, feeUsdt, netUsdtOut);
    }

    function canEnableSellUsdt() public view returns (bool) {
        return getPairUsdtReserve() >= minUsdtReserveToEnableSell && reportedIcoHolderCount >= minIcoHolderCountToEnableSell;
    }

    function enableSellUsdt() external onlyOwner {
        require(canEnableSellUsdt(), "threshold not met");
        sellUsdtEnabled = true;
        emit SellUsdtEnabledUpdated(true);
    }

    function disableSellUsdt() external onlyOwner {
        sellUsdtEnabled = false;
        emit SellUsdtEnabledUpdated(false);
    }

    function forceSetSellEnabled(bool enabled) external onlyOwner {
        sellUsdtEnabled = enabled;
        emit SellUsdtEnabledUpdated(enabled);
    }

    function reportIcoHolderCount(uint256 holderCount) external onlyOwner {
        reportedIcoHolderCount = holderCount;
        emit IcoHolderCountReported(holderCount);
    }

    function updateThresholds(uint256 newMinUsdtReserve, uint256 newMinIcoHolderCount) external onlyOwner {
        minUsdtReserveToEnableSell = newMinUsdtReserve;
        minIcoHolderCountToEnableSell = newMinIcoHolderCount;
        emit ThresholdConfigUpdated(newMinUsdtReserve, newMinIcoHolderCount);
    }

    function updateRecipients(address newSuperNodeFeeRecipient, address newNodePoolFeeRecipient, address newPlatformRecipient) external onlyOwner {
        require(newSuperNodeFeeRecipient != address(0) && newNodePoolFeeRecipient != address(0) && newPlatformRecipient != address(0), "invalid recipient");
        superNodeFeeRecipient = newSuperNodeFeeRecipient;
        nodePoolFeeRecipient = newNodePoolFeeRecipient;
        platformRecipient = newPlatformRecipient;
        emit RecipientsUpdated(newSuperNodeFeeRecipient, newNodePoolFeeRecipient, newPlatformRecipient);
    }

    function updateBuyFeeConfig(uint16 newBuyFeeBps, uint16 newSuperNodeFeeBps, uint16 newNodePoolFeeBps, uint16 newPlatformFeeBps) external onlyOwner {
        require(newBuyFeeBps > 0 && newBuyFeeBps <= BPS_DENOMINATOR, "invalid buy fee");
        require(uint256(newSuperNodeFeeBps) + uint256(newNodePoolFeeBps) + uint256(newPlatformFeeBps) == newBuyFeeBps, "invalid fee split");
        buyFeeBps = newBuyFeeBps;
        superNodeFeeBps = newSuperNodeFeeBps;
        nodePoolFeeBps = newNodePoolFeeBps;
        platformFeeBps = newPlatformFeeBps;
        emit BuyFeeConfigUpdated(newBuyFeeBps, newSuperNodeFeeBps, newNodePoolFeeBps, newPlatformFeeBps);
    }

    function updateSellConfig(uint16 newSellFeeBps, uint16 newSellBurnBps, uint16 newSellPlatformIcoBps, uint16 newSellLiquidityIcoBps) external onlyOwner {
        require(newSellFeeBps > 0 && newSellFeeBps <= BPS_DENOMINATOR, "invalid sell fee");
        require(uint256(newSellBurnBps) + uint256(newSellPlatformIcoBps) + uint256(newSellLiquidityIcoBps) == BPS_DENOMINATOR, "invalid sell split");
        sellFeeBps = newSellFeeBps;
        sellBurnBps = newSellBurnBps;
        sellPlatformIcoBps = newSellPlatformIcoBps;
        sellLiquidityIcoBps = newSellLiquidityIcoBps;
        emit SellConfigUpdated(newSellFeeBps, newSellBurnBps, newSellPlatformIcoBps, newSellLiquidityIcoBps);
    }

    function updatePair(address newPair) external onlyOwner {
        pair = newPair;
        emit PairUpdated(newPair);
    }

    function setUsdtAddress(address newUsdtAddress) external onlyOwner {
        require(newUsdtAddress != address(0), "invalid usdt");

        uint8 currentDecimals = IERC20Metadata(address(usdt)).decimals();
        uint8 nextDecimals = IERC20Metadata(newUsdtAddress).decimals();
        require(nextDecimals == currentDecimals, "usdt decimals mismatch");

        address oldUsdt = address(usdt);
        usdt = IERC20(newUsdtAddress);
        pair = factory.getPair(newUsdtAddress, address(ico));

        emit UsdtAddressUpdated(oldUsdt, newUsdtAddress, pair);
        emit PairUpdated(pair);
    }

    function getPairUsdtReserve() public view returns (uint256) {
        address currentPair = pair;
        if (currentPair == address(0)) {
            return 0;
        }

        (uint112 reserve0, uint112 reserve1,) = IPairV2Like(currentPair).getReserves();
        if (IPairV2Like(currentPair).token0() == address(usdt)) {
            return uint256(reserve0);
        }
        if (IPairV2Like(currentPair).token1() == address(usdt)) {
            return uint256(reserve1);
        }
        return 0;
    }

    function withdrawTreasury(address token, address to, uint256 amount) external onlyOwner {
        require(token != address(0), "invalid token");
        require(to != address(0), "invalid recipient");
        IERC20(token).safeTransfer(to, amount);
        emit TreasuryWithdrawn(token, to, amount);
    }

    function _swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, address recipient) private returns (uint256) {
        if (amountIn == 0) {
            return 0;
        }

        IERC20(tokenIn).forceApprove(address(router), 0);
        IERC20(tokenIn).forceApprove(address(router), amountIn);

        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;
        uint256[] memory amounts = router.swapExactTokensForTokens(amountIn, minOut, path, recipient, block.timestamp + 20 minutes);
        return amounts[amounts.length - 1];
    }

    function _distributeUsdtFee(uint256 feeUsdt) private {
        if (feeUsdt == 0) {
            return;
        }

        uint256 superNodeAmount = (feeUsdt * superNodeFeeBps) / buyFeeBps;
        uint256 nodePoolAmount = (feeUsdt * nodePoolFeeBps) / buyFeeBps;
        uint256 platformAmount = feeUsdt - superNodeAmount - nodePoolAmount;

        if (superNodeAmount > 0) {
            usdt.safeTransfer(superNodeFeeRecipient, superNodeAmount);
        }
        if (nodePoolAmount > 0) {
            usdt.safeTransfer(nodePoolFeeRecipient, nodePoolAmount);
        }
        if (platformAmount > 0) {
            usdt.safeTransfer(platformRecipient, platformAmount);
        }
    }

    function _grossFromNet(uint256 netAmount, uint16 feeBps) private pure returns (uint256) {
        if (netAmount == 0) {
            return 0;
        }
        uint256 denominator = BPS_DENOMINATOR - feeBps;
        return (netAmount * BPS_DENOMINATOR + denominator - 1) / denominator;
    }
}