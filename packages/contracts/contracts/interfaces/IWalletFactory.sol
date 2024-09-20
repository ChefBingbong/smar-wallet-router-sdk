//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.6;

import "./IWallet.sol";

interface IWalletFactory {
  function createWallet(address _impl, uint256[2] memory pubkey, bytes memory _call) external payable returns (IWallet);

  function walletAddress(address _impl, uint256[2] memory pubkey, bytes memory _call, uint256 _nonce) external view returns (address);
}
