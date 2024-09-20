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
} from "../typechain-types";
import { TxType, sign, signMessage } from "./utils/sign";
import type { AllowanceOp, UserOp } from "./utils/sign";

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
import { maxUint256, zeroAddress } from "viem";
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
import { Schnorr2 } from "../typechain-types/contracts/Deployer.sol";

describe.skip("Schnorr signer", () => {
  // const PERMIT2_ADDRESS = getPermit2Address(97);
  let OWNER: SignerWithAddress;
  let BOB: SignerWithAddress;

  // ALICE
  let ALICE: SignerWithAddress;

  // Forwarder
  let factory: ECDSAWalletFactory;
  let bridgeVerifier: WalletBridgeVerifier;
  let schnorr: Schnorr2;

  // Wallets
  let aliceWallet: ECDSAWallet;
  let wallet: SmartWalletFactory;
  let amm: AMMSwap;

  let weth: ABC;
  let cake: XYZ;
  let busd: PQR;

  before(async () => {
    [OWNER, ALICE, BOB] = await ethers.getSigners();

    await deployERC20();

    const Schnorr = (await ethers.getContractFactory(
      "Schnorr2",
    )) as Schnorr2__factory;

    schnorr = await Schnorr.connect(OWNER).deploy();
    await schnorr.deployed();

    const AMM = (await ethers.getContractFactory(
      "AMMSwap",
    )) as AMMSwap__factory;

    amm = await AMM.connect(OWNER).deploy(cake.address, busd.address);
    await amm.deployed();

    const BridgeVerifiewr = (await ethers.getContractFactory(
      "WalletBridgeVerifier",
    )) as WalletBridgeVerifier__factory;

    bridgeVerifier = await BridgeVerifiewr.connect(OWNER).deploy();
    await bridgeVerifier.deployed();
    console.log(bridgeVerifier.address, "hhssshh");
    const Wallet = (await ethers.getContractFactory(
      "SmartWalletFactory",
    )) as SmartWalletFactory__factory;

    wallet = await Wallet.connect(OWNER).deploy(
      schnorr.address,
      weth.address,
      amm.address,
      amm.address,
      [weth.address, cake.address, busd.address],
    );
    await wallet.deployed();

    const WalletFactory = (await ethers.getContractFactory(
      "ECDSAWalletFactory",
    )) as ECDSAWalletFactory__factory;

    factory = await WalletFactory.connect(OWNER).deploy(wallet.address);
    await factory.deployed();

    weth.connect(OWNER).transfer(amm.address, "1000000000000000000000");
    cake.connect(OWNER).transfer(amm.address, "1000000000000000000000");
    busd.connect(OWNER).transfer(amm.address, "1000000000000000000000");

    cake.connect(OWNER).transfer(ALICE.address, "1000000000000000000000");
    console.log(
      amm.address,
      OWNER.address,
      ALICE.address,
      factory.address,
      "bbbbbbb",
      cake.address,
      busd.address,
    );
  });

  async function deployERC20() {
    const WETH = await ethers.getContractFactory("ABC");
    weth = (await WETH.deploy()) as ABC;
    await weth.deployed();

    const CAKE = await ethers.getContractFactory("XYZ");
    cake = (await CAKE.deploy()) as XYZ;
    await cake.deployed();

    const BUSD = await ethers.getContractFactory("PQR");
    busd = (await BUSD.deploy()) as PQR;
    await busd.deployed();
  }

  // ----- UPDATE PARNER -----
  it("User should be able to create a wallet for themselves.", async () => {
    const alicewalletAddress = await factory.walletAddress(
      [
        BigInt(
          84284270271297656433601178168022578829048976534976517467395189321973636294832n,
        ),
        BigInt(
          96998702249865025088052574999571193287198489460179910867321993813776155833588n,
        ),
      ],
      ALICE.address,
      0,
    );
    console.log(alicewalletAddress, "al");
    await factory.connect(ALICE).createWallet(
      [
        BigInt(
          84284270271297656433601178168022578829048976534976517467395189321973636294832n,
        ),
        BigInt(
          96998702249865025088052574999571193287198489460179910867321993813776155833588n,
        ),
      ],
      ALICE.address,

      { value: 15000000000 },
    );

    aliceWallet = await ECDSAWallet__factory.connect(alicewalletAddress, ALICE);
    console.log(aliceWallet.address);
    expect(await aliceWallet.owner()).to.equal(ALICE.address);
  });

  it("User should be able to deposit", async () => {
    await cake
      .connect(ALICE)
      .approve(aliceWallet.address, MaxAllowanceTransferAmount); // approve max
    await weth
      .connect(ALICE)
      .approve(aliceWallet.address, MaxAllowanceTransferAmount); // approve max
    await busd
      .connect(ALICE)
      .approve(aliceWallet.address, MaxAllowanceTransferAmount); // approve max

    const reciever = ALICE.address;
    const amount = BigInt(1 * 10 ** 18);

    const scwallet = new ethers.Wallet(
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690e",
    );
    const scadd = await scwallet.getAddress();
    console.log(
      scadd,
      aliceWallet.address,
      ALICE.address,
      wallet.address,
      factory.address,
    );
    // const d = await scwallet.signMess
    console.log(formatEther(await busd.balanceOf(ALICE.address)));
    console.log(formatEther(await cake.balanceOf(ALICE.address)));
    console.log(formatEther(await cake.balanceOf(aliceWallet.address)));
    console.log(formatEther(await busd.balanceOf(aliceWallet.address)));
    console.log(formatEther(await cake.balanceOf(OWNER.address)));
    console.log(formatEther(await busd.balanceOf(OWNER.address)));

    const allowanceOps = {
      details: [
        {
          token: cake.address,
          amount: MaxAllowanceTransferAmount,
          expiration: BigInt(toDeadline(PERMIT_EXPIRATION).toString()),
          nonce: 0n,
        },
        {
          token: cake.address,
          amount: MaxAllowanceTransferAmount,
          expiration: BigInt(toDeadline(PERMIT_EXPIRATION).toString()),
          nonce: 1n,
        },
      ],
      spender: aliceWallet.address,
      sigDeadline: BigInt(toDeadline(PERMIT_SIG_EXPIRATION)),
    } as AllowanceOp;

    const walletTransferMeta = await aliceWallet
      .connect(OWNER)
      .populateTransaction.transferFrom(
        ALICE.address,
        aliceWallet.address,
        amount * 2n,
        cake.address,
      );
    const approveAMMMeta = await cake
      .connect(OWNER)
      .populateTransaction.approve(amm.address, amount);

    const swapMeta = await amm
      .connect(OWNER)
      .populateTransaction.swap(amount, reciever);

    const approveAMMMeta2 = await cake
      .connect(OWNER)
      .populateTransaction.approve(amm.address, amount);

    const swapMeta2 = await amm
      .connect(OWNER)
      .populateTransaction.swap(amount, reciever);

    const userOps = [
      {
        to: walletTransferMeta.to,
        amount: 0n,
        chainId: 31337,
        data: walletTransferMeta.data,
      },
      {
        to: approveAMMMeta.to,
        amount: 0n,
        chainId: 31337,
        data: approveAMMMeta.data,
      },
      {
        to: swapMeta.to,
        amount: 0n,
        chainId: 31337,
        data: swapMeta.data,
      },
    ] as UserOp[];

    const bridgeOps = [
      {
        to: approveAMMMeta2.to,
        amount: 0n,
        chainId: 31337,
        data: approveAMMMeta2.data,
      },
      {
        to: swapMeta2.to,
        amount: 0n,
        chainId: 31337,
        data: swapMeta2.data,
      },
    ] as UserOp[];

    console.log(
      userOps.forEach((op) => {
        console.log(op.data);
      }),
    );
    const signedDataValues = await sign(
      userOps,
      bridgeOps,
      allowanceOps,
      0,
      ALICE,
      OWNER,
      31337,
      31337,
      31337,
      aliceWallet.address,
      TxType.SourceChainOp,
    );

    // const signedDataBridgeValues = await sign(
    //   userOps,
    //   bridgeOps,
    //   allowanceOps,
    //   0,
    //   OWNER,
    //   31337,
    //   31337,
    //   31337,
    //   aliceWallet.address,
    //   TxType.SourceChainOp,
    // );

    const execMeta = await aliceWallet
      .connect(OWNER)
      .populateTransaction.exec(
        signedDataValues.values,
        signedDataValues.signature,
      );
    // const execMeta2 = await aliceWallet
    //   .connect(OWNER)
    //   .populateTransaction.execBridge(
    //     signedDataValues.values,
    //     signedDataValues.signature,
    //     signedDataBridgeValues.signature,
    //   );
    const consig = buildContractSignature(aliceWallet.address, "0x");
    const usersig = buildSignature(ALICE.address, signedDataValues.s2);
    const sigs = buildSignatureBytes([usersig, consig]);
    console.log("dd");

    console.log(sigs);
    // console.log(keccak256(defaultAbiCoder.encode(execMeta)));
    const relayerTx = await OWNER.sendTransaction(execMeta);

    // await cake
    //   .connect(OWNER)
    //   .transfer(aliceWallet.address, "1000000000000000000");
    // const relayerTx2 = await OWNER.sendTransaction(execMeta2);

    const receipt = await relayerTx.wait(1);
    if (bridgeOps.length > 0) {
      const block = await ALICE.provider?.getBlock(receipt.blockNumber);
      const dataSig = await aliceWallet.signedMessages2(0);
      const proof = defaultAbiCoder.encode(
        ["uint256", "uint256", "bytes32"],
        [receipt.blockNumber, block?.timestamp, keccak256(dataSig)],
      );
      const execMeta2 = await aliceWallet
        .connect(OWNER)
        .populateTransaction.execBridge(
          signedDataValues.values,
          signedDataValues.s2,
          proof,
        );
      const relayerTx2 = await OWNER.sendTransaction(execMeta2);
    }
    // // Retrieve the timestamp from the block information
    // const timestamp = block.timestamp;
    // console.log(
    //   await aliceWallet
    //     .connect(OWNER)
    //     .recoverContractSignature(receipt.blockNumber, timestamp),
    //   "ooo",
    // );
    // const signedDataBridgeValues = await sign(
    //   userOps,
    //   bridgeOps,
    //   allowanceOps,
    //   0,
    //   OWNER,

    //   31337,
    //   31337,
    //   31337,
    //   aliceWallet.address,
    //   TxType.SourceChainOp,
    // );

    console.log(receipt);

    console.log(formatEther(await busd.balanceOf(ALICE.address)));
    console.log(formatEther(await cake.balanceOf(ALICE.address)));
    console.log(formatEther(await cake.balanceOf(aliceWallet.address)));
    console.log(formatEther(await busd.balanceOf(aliceWallet.address)));
    console.log(formatEther(await cake.balanceOf(OWNER.address)));
    console.log(formatEther(await busd.balanceOf(OWNER.address)));

    // console.log(sigs);
    const sessionPrivateKey = ethers.utils.randomBytes(32);
    // localStorage.setItem('sessionPrivateKey', ethers.utils.hexlify(sessionPrivateKey))
    // const sessionWallet = new ethers.Wallet(sessionPrivateKey);
    // const sessionAddress = await sessionWallet.getAddress();
    // console.log(sessionAddress);
    // console.log(await wallet.priv());
    // const scwallet = new ethers.Wallet(await wallet.priv());
    // const scadd = await scwallet.getAddress();
    // console.log(scadd, aliceWallet.address);
    // const d = await scwallet.signMessage("hello");
    // console.log(d);
    // console.log(await ethers.utils.verifyMessage("hello", d));

    // let message = ethers.utils.hexlify(ethers.utils.randomBytes(250));
    // let hash = ethers.utils.keccak256(ethers.utils.randomBytes(32));

    // // let wallet_b = SequenceWallet.basicWallet(context, {
    //   address: wallet.address,
    //   signing: 2,
    //   idle: 1,
    // });
    // // console.log(await aliceWallet.priv());
    // const signature = await signMessage(message);
    // [
    //   0x04a8db6a3a6ebb48f2bf573599ac12bda1ffc5c1f5fe1a5179719f0eb6d20e05,
    //   0x2ebb9c64ef99bbd299c7e1595c459f3301a1c28d50226d4c6882d584e71f6464,
    // ];
    const publicKey = ethers.utils.computePublicKey(
      "0x2ebb9c64ef99bbd299c7e1595c459f3301a1c28d50226d4c6882d584e71f6464",
      true,
    );
    // const p =
    // Split the public key into its components (x, y)
    // const publicKeyComponents = ethers.utils.splitSignature(publicKey);

    console.log(publicKey);
  });
});
