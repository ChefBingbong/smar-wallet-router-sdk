//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.6;
import {IAllowanceTransfer} from "./permit2/interfaces/IAllowanceTransfer.sol";
import {IPermit2} from "./permit2/interfaces/IPermit2.sol";

interface IWallet {
     event LogReceivedEther(address indexed _from, uint256 _amount);
     event LogCall(address indexed _contract, uint256 _value, bytes _data);

     struct UserOp {
          address to;
          uint256 amount;
          bytes data;
     }

     struct TradeInfo {
          address _token0;
          address _token1;
          address _feeToken;
          uint256 _amountIn;
          uint256 _gasPrice;
     }

     function deposit(
          uint256 _amount,
          address _token,
          address _feeAsset,
          address _outputToken,
          address _user,
          address _permit2A,
          IAllowanceTransfer.PermitBatch calldata _permit,
          uint256 _gasPrice,
          bytes calldata _signature
     ) external;

     receive() external payable;

     function nonce() external view returns (uint256);

     function getTradeDetails(uint256 _nonce) external view returns (TradeInfo memory);

     function exec(UserOp[] calldata userOps, bytes memory _signature, address weth, address pancakeFactory) external;
}
