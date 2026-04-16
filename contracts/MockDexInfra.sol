// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MockDexPairV2 {
    address public immutable token0;
    address public immutable token1;
    uint112 private reserve0;
    uint112 private reserve1;

    constructor(address token0_, address token1_) {
        token0 = token0_;
        token1 = token1_;
    }

    function setReserves(uint112 newReserve0, uint112 newReserve1) external {
        reserve0 = newReserve0;
        reserve1 = newReserve1;
    }

    function getReserves() external view returns (uint112, uint112, uint32) {
        return (reserve0, reserve1, 0);
    }
}

contract MockDexFactoryV2 {
    mapping(address => mapping(address => address)) public pairs;

    function setPair(address tokenA, address tokenB, address pair) external {
        pairs[tokenA][tokenB] = pair;
        pairs[tokenB][tokenA] = pair;
    }

    function getPair(address tokenA, address tokenB) external view returns (address) {
        return pairs[tokenA][tokenB];
    }
}

contract MockDexRouterV2 {
    using SafeERC20 for IERC20;

    mapping(address => mapping(address => uint256)) public numerator;
    mapping(address => mapping(address => uint256)) public denominator;

    function setRate(address tokenIn, address tokenOut, uint256 num, uint256 den) external {
        require(tokenIn != address(0) && tokenOut != address(0), "invalid token");
        require(den > 0, "invalid den");
        numerator[tokenIn][tokenOut] = num;
        denominator[tokenIn][tokenOut] = den;
    }

    function getAmountsOut(uint256 amountIn, address[] calldata path) public view returns (uint256[] memory amounts) {
        require(path.length == 2, "invalid path");
        uint256 num = numerator[path[0]][path[1]];
        uint256 den = denominator[path[0]][path[1]];
        require(num > 0 && den > 0, "rate not set");

        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = (amountIn * num) / den;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256
    ) external returns (uint256[] memory amounts) {
        require(to != address(0), "invalid to");
        amounts = getAmountsOut(amountIn, path);
        require(amounts[1] >= amountOutMin, "insufficient out");

        IERC20(path[0]).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(path[1]).safeTransfer(to, amounts[1]);
    }
}