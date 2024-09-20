//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.6;

import {ECDSAWalletView} from "./ECDSAWalletView.sol";
import {ECDSAWalletFactory} from "./ECDSAWalletFactory.sol";
import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {SafeTransferLib} from "solmate/src/utils/SafeTransferLib.sol";
import {Allowance} from "./libraries/AllowanceHelperLib.sol";
import {SmartWalletHasher} from "./libraries/HasherLib.sol";
import {ECDSAUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import {SafeMath} from "@openzeppelin/contracts/utils/math/SafeMath.sol";
import {PriceHelper} from "./libraries/FeeHelperLib.sol";
import "hardhat/console.sol";
import {WalletBridgeVerifier} from "./WalletBridgeVerifier.sol";
import {SignatureBuilder} from "./libraries/SignatureBuilderLib.sol";

// ECDSA ERC1967 implementation contract for the Base samrt wallet Spec. this contract
// handles the EIP712 Data signtures and verification. aswell as adding extra custom Permit2
// funtionality to enable direct tranerring of assets from owners EOA to their smart wallet
// in one signature. This is idea for swap transactions. This impl also requires user pys
//rhe reylayer back the gas cost for exec execution. this functionality is implemented
// in the optional _walletExecCallback() func, users gas pay relayer back in Native and
// ERC20 assets
contract ECDSAWallet is ECDSAWalletView {
  using SafeTransferLib for ERC20;
  using Allowance for PackedAllowance;
  using SmartWalletHasher for ECDSAExec;
  using SmartWalletHasher for UserOp;
  using SmartWalletHasher for AllowanceOp;
  using ECDSAUpgradeable for bytes32;
  using SafeMath for uint256;

  // new verify func i borrowd from uni permit2. old one ws fine but want to remain consistent since
  // im integrating custom perit for this wallet. a users smart wallet is the only entity that can permit
  // spenders which is a measure against attack vectors. however transfer from can still be called externally
  function _verify(ECDSAExec memory _walletExec, bytes memory _signature, uint8 _threshold) internal override {
    (uint256 _decodedSigChainID, bytes memory _signatures) = abi.decode(_signature, (uint256, bytes));
    bytes32 dataHash = domainSeperator(_decodedSigChainID).toTypedDataHash(_walletExec.hash());

    if (_threshold == 1) _verifyNonce(_walletExec.nonce);
    _verifySigChain(_decodedSigChainID, _walletExec);
    _verifySignatures(_signatures, dataHash, owner(), _threshold);
    if (_threshold == 1) _permitWalletForOwner(_walletExec.allowanceOp);

    validationResultsMap[nonce()] = ECDSAExecValidationDetails(owner(), dataHash, _signature, address(this));
    emit WalletOpRecoveryResult(owner(), dataHash, _signature, _walletExec.wallet, nonce());
  }

  // implementation of cleanu function after smart wallet calls have finished. cleanup involves refunding the relayer
  // for paying the gass fees for the exec calls. this needs to be improved
  function _walletExecCallback(uint256 execGasUse, ECDSAExec memory walletExec, bytes memory _sig) internal override {
    address feeToken = walletExec.allowanceOp.details[1].token;
    factory.queryFeeAsset(feeToken);

    uint256 gasCostInNative = (35000 + execGasUse - gasleft()) * 5 * 10 ** 9;
    uint160 gasCostInFeeAsset = uint160(
      PriceHelper.quoteGasPriceInFeeAsset(
        factory.WETH9(),
        feeToken,
        factory.PANCAKE_V2_FACTORY(),
        factory.PANCAKE_V3_FACTORY(),
        uint128(gasCostInNative)
      )
    );
    console.log((35000 + execGasUse - gasleft()));
    // since this function is outside of the Smart wallet the call comes from we need to call this contracts transferFrom
    // through an encoded call so that msg sender is the contract address and not the sc caller.
    string memory tranaferThash = "transferFrom(address,address,uint160,address)";
    string memory bridgeThash = "verifyBridgeReq(bytes,bytes)";

    bytes memory encodedTransferToRelayer = abi.encodeWithSignature(tranaferThash, owner(), msg.sender, gasCostInFeeAsset, feeToken);
    bytes memory encodedBridgeDataValidationReq = abi.encodeWithSignature(bridgeThash, abi.encode(walletExec), _sig);

    _verifyFeeAssetBalance(feeToken, gasCostInFeeAsset);
    _call(payable(address(this)), 0, encodedTransferToRelayer);
    _revokeAllowance(walletExec.allowanceOp);

    ECDSAWalletFactory ecdsaFactory = ECDSAWalletFactory(factory.ecdsaFactory());
    bytes32 dataToSign = domainSeperator(walletExec.sigChainID).toTypedDataHash(walletExec.hash());

    if (walletExec.bridgeOps.length > 0) {
      _call(payable(bridgeVerifier), 0, encodedBridgeDataValidationReq);
    }
    console.log((execGasUse - gasleft()));
  }

  function _verifyBridgeProof(bytes memory _bridgeProof, ECDSAExec memory _walletExec) internal override {
    ECDSAWalletFactory ecdsaFactory = ECDSAWalletFactory(factory.ecdsaFactory());
    (uint256 blockNumber, uint256 blockTimestamp, bytes32 proof) = abi.decode(_bridgeProof, (uint256, uint256, bytes32));
    bytes32 dataHash = domainSeperator(_walletExec.sigChainID).toTypedDataHash(_walletExec.hash());

    // new signing methid need to finish
  }

  function transferFrom(address from, address to, uint160 amount, address token) external onlyWalletSigners {
    _transfer(from, to, amount, token);
  }

  function _transfer(address from, address to, uint160 amount, address token) private {
    PackedAllowance storage allowed = allowance[from][token][msg.sender];

    if (block.timestamp > allowed.expiration) revert SignatureExpired("transfer allowance has expired");

    uint256 maxAmount = allowed.amount;
    if (maxAmount != type(uint160).max) {
      if (amount > maxAmount) revert InsufficentAllowance("failed to transfer, insufficient allowance");
      else {
        unchecked {
          allowed.amount = uint160(maxAmount) - amount;
        }
      }
    }
    ERC20(token).safeTransferFrom(from, to, amount);
  }

  function approve(address token, address spender, uint160 amount, uint48 expiration) external onlyWalletSigners {
    PackedAllowance storage allowed = allowance[msg.sender][token][spender];
    allowed.updateAmountAndExpiration(amount, expiration);
    emit Approval(msg.sender, token, spender, amount, expiration);
  }

  function _revokeAllowance(AllowanceOp memory allowanceOp) private {
    AllowanceOpDetails[] memory details;
    for (uint8 i = 0; i < details.length; i++) {
      allowance[owner()][details[i].token][allowanceOp.spender].amount = 0;
      allowance[owner()][details[i].token][allowanceOp.spender].expiration = 0;
    }
  }

  function _permitWalletForOwner(AllowanceOp memory allowanceOp) private {
    unchecked {
      address _spender = allowanceOp.spender;
      uint256 length = allowanceOp.details.length;

      for (uint256 i = 0; i < length; ++i) {
        if (allowanceOp.spender != address(0)) {
          uint48 _nonce = allowanceOp.details[i].nonce;
          address token = allowanceOp.details[i].token;
          uint160 amount = allowanceOp.details[i].amount;
          uint48 expiration = allowanceOp.details[i].expiration;
          PackedAllowance storage allowed = allowance[owner()][token][_spender];

          _verifyAllowanceNonce(_nonce, allowed.nonce);
          _verifySignatureDeadline(allowanceOp.sigDeadline);

          allowed.updateAll(amount, expiration, _nonce);
          emit Permit(owner(), token, _spender, amount, expiration, _nonce);
        }
      }
    }
  }

  function getBalanceFromBridgeVerifier(AllowanceOpDetails[] memory _tradeDetails) internal override {
    address[2] memory accounts = [owner(), factory.RELAYER()];
    bytes4 balanceTypeHash = bytes4(keccak256("getBalance(address,address)"));

    for (uint8 i = 0; i < _tradeDetails.length; i++) {
      bytes memory data = abi.encodeWithSelector(balanceTypeHash, accounts[i], _tradeDetails[i].token);

      (bool success, bytes memory response) = bridgeVerifier.call(data);
      if (!success) {
        assembly {
          revert(add(response, 32), mload(response))
        }
      }
    }
  }
}
