// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract IncubatorToken is ERC20, ERC20Burnable, Ownable {
    uint256 public totalBurned;
    address public saleAllocationWallet;
    mapping(address => bool) public burnExecutors;

    event BurnExecutorUpdated(address indexed executor, bool allowed);
    event SaleAllocationWalletUpdated(address indexed previousWallet, address indexed newWallet);
    event UnsoldSupplyBurned(address indexed operator, address indexed saleWallet, uint256 amount);

    constructor(
        string memory name_,
        string memory symbol_,
        address initialOwner,
        address saleWallet_
    ) ERC20(name_, symbol_) Ownable(initialOwner) {
        require(saleWallet_ != address(0), "invalid sale wallet");
        saleAllocationWallet = saleWallet_;
    }

    modifier onlyBurnExecutor() {
        require(owner() == msg.sender || burnExecutors[msg.sender], "not burn executor");
        _;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "invalid to");
        _mint(to, amount);
    }

    function setSaleAllocationWallet(address newWallet) external onlyOwner {
        require(newWallet != address(0), "invalid sale wallet");

        address previousWallet = saleAllocationWallet;
        saleAllocationWallet = newWallet;
        emit SaleAllocationWalletUpdated(previousWallet, newWallet);
    }

    function setBurnExecutor(address executor, bool allowed) external onlyOwner {
        require(executor != address(0), "invalid executor");

        burnExecutors[executor] = allowed;
        emit BurnExecutorUpdated(executor, allowed);
    }

    function burnUnsold(uint256 amount) external onlyBurnExecutor {
        address saleWallet = saleAllocationWallet;
        require(saleWallet != address(0), "sale wallet not set");

        _burn(saleWallet, amount);
        emit UnsoldSupplyBurned(msg.sender, saleWallet, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);

        if (from != address(0) && to == address(0)) {
            totalBurned += value;
        }
    }
}