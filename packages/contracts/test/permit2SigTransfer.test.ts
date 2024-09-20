import { ethers } from "hardhat";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
// import { it } from "mocha";
// import { SmartWallet, SmartWalletFactory, ABC, XYZ } from "../../typechain-types";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import type {
  SmartWallet,
  SmartWalletFactory,
  ABC,
  XYZ,
  ECDSAWalletFactory,
  ECDSAWalletFactory__factory,
  SmartWalletFactory__factory,
  IWallet,
  ECDSAWallet,
} from "../typechain-types";
import { UserOp, sign } from "./utils/sign";
import {
  PERMIT2_ADDRESS,
  SignatureTransfer,
  Witness,
} from "@uniswap/permit2-sdk";
import { constants } from "ethers";
import { PermitTransferFrom } from "@uniswap/permit2-sdk";
import { Console } from "console";

describe.skip("Permit2 Signature Transfer", () => {
  async function loadContracts() {
    const [ALICE, OWNER, BOB] = await ethers.getSigners();

    console.log(await ethers.provider.getNetwork());
    const permit2 = await ethers.getContractAt("IPermit2", PERMIT2_ADDRESS);

    const Wallet = (await ethers.getContractFactory(
      "SmartWalletFactory",
    )) as SmartWalletFactory__factory;

    const wallet = await Wallet.connect(ALICE).deploy();
    await wallet.deployed();

    const WalletFactory = (await ethers.getContractFactory(
      "ECDSAWalletFactory",
    )) as ECDSAWalletFactory__factory;

    const factory = await WalletFactory.connect(ALICE).deploy(
      wallet.address,
      PERMIT2_ADDRESS,
    );
    await factory.deployed();

    console.log("FACTORY", wallet.address);
    console.log("ECDSAFACTORY", factory.address);

    return { factory, permit2, wallet, ALICE, OWNER, BOB };
  }

  async function deployERC20() {
    const ABC = await ethers.getContractFactory("ABC");
    const abc = (await ABC.deploy()) as ABC;
    await abc.deployed();
    return { abc };
  }

  // ----- UPDATE PARNER -----
  it("User should be able to create a wallet for themselves.", async () => {
    const { factory, permit2, wallet, ALICE, OWNER, BOB } =
      await loadFixture(loadContracts);
    const { abc } = await deployERC20();
    await abc.transfer(OWNER.address, "100000000000000000000");

    const alicewaladdr = await factory.walletAddress(OWNER.address, 0);
    await factory
      .connect(OWNER)
      .createWallet(OWNER.address, { value: 15000000000 });

    const OWNERWallet = (await ethers.getContractAt(
      "ECDSAWallet",
      alicewaladdr,
    )) as ECDSAWallet;

    // expect(await OWNERWallet.ALICE()).to.equal(OWNER.address);
  });

  it("User should be able to deposit", async () => {
    const { factory, permit2, wallet, ALICE, OWNER, BOB } =
      await loadFixture(loadContracts);
    const { abc } = await deployERC20();
    await abc.transfer(OWNER.address, "100000000000000000000");

    await abc.connect(ALICE).approve(PERMIT2_ADDRESS, constants.MaxUint256); // approve max
    const alicewaladdr = await factory.walletAddress(ALICE.address, 0);
    const dep = await factory
      .connect(ALICE)
      .createWallet(ALICE.address, { value: 15000000000 });
    await dep.wait(1);
    const alicewallet = (await ethers.getContractAt(
      "ECDSAWallet",
      alicewaladdr,
    )) as ECDSAWallet;
    await alicewallet.deployed();
    const amount = 1000;

    console.log(ALICE.address, OWNER.address, BOB.address);
    console.log(await factory.tokenBalancesByUser(OWNER.address, abc.address));
    console.log(await factory.tokenBalancesByUser(BOB.address, abc.address));

    const permit: PermitTransferFrom = {
      permitted: {
        token: abc.address,
        amount: amount,
      },
      spender: factory.address,
      nonce: 0,
      deadline: constants.MaxUint256,
    };

    const witness: Witness = {
      witnessTypeName: "Witness",
      witnessType: { Witness: [{ name: "user", type: "address" }] },
      witness: { user: OWNER.address },
    };
    const { domain, types, values } = SignatureTransfer.getPermitData(
      permit,
      PERMIT2_ADDRESS,
      1,
      witness,
    );
    let signature = await ALICE._signTypedData(domain, types, values);

    const t = await factory.populateTransaction.deposit(
      amount,
      abc.address,
      ALICE.address,
      OWNER.address,
      permit,
      signature,
    );

    const op = [
      {
        to: t.to,
        amount: 0n,
        data: t.data,
      },
    ] as UserOp[];
    const exec = await alicewallet
      .connect(OWNER)
      .populateTransaction.exec(op, "0x00");
    const xx = await OWNER.sendTransaction(exec);
    const r = await xx.wait(1);
    console.log(r);
    console.log(await factory.tokenBalancesByUser(OWNER.address, abc.address));
    await factory
      .connect(OWNER)
      .withdrawERC20(abc.address, 500, alicewallet.address);
    console.log(await factory.tokenBalancesByUser(OWNER.address, abc.address));
    console.log(
      await factory.tokenBalancesByUser(alicewallet.address, abc.address),
    );

    // console.log(factory.signer);

    // expect(await vault.tokenBalancesByUser(user.address, abc.address), amount);
    // expect(await erc20.balanceOf(ALICE.address), 0);
    // expect(await erc20.balanceOf(vault.address), amount);
  });
});
