// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IIncubatorCoreIdentity {
    function ownerOfIdentity(uint256 identityId) external view returns (address);

    function isIdentityOperatorApproved(uint256 identityId, address operator) external view returns (bool);

    function transferIdentityByMarket(uint256 identityId, address from, address to) external;

    function getIdentity(uint256 identityId)
        external
        view
        returns (uint256 id, address owner, uint8 role, uint256 updatedAt);
}

contract NodeOTCMarket is Ownable {
    struct Order {
        uint256 id;
        uint256 identityId;
        uint8 role;
        address seller;
        uint256 priceUSDT;
        bool active;
    }

    IERC20 public immutable usdt;
    IIncubatorCoreIdentity public immutable coreIdentity;
    address public feeRecipient;
    uint256 public feeBps = 1000;

    uint256 public nextOrderId = 1;
    mapping(uint256 => Order) public orders;
    mapping(uint8 => uint256) public lastTradePriceByRole;
    mapping(uint256 => uint256) private activeOrderByIdentity;
    mapping(uint256 => uint256) private activeOrderPositions;
    uint256[] private activeOrderIds;

    event OtcOrderCreated(
        uint256 indexed orderId,
        address indexed seller,
        uint256 indexed identityId,
        uint8 role,
        uint256 priceUSDT
    );

    event OtcOrderFilled(
        uint256 indexed orderId,
        address indexed buyer,
        address indexed seller,
        uint256 priceUSDT,
        uint256 feeUSDT
    );

    event OtcOrderCancelled(uint256 indexed orderId, address indexed seller);
    event OtcOrderAutoCancelled(uint256 indexed orderId, address indexed seller, uint8 indexed role, uint256 referencePriceUSDT);
    event FeeConfigUpdated(uint256 feeBps, address feeRecipient);

    constructor(address usdtAddress, address coreIdentityAddress, address initialOwner, address feeRecipient_) Ownable(initialOwner) {
        require(usdtAddress != address(0), "invalid usdt");
        require(coreIdentityAddress != address(0), "invalid core");
        require(feeRecipient_ != address(0), "invalid fee recipient");
        usdt = IERC20(usdtAddress);
        coreIdentity = IIncubatorCoreIdentity(coreIdentityAddress);
        feeRecipient = feeRecipient_;
    }

    function createOrder(uint256 identityId, uint256 priceUSDT) external {
        require(identityId > 0, "invalid identity");
        require(priceUSDT > 0, "invalid price");

        (, , uint8 role, ) = coreIdentity.getIdentity(identityId);
        require(role == 1 || role == 2, "invalid role");

        uint256 floorPrice = lastTradePriceByRole[role];
        if (floorPrice > 0) {
            require(priceUSDT >= floorPrice, "below last trade price");
        }
        require(activeOrderByIdentity[identityId] == 0, "identity already listed");
        require(coreIdentity.ownerOfIdentity(identityId) == msg.sender, "not owner");
        require(coreIdentity.isIdentityOperatorApproved(identityId, address(this)), "market not approved");

        uint256 orderId = nextOrderId;
        orders[orderId] = Order({
            id: orderId,
            identityId: identityId,
            role: role,
            seller: msg.sender,
            priceUSDT: priceUSDT,
            active: true
        });
        nextOrderId = orderId + 1;
        activeOrderByIdentity[identityId] = orderId;
        activeOrderIds.push(orderId);
        activeOrderPositions[orderId] = activeOrderIds.length;

        emit OtcOrderCreated(orderId, msg.sender, identityId, role, priceUSDT);
    }

    function cancelOrder(uint256 orderId) external {
        Order storage order = orders[orderId];
        require(order.active, "inactive");
        require(order.seller == msg.sender, "not seller");

        order.active = false;
        _removeActiveOrder(order);
        emit OtcOrderCancelled(orderId, msg.sender);
    }

    function fillOrder(uint256 orderId) external {
        Order storage order = orders[orderId];
        require(order.active, "inactive");
        require(order.seller != msg.sender, "self trade");

        require(coreIdentity.ownerOfIdentity(order.identityId) == order.seller, "seller not owner");
        require(coreIdentity.isIdentityOperatorApproved(order.identityId, address(this)), "market not approved");

        uint256 fee = (order.priceUSDT * feeBps) / 10000;
        uint256 toSeller = order.priceUSDT - fee;

        bool paidSeller = usdt.transferFrom(msg.sender, order.seller, toSeller);
        require(paidSeller, "pay seller failed");

        bool paidFee = usdt.transferFrom(msg.sender, feeRecipient, fee);
        require(paidFee, "pay fee failed");

        coreIdentity.transferIdentityByMarket(order.identityId, order.seller, msg.sender);
        order.active = false;
        _removeActiveOrder(order);

        lastTradePriceByRole[order.role] = order.priceUSDT;

        _autoCancelLowerOrders(order.role, order.priceUSDT, order.id);

        emit OtcOrderFilled(orderId, msg.sender, order.seller, order.priceUSDT, fee);
    }

    function updateFeeConfig(uint256 newFeeBps, address newRecipient) external onlyOwner {
        require(newFeeBps <= 2000, "fee too high");
        require(newRecipient != address(0), "invalid recipient");

        feeBps = newFeeBps;
        feeRecipient = newRecipient;
        emit FeeConfigUpdated(newFeeBps, newRecipient);
    }

    function getOrder(uint256 orderId) external view returns (Order memory) {
        return orders[orderId];
    }

    function getActiveOrderIds() external view returns (uint256[] memory) {
        return activeOrderIds;
    }

    function getIdentityActiveOrder(uint256 identityId) external view returns (uint256) {
        return activeOrderByIdentity[identityId];
    }

    function _removeActiveOrder(Order storage order) private {
        delete activeOrderByIdentity[order.identityId];

        uint256 position = activeOrderPositions[order.id];
        if (position == 0) {
            return;
        }

        uint256 lastIndex = activeOrderIds.length - 1;
        uint256 lastOrderId = activeOrderIds[lastIndex];

        if (lastIndex != position - 1) {
            activeOrderIds[position - 1] = lastOrderId;
            activeOrderPositions[lastOrderId] = position;
        }

        activeOrderIds.pop();
        delete activeOrderPositions[order.id];
    }

    function _autoCancelLowerOrders(uint8 role, uint256 filledPrice, uint256 filledOrderId) private {
        uint256 cursor = 0;

        while (cursor < activeOrderIds.length) {
            uint256 activeOrderId = activeOrderIds[cursor];
            if (activeOrderId == filledOrderId) {
                cursor += 1;
                continue;
            }

            Order storage candidate = orders[activeOrderId];
            if (!candidate.active || candidate.role != role || candidate.priceUSDT >= filledPrice) {
                cursor += 1;
                continue;
            }

            candidate.active = false;
            address seller = candidate.seller;
            _removeActiveOrder(candidate);
            emit OtcOrderAutoCancelled(activeOrderId, seller, role, filledPrice);
        }
    }
}
