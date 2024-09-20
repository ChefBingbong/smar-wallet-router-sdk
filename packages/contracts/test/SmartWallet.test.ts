import { keccak256 } from "ethers/lib/utils";
import { ethers } from "hardhat";
import * as secp from "@noble/secp256k1";
// Generate a private key
const privateKey = secp.utils.randomPrivateKey();
console.log("Private Key:", ethers.utils.hexlify(privateKey));

// Generate a public key
const publicKey = secp.Point.fromHex(secp.getPublicKey(privateKey));
console.log("Public Key:", ethers.utils.hexlify(secp.getPublicKey(privateKey)));

describe.skip("Factory", function () {
  it("should deploy a contract to a predetermined address using CREATE2", async function () {
    // Compile and deploy the Factory contract
    const Factory = await ethers.getContractFactory("Factory");
    const factory = await Factory.deploy();
    await factory.deployed();

    console.log("Factory deployed to:", factory.address);

    // Your contract bytecode (example: a simple contract)
    const SimpleStorage = await ethers.getContractFactory("SimpleStorage");
    const simpleStorageBytecode = SimpleStorage.bytecode;

    // Generate private key and derive public key and address
    //     const wallet = ethers.Wallet.createRandom();
    //     const privateKey = wallet.privateKey;
    //     const derivedAddress = wallet.address;
    console.log(
      "Derived Address:",
      ethers.utils.computeAddress(ethers.utils.hexlify(privateKey)),
    );

    // Chosen nonce
    const nonce = ethers.utils.randomBytes(32); // Random nonce for demonstration

    // Derive salt from private key and nonce using PrivDerive
    const derivedSalt = await factory.PubDerive(
      [BigInt(publicKey.x), BigInt(publicKey.y)],
      keccak256(simpleStorageBytecode),
    );
    console.log("Derived Salt:", derivedSalt);

    // Compute the address
    const computedAddress = await factory.computeAddress(
      simpleStorageBytecode,
      "0x" + secp.utils.bytesToHex(privateKey),
    );
    console.log("Computed address:", computedAddress);

    // Deploy the contract
    const tx = await factory.deploy(simpleStorageBytecode, derivedSalt);
    await tx.wait();

    console.log("Contract deployed at:", computedAddress);

    // Check that the contract is deployed at the computed address
    const code = await ethers.provider.getCode(computedAddress);
    expect(code).to.not.equal("0x");
  });
});
