# Smart Wallet Router SDK

This SDK extends the PancakeSwap Universl and Swap routers for enbling users to execute batched transactions from an abstracted smart contract wallet contract. This enables users to make advanced trades on pancakeswap such as custom gas fee token trades.

## Built-in Smart Wallet with Account Abstraction

Users have their own **built-in smart wallet** that utilizes account abstraction primitives and cryptographic protocols, such as **Schnorr Proof of Knowledge**. This leverages **zero-knowledge (ZK) proofs** in smart contracts to extend modern **Automated Market Maker (AMM)** protocols, like those used by **Uniswap** and **Pancakeswap**.

By incorporating these advancements, users benefit from features like **transaction batching** and the ability to pay **custom fee tokens**. This optimizes the typical swap flow seen in today's AMMs into a streamlined **one-signature flow**. Additionally, it enables **one-signature cross-chain trades** secured by the ZK protocol.

## Deterministic Smart Wallet Contracts

The core idea is to create a **smart wallet contract** for each user with a **deterministic address**. This smart wallet serves as a vessel for executing swap transactions via a relayer.

Since the wallet contract’s address is deterministic, users can deploy it on any chain to execute transactions in a single flow. Additionally, users can generate a **unique private/public key pair** for their wallet contract. The wallet can then implement its own **ECDSA signature** for on-chain signing and ZK proof algorithms.

- The **private key** is derived in secret off-chain.
- The **public key** is used as the salt in the deterministic **CREATE2 smart contract address**.

This architecture links the user's **Externally Owned Account (EOA)**, smart contract wallet, and public key in an intrinsic relationship.

## Cross-Chain Swap in One-Signature Flow

One of the key features of this design is the ability to execute **cross-chain swaps** with a **one-signature flow**. This involves a two-step process under the hood:
1. An **origin chain transaction**.
2. A **destination chain transaction**.

Both steps are executed by the **relayer** as part of the one-signature transaction flow.

## Example: USDT to WBNB Cross-Chain Swap

Let’s consider an example where the user holds **USDT on Ethereum Mainnet** and wishes to swap it for **WBNB on Binance's BNB Chain**. Assume that the relayer has USDT liquidity on both chains. The flow proceeds as follows:

1. The user constructs a batched transaction, sending USDT to the relayer's smart wallet on Ethereum Mainnet.
2. The relayer runs a **verification protocol**, ensuring that:
   - The user’s USDT balance decreases by the swap amount (plus fees).
   - The relayer's USDT balance increases by the swap amount (plus fees).
3. Upon successful verification, the relayer executes the destination chain transaction, sending **WBNB from their smart wallet to the user’s smart wallet** on BNB Chain.

## Relayer's Role in Cross-Chain Liquidity

In this setup, the **relayer** acts as the **source of liquidity** across all chains for cross-chain swaps. USDT serves as the gateway asset for liquidity on all supported chains. The relayer’s net USDT balance across chains remains constant, as funds used for the destination chain transaction are balanced by the funds received from the user on the origin chain.


### Batched transactions
The Smart Wallet is a smart contract router that the user can manage. the relayer of the wallet factory executes the users contract calls through signature bsed verification. 

### Witness transfers with Permit2
The smart wallet contract also integrates with permit2 to enable users to execute trades from their smart wallet through as if they were calling from their main E0A account. this means that u dont need to deposit tokens into your smart wallet and then trade from there.

Instead you execute the trade from you main EOA account and a transaction gets added into the batch which uses permit2 to do a transferFrom call from you E0A account to your smart wallet instance, before executing the rest of the trade

### Ecexute trades with custom gas token from any chain
This is possible by enbaling and implementing Signature based witness transfers with the witness being the smart wallet relaler private key. Combining all this together,  users can make trades where they dont pay gas in native currency, but rather they pay the gass fee in the equivilent amount of the base token in their trade and this fee gets sent to the smart wallet relayer, who in turns executes the trade on behalf of the user.

The smart wallet SDK also makes it possibles for users to pay transaction fees with currencies on other chains. in this scenario signtaures will be required, which maybe can be apprved, but.
