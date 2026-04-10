// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract MockToken is ERC20, ERC20Burnable, Ownable {
    constructor(string memory name_, string memory symbol_, address initialOwner) ERC20(name_, symbol_) Ownable(initialOwner) {}

    function mint(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "invalid to");
        _mint(to, amount);
    }
}
