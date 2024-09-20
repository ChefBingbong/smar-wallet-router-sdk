import { ethers } from "hardhat";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
// import { it } from "mocha";
// import { SmartWallet, SmartWalletFactory, ABC, XYZ } from "../../typechain-types";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
  type SmartWallet,
  type SmartWalletFactory,
  type ABC,
  type XYZ,
  type ECDSAWalletFactory,
  type ECDSAWalletFactory__factory,
  type SmartWalletFactory__factory,
  type IWallet,
  type ECDSAWallet,
  type Permit2__factory,
  type Permit2,
  type AMMSwap,
  type AMMSwap__factory,
  SmartWallet__factory,
  ECDSAWallet__factory,
  WalletBridgeVerifier__factory,
  WalletBridgeVerifier,
  PQR,
  ICALLER__factory,
  CALLER__factory,
  Schnorr2__factory,
  Schnorr2,
  SchnorrOrg__factory,
  SchnorrOrg,
} from "../typechain-types";
import { TxType, sign, signMessage } from "./utils/sign";
import type { AllowanceOp, UserOp } from "./utils/sign";
import * as scep from "@noble/secp256k1";

import {
  AllowanceTransfer,
  generatePermitTypedData,
  getPermit2Address,
  MaxAllowanceExpiration,
  MaxAllowanceTransferAmount,
  PERMIT_EXPIRATION,
  PERMIT_SIG_EXPIRATION,
  type PermitBatch,
  PermitBatchTransferFrom,
  SignatureTransfer,
  toDeadline,
  Witness,
} from "@pancakeswap/permit2-sdk";
import { constants } from "ethers";
import { PermitTransferFrom } from "@pancakeswap/permit2-sdk";
import { Console } from "console";
import { ERC20Token } from "@pancakeswap/sdk";
import { hexToBytes, maxUint256, zeroAddress } from "viem";
import {
  defaultAbiCoder,
  formatEther,
  keccak256,
  toUtf8Bytes,
} from "ethers/lib/utils";
import {
  buildContractSignature,
  buildSignature,
  buildSignatureBytes,
} from "./utils/buildSignatures";

describe("Permit2 Signature Transfer", () => {
  // const PERMIT2_ADDRESS = getPermit2Address(97);
  let OWNER: SignerWithAddress;
  let BOB: SignerWithAddress;

  // ALICE
  let ALICE: SignerWithAddress;

  // Forwarder
  let factory: ECDSAWalletFactory;
  let bridgeVerifier: WalletBridgeVerifier;

  // Wallets
  let aliceWallet: ECDSAWallet;
  let wallet: SmartWalletFactory;
  let schnorr: Schnorr2;

  let weth: ABC;
  let cake: XYZ;
  let busd: PQR;

  before(async () => {
    [OWNER, ALICE, BOB] = await ethers.getSigners();

    const Schnorr = (await ethers.getContractFactory(
      "Schnorr2",
    )) as Schnorr2__factory;

    schnorr = await Schnorr.connect(OWNER).deploy();
    await schnorr.deployed();
  });

  // ----- UPDATE PARNER -----
  it("User should be able to create a wallet for themselves.", async () => {
    //     const proof = await schnorr.CreateProof(
    //       "0x635b1ce8ddf5d21b60e346c7dbe26552c518d6ea48062b5585e53aeac5ee4461",
    //       "0x72c7e4eb0ed61f5c6779eaa13def00033c3ec158368c722b1e3adfc792b006a7",
    //     );
    const pointPub =
      scep.Point.fromPrivateKey(
        58061806736494292520208361787951596349232252952004834268315298885074801295881n,
      );

    const schnorPrivate = await schnorr.PrivDerive(
      58061806736494292520208361787951596349232252952004834268315298885074801295881n,
      keccak256(hexToBytes("0x12")),
    );
    console.log(pointPub);

    const schnorrPulic = await schnorr.PubDerive(
      [pointPub.x, pointPub.y],
      keccak256(hexToBytes("0x12")),
    );
    const proof2 = await schnorr.CreateProof(
      schnorPrivate,
      "0x66d230b88fdf4afb59989584f221c8247004ec69902d1a0276a1fc32baaf64b1",
    );
    // console.log(schnorPrivate);
    const derivedAddress = await schnorr.deriveAddress(schnorrPulic);
    console.log(derivedAddress);
    const sig = await schnorr.sign(
      "0x" + Buffer.alloc(32, 0x35).toString("hex"),
      "0x" +
        58061806736494292520208361787951596349232252952004834268315298885074801295881n.toString(
          16,
        ),
    );
    const recovery = await schnorr.recover(
      "0x" + Buffer.alloc(32, 0x35).toString("hex"),
      sig[0],
      sig[1],
      sig[2],
    );
    const rec = await schnorr.publicKeyToAddress(recovery);
    const rec2 = await schnorr.publicKeyToAddress(pointPub);
    const rec3 = await schnorr.publicKeyToAddress({
      x: schnorrPulic.pubkeyX.toBigInt(),
      y: schnorrPulic.pubkeyY.toBigInt(),
    });

    console.log(sig, recovery, rec, rec2, rec3, derivedAddress);
    // const proof = await schnorr.CreateProof(
    //   "0x635b1ce8ddf5d21b60e346c7dbe26552c518d6ea48062b5585e53aeac5ee4461",
    //   "0x66d230b88fdf4afb59989584f221c8247004ec69902d1a0276a1fc32baaf64b1",
    // );
    //     0x66d230b88fdf4afb59989584f221c8247004ec69902d1a0276a1fc32baaf64b1
    const isVerified = await schnorr.VerifyProof(
      schnorrPulic,
      "0x66d230b88fdf4afb59989584f221c8247004ec69902d1a0276a1fc32baaf64b1",
      proof2.out_s,
      proof2.out_e,
    );
    // const pd = await schnorr.PrivDerive(
    //   "0x635b1ce8ddf5d21b60e346c7dbe26552c518d6ea48062b5585e53aeac5ee4461",
    //   keccak256(hexToBytes("0x12")),
    // );
    // const pd1 = await schnorr.PrivDerive(
    //   "0x646b1ce8ddf5d21b60e346c7dbe26552c518d6ea48062b5585e53aeac5ee4461",
    //   keccak256(hexToBytes("0x124")),
    // );
    // const pubd = await schnorr.PubDerive(
    //   [proof.pubkeyX, proof.pubkeyY],
    //   keccak256(hexToBytes("0x12")),
    // );

    // const pubd1 = await schnorr.PubDerive(
    //   [proof2.pubkeyX, proof2.pubkeyY],
    //   keccak256(hexToBytes("0x124")),
    // );

    // const s1 = await schnorr.SharedSecret(pd, pubd1);

    // const s2 = await schnorr.SharedSecret(pd1, pubd);

    // const s1 = await schnorr.SharedSecret(
    //   "0x635b1ce8ddf5d21b60e346c7dbe26552c518d6ea48062b5585e53aeac5ee4461",
    //   [proof2.pubkeyX, proof2.pubkeyY],
    // );

    // const s2 = await schnorr.SharedSecret(
    //   "0x646b1ce8ddf5d21b60e346c7dbe26552c518d6ea48062b5585e53aeac5ee4461",
    //   [proof.pubkeyX, proof.pubkeyY],
    // );

    // console.log(proof2, isVerified, derivedAddress, sig);
  });
});
