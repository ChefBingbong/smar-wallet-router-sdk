//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.6;

import {ECDSAWalletState} from "./ECDSAWalletState.sol";
import {ECDSAWallet} from "./ECDSAWallet.sol";
import {SmartWalletFactory} from "./SmartWalletFactory.sol";
import {IWallet} from "./interfaces/IWallet.sol";
import {Secp256k1} from "./libraries/Secp256k1Lib.sol";
import "hardhat/console.sol";

contract ECDSAWalletFactory {
  using Secp256k1 for *;

  SmartWalletFactory public factory;
  ECDSAWallet public wallet;

  mapping(bytes32 => address) public walletFromPubKeyHash;
  mapping(address => bytes32) public pubKeyHashFromWallet;

  mapping(bytes32 => IWallet) public walletFromHash;
  mapping(IWallet => bytes32) public hashFromWallet;
  mapping(bytes32 => uint256[2]) public publicKeyFromHash;
  event PubKeySetForWallet(uint256[2] newBLSKey, IWallet wallet);

  constructor(SmartWalletFactory _factory) {
    wallet = new ECDSAWallet();
    wallet.__ECDSAWallet_init(address(0));

    factory = _factory;
    factory.setEcdsaFactory(address(this));
  }

  modifier onlyWallet(bytes32 hash) {
    require((IWallet(payable(msg.sender)) == walletFromHash[hash]), "VG: not called from wallet");
    _;
  }

  function createWallet(uint256[2] memory pubkey, address _owner) external payable returns (IWallet) {
    bytes32 pubKeyHash = keccak256(abi.encodePacked(pubkey));
    IWallet _wallet = factory.createWallet{value: msg.value}(
      address(wallet),
      pubkey,
      abi.encodeWithSelector(ECDSAWalletState.__ECDSAWallet_init.selector, _owner)
    );
    updateWalletHashMappings(pubKeyHash, _wallet, pubkey);

    return _wallet;
  }

  function walletAddress(uint256[2] memory pubkey, address _owner, uint256 _nonce) public view returns (address) {
    console.log(msg.sender);
    return factory.walletAddress(address(wallet), pubkey, abi.encodeWithSelector(ECDSAWalletState.__ECDSAWallet_init.selector, _owner), _nonce);
  }

  function getOrCreateFromPublic(uint256[2] memory publicKey) private returns (IWallet) {
    bytes32 publicKeyHash = keccak256(abi.encodePacked(publicKey));
    IWallet _wallet = walletFromHash[publicKeyHash];
    // publicKeyHash does not yet refer to a wallet, create one then update mappings.
    if (address(_wallet) == address(0)) {
      _wallet = factory.createWallet{value: msg.value}(
        address(Secp256k1.deriveAddress(publicKey)),
        publicKey,
        abi.encodeWithSelector(ECDSAWalletState.__ECDSAWallet_init.selector, publicKey)
      );
    }
    return IWallet(_wallet);
  }

  function safeSetWallet(
    uint256[2] memory walletAddressSignature,
    uint256[2] memory publicKey,
    IWallet _wallet,
    uint256 signatureExpiryTimestamp
  ) private {
    require(block.timestamp < signatureExpiryTimestamp, "VG: message expired");
    // verify the given wallet was signed for by the bls key
    bytes32 publicKeyHash = keccak256(abi.encodePacked(publicKey));
    updateWalletHashMappings(publicKeyHash, _wallet, publicKey);
  }

  function updateWalletHashMappings(bytes32 publicKeyHash, IWallet _wallet, uint256[2] memory publicKey) private {
    // remove reference from old hash
    // this just sets outdated maps to 0
    bytes32 oldHash = hashFromWallet[_wallet];
    walletFromHash[oldHash] = IWallet(payable(address(0)));
    publicKeyFromHash[oldHash] = [0, 0];

    walletFromHash[publicKeyHash] = _wallet;
    hashFromWallet[_wallet] = publicKeyHash;
    publicKeyFromHash[publicKeyHash] = publicKey;
  }
}
