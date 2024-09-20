import * as scep from "@noble/secp256k1";
import { keccak256 } from "ethers/lib/utils";
import { ethers } from "ethers";

// Generate a private key
const privateKey = scep.utils.randomPrivateKey();
console.log("Private Key:", ethers.utils.hexlify(privateKey));

// Generate a public key
const publicKey = scep.getPublicKey(privateKey);
console.log("Public Key:", ethers.utils.hexlify(publicKey));

// Derive the Ethereum address from the public key
const publicKeyBuffer = Buffer.from(publicKey.slice(1)); // Remove the 0x04 prefix
const address = keccak256(publicKeyBuffer).slice(-40); // Take the last 20 bytes
const derivedAddress = ethers.utils.getAddress(`0x${address}`);
console.log("Derived Address:", derivedAddress);
