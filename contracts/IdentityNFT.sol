// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract IdentityNFT is ERC721, Ownable {

    enum IdentityKind {
        None,
        Node,
        SuperNode
    }

    uint256 public nextTokenId = 1;
    mapping(uint256 => IdentityKind) private identityKinds;
    mapping(address => uint256) private ownerToTokenId;
    mapping(address => bool) public minters;

    event IdentityMinted(address indexed to, uint256 indexed tokenId, IdentityKind kind);
    event IdentityUpgraded(address indexed owner, uint256 indexed burnedTokenId, uint256 indexed newTokenId);
    event MinterUpdated(address indexed account, bool allowed);

    constructor(address initialOwner) ERC721("Incubator Identity", "INCI") Ownable(initialOwner) {
        require(initialOwner != address(0), "invalid owner");
        minters[initialOwner] = true;
        emit MinterUpdated(initialOwner, true);
    }

    modifier onlyMinter() {
        require(minters[msg.sender], "not minter");
        _;
    }

    function setMinter(address account, bool allowed) external onlyOwner {
        require(account != address(0), "invalid minter");
        minters[account] = allowed;
        emit MinterUpdated(account, allowed);
    }

    function mintNode(address to) external onlyMinter returns (uint256) {
        return _mintIdentity(to, IdentityKind.Node);
    }

    function mintSuperNode(address to) external onlyMinter returns (uint256) {
        return _mintIdentity(to, IdentityKind.SuperNode);
    }

    function upgradeToSuperNode(address owner) external onlyMinter returns (uint256 oldTokenId, uint256 newTokenId) {
        oldTokenId = ownerToTokenId[owner];
        require(oldTokenId != 0, "owner has no identity");

        require(identityKinds[oldTokenId] == IdentityKind.Node, "not node");

        _burn(oldTokenId);
        delete identityKinds[oldTokenId];

        newTokenId = _mintIdentity(owner, IdentityKind.SuperNode);
        emit IdentityUpgraded(owner, oldTokenId, newTokenId);
    }

    function tokenOfOwner(address owner) external view returns (uint256) {
        uint256 tokenId = ownerToTokenId[owner];
        require(tokenId != 0, "owner has no identity");
        return tokenId;
    }

    function getRole(address owner) external view returns (uint8) {
        uint256 tokenId = ownerToTokenId[owner];
        if (tokenId == 0) {
            return uint8(IdentityKind.None);
        }

        return uint8(identityKinds[tokenId]);
    }

    function identityKindOf(uint256 tokenId) external view returns (uint8) {
        _requireOwned(tokenId);
        return uint8(identityKinds[tokenId]);
    }

    function _mintIdentity(address to, IdentityKind kind) private returns (uint256) {
        require(to != address(0), "invalid to");
        require(kind != IdentityKind.None, "invalid kind");
        require(ownerToTokenId[to] == 0, "recipient has identity");

        uint256 tokenId = nextTokenId;
        nextTokenId = tokenId + 1;

        _safeMint(to, tokenId);
        identityKinds[tokenId] = kind;

        emit IdentityMinted(to, tokenId, kind);
        return tokenId;
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (to != address(0)) {
            require(ownerToTokenId[to] == 0, "recipient has identity");
        }

        address from = super._update(to, tokenId, auth);

        if (from != address(0)) {
            delete ownerToTokenId[from];
        }

        if (to != address(0)) {
            ownerToTokenId[to] = tokenId;
        }

        return from;
    }
}