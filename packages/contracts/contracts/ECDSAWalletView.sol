//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.6;

import {IWallet} from "./interfaces/IWallet.sol";
import {IERC1271} from "./interfaces/IERC1271.sol";
import {SmartWalletHasher} from "./libraries/HasherLib.sol";
import {SignatureBuilder} from "./libraries/SignatureBuilderLib.sol";
import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {SafeMath} from "@openzeppelin/contracts/utils/math/SafeMath.sol";
import {ECDSAWalletFactory} from "./ECDSAWalletFactory.sol";
import {ECDSAUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";

import "./ECDSAWalletState.sol";

pragma experimental ABIEncoderV2;

abstract contract ECDSAWalletView is ECDSAWalletState {
  using ECDSAUpgradeable for bytes32;

  error SignatureExpired(string message);
  error InsufficentFeeAsset(string message);
  error InvalidWalletOpNonce(string message);
  error InvalidAllowanceOpNonce(string message);
  error InsufficentAllowance(string message);

  error InvalidBridgeOppNonce(string message);
  error InvalidSigChain(string message);
  error InvalidSignature(string message);
  error InvalidSigner(string message);

  using SafeMath for uint256;

  address public constant bridgeVerifier = 0x11632F9766Ee9d9317F95562a6bD529652ead78f;
  bytes4 internal constant EIP1271_MAGIC_VALUEE = 0x1626ba7e;

  function _verifySignatures(bytes memory signatures, bytes32 dataHash, address executor, uint256 requiredSignatures) public view {
    // Check that the provided signature data is not too short
    console.log(signatures.length);
    if (signatures.length < requiredSignatures.mul(65)) revert("GS020");

    address lastOwner = address(0);
    address currentOwner;

    uint256 v; // Implicit conversion from uint8 to uint256 will be done for v received from signatureSplit(...).
    bytes32 r;
    bytes32 s;

    // If v is 0 then it is a contract signature
    // When handling contract signatures the address of the contract is encoded into r
    for (uint8 i = 0; i < requiredSignatures; i++) {
      (v, r, s) = SignatureBuilder.signatureSplit(signatures, i);
      if (v == 0) {
        currentOwner = address(uint160(uint256(r)));
        if (uint256(s) < requiredSignatures * 65) revert("GS021");

        _verifyContractSig(currentOwner, dataHash, signatures, uint256(s));
      } else {
        currentOwner = extractEthSigType(uint8(v), r, s, dataHash);
        _verifySigner(currentOwner);
      }

      if (currentOwner <= lastOwner) revert("GS026");
      // _verifySigner(currentOwner);
      lastOwner = currentOwner;
    }
  }

  function _verifyContractSig(address owner, bytes32 dataHash, bytes memory signatures, uint256 offset) internal view {
    if (offset.add(32) > signatures.length) revert("GS022");

    uint256 contractSignatureLen;
    assembly {
      contractSignatureLen := mload(add(add(signatures, offset), 0x20))
    }
    // Check signature
    if (offset.add(32).add(contractSignatureLen) > signatures.length) revert("GS023");
    bytes memory contractSignature;

    assembly {
      // The signature data for contract signatures is appended to the concatenated signatures and the offset is stored in s
      contractSignature := add(add(signatures, offset), 0x20)
    }

    if (ECDSAWalletView(payable(owner))._isValidSignature(dataHash, contractSignature) != EIP1271_MAGIC_VALUEE) console.log("oops");
  }

  function _isValidSignature(bytes32 _dataHash, bytes memory _signature) public view returns (bytes4) {
    if (_signature.length > 0) _verifySignatures(_signature, _dataHash, msg.sender, 1);
    else {
      bytes memory signedMsg = signedMessages[_dataHash];
      if (signedMsg.length == 0) revert("no data");

      ECDSAWalletFactory ecdsaFactory = ECDSAWalletFactory(factory.ecdsaFactory());
      // bytes32 contractSignature = ecdsaFactory.recoverContractSignature(owner(), block.number, block.timestamp, _dataHash);
      (address signer, bytes32 signedData, bytes32 signature) = abi.decode(signedMsg, (address, bytes32, bytes32));

      if (signer != msg.sender || signedData != _dataHash) revert("invalid smart contract sig");
    }
    return EIP1271_MAGIC_VALUEE;
  }

  function _verifySigChain(uint256 _decodedSigChainID, ECDSAExec memory _walletExec) internal pure {
    if (_decodedSigChainID != _walletExec.sigChainID) revert InvalidSigChain("sig chain does not equal provided value");
  }

  function _verifyNonce(uint256 _nonceToCheck) internal view {
    if (_nonceToCheck != nonce()) revert InvalidWalletOpNonce("invalid nonce provided");
  }

  function _verifyAllowanceNonce(uint256 _nonceToCheck, uint256 _allowanceNonceFromMap) internal pure {
    if (_nonceToCheck != _allowanceNonceFromMap) revert InvalidWalletOpNonce("invalid nonce provided");
  }

  function _verifySignatureDeadline(uint256 _deadlineToCheck) internal view {
    if (block.timestamp >= _deadlineToCheck) revert SignatureExpired("permit signature has expired");
  }

  function _verifyFeeAssetBalance(address _feeAsset, uint256 gasCostInFeeAsset) internal view {
    if (ERC20(_feeAsset).balanceOf(owner()) < gasCostInFeeAsset) revert InsufficentFeeAsset("Inusefficent balance of fee asset");
  }

  function _verifySigner(address _claimedSigner) internal view {
    if (_claimedSigner == address(0)) revert InvalidSignature("Invalid Signature");
    if (_claimedSigner != state().owner && _claimedSigner != factory.RELAYER()) revert InvalidSigner("Signer is not Smart Wallet Owner");
  }

  function extractEthSigType(uint8 v, bytes32 r, bytes32 s, bytes32 hash) internal pure returns (address) {
    // If v > 30 then default va (27,28) has been adjusted for eth_sign flow
    // To support eth_sign and similar we adjust v and hash the messageHash with the Ethereum message prefix before applying ecrecover
    if (v > 30) {
      bytes32 ethCompactSigTypeHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
      return ecrecover(ethCompactSigTypeHash, uint8(v - 4), r, s);
    }
    return ecrecover(hash, uint8(v), r, s);
  }

  function getUserValidatedData(uint256 _nonce) public view returns (ECDSAExecValidationDetails memory) {
    return validationResultsMap[_nonce];
  }
}
