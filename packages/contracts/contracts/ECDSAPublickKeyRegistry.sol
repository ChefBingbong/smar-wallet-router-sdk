//SPDX-License-Identifier: MIT
pragma solidity ^0.8.6;
pragma abicoder v2;

contract ECDSAPublicKeyRegistry {
  mapping(uint256 => uint256[2]) public ecdsaPublicKeys;
  uint256 public nextId = 0;

  event ECDSAPublicKeyRegistered(uint256 id, bytes32 indexed ecdsaPublicKeyHash);

  function register(uint256[2] memory ecdsaPublicKey) external {
    uint256 id = nextId;
    nextId += 1;
    ecdsaPublicKeys[id] = ecdsaPublicKey;

    emit ECDSAPublicKeyRegistered(id, keccak256(abi.encode(ecdsaPublicKey)));
  }

  function lookup(uint256 id) external view returns (uint256[2] memory) {
    uint256[2] memory ecdsaPublicKey = ecdsaPublicKeys[id];
    require(!isZeroECDSAPublicKey(ecdsaPublicKey), "ECDSAPublicKeyRegistry: ECDSA public key not found");

    return ecdsaPublicKey;
  }

  function isZeroECDSAPublicKey(uint256[2] memory ecdsaPublicKey) internal pure returns (bool) {
    for (uint i = 0; i < 4; i++) {
      if (ecdsaPublicKey[i] != 0) {
        return false;
      }
    }

    return true;
  }
}
