//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.6;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IWalletFactory} from "./interfaces/IWalletFactory.sol";
import {IWallet} from "./interfaces/IWallet.sol";
import {ECDSAWalletState} from "./ECDSAWalletState.sol";
import {ECDSAWalletFactory} from "./ECDSAWalletFactory.sol";
import {Schnorr2} from "./crypto/Schnorr.sol";
import "hardhat/console.sol";

contract SmartWalletFactory is IWalletFactory {
  address public WETH9;
  address public PANCAKE_V2_FACTORY;
  address public PANCAKE_V3_FACTORY;
  address public RELAYER;

  ECDSAWalletFactory public ecdsaFactory;
  Schnorr2 public schnorr;
  bytes32 public priv;

  error UnSupportedFeeAsset(string message);
  error SmartWalletCreationError(string message);

  mapping(address => bool) public supportedFeeAssets;
  mapping(bytes32 => uint256) public nonces;

  event WalletCreated(address indexed _wallet, bytes32 indexed _callID);

  constructor(Schnorr2 _schnorr, address _pancakeV2Factory, address _pancakeV3Factory, address _weth9, address[] memory _initialFeeAssets) {
    WETH9 = _weth9;
    PANCAKE_V2_FACTORY = _pancakeV2Factory;
    PANCAKE_V3_FACTORY = _pancakeV3Factory;

    for (uint8 i = 0; i < _initialFeeAssets.length; i++) {
      supportedFeeAssets[_initialFeeAssets[i]] = true;
    }
    RELAYER = msg.sender;
    schnorr = _schnorr;
  }

  function createWallet(address _impl, uint256[2] memory pubkey, bytes memory _call) external payable returns (IWallet) {
    bytes32 callID = keccak256(_call);
    (uint256 derivedX, uint256 derivedY) = schnorr.PubDerive(pubkey, nonces[callID]++);
    bytes32 salt = keccak256(abi.encodePacked(derivedX, derivedY));
    ERC1967Proxy wallet_ = new ERC1967Proxy{salt: salt}(address(_impl), _call);

    emit WalletCreated(address(wallet_), callID);
    IWallet wallet = IWallet(payable(wallet_));

    (bool ok, ) = address(wallet).call{value: msg.value}("");
    if (!ok) revert SmartWalletCreationError("SmartWallet: Failed to creation Fee");
    return wallet;
  }

  function walletAddress(address _impl, uint256[2] memory pubkey, bytes memory _call, uint256 _nonce) public view returns (address) {
    (uint256 derivedX, uint256 derivedY) = schnorr.PubDerive(pubkey, _nonce);
    bytes32 salt = keccak256(abi.encodePacked(derivedX, derivedY));
    return
      address(
        uint160(
          uint256(
            keccak256(
              abi.encodePacked(
                bytes1(0xff),
                address(this),
                salt,
                keccak256(abi.encodePacked(type(ERC1967Proxy).creationCode, abi.encode(_impl, _call)))
              )
            )
          )
        )
      );
  }

  function queryFeeAsset(address _feeAsset) public view returns (bool) {
    if (!supportedFeeAssets[_feeAsset]) revert UnSupportedFeeAsset("unsuppurted Fee Asset");
    return supportedFeeAssets[_feeAsset];
  }

  function addSupportedFeeAsset(address _asset, bool _isSuppoeted) external {
    supportedFeeAssets[_asset] = _isSuppoeted;
  }

  function setEcdsaFactory(address _factory) external {
    if (address(ecdsaFactory) != address(0)) revert("already initialized");
    ecdsaFactory = ECDSAWalletFactory(_factory);
  }
}
