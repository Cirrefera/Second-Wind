import { createPublicClient, decodeEventLog, http, parseAbi } from "viem";
import { base } from "viem/chains";
import { CommerceError, NETWORK, USDC, sameAddress, authorizationKey } from "./contracts.js";

// Read-only evidence for the existing purchase ledger. This module has no
// wallet, signer, facilitator settlement method, or transaction submission.
const events = parseAbi([
  "event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

export async function confirmPurchaseTransfer(env, row, purchase, transaction) {
  if (!/^0x[\da-f]{64}$/i.test(transaction || "")) {
    throw new CommerceError("transaction_hash_required",400);
  }
  if (purchase.network !== NETWORK || !sameAddress(purchase.asset,USDC)) {
    throw new CommerceError("unsupported_reconciliation_network",409);
  }
  let client, chainId, receipt, finalized, block;
  try {
    // Only operator configuration chooses the RPC. Buyer input is a hash.
    const url = new URL(env.X402_READ_RPC_URL || base.rpcUrls.default.http[0]);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error();
    client = createPublicClient({chain:base,transport:http(url.href,{timeout:10000,retryCount:0})});
    [chainId,receipt,finalized] = await Promise.all([
      client.getChainId(), client.getTransactionReceipt({hash:transaction}),
      client.getBlock({blockTag:"finalized"}),
    ]);
    if (chainId !== base.id) throw new CommerceError("reconciliation_network_mismatch",409);
    if (receipt.status !== "success") throw new CommerceError("transaction_not_successful",409);
    if (receipt.blockNumber === null || finalized.number === null || receipt.blockNumber > finalized.number) {
      throw new CommerceError("transaction_not_finalized",409);
    }
    block = await client.getBlock({blockNumber:receipt.blockNumber});
  } catch (error) {
    if (error instanceof CommerceError) throw error;
    throw new CommerceError("reconciliation_unavailable",503,
      {hint:"Keep the original purchase. Retry reconciliation when its transaction is finalized and the Base reader is available."});
  }
  if (receipt.transactionHash.toLowerCase() !== transaction.toLowerCase()
      || block.hash !== receipt.blockHash || block.number !== receipt.blockNumber) {
    throw new CommerceError("transaction_block_mismatch",409);
  }
  const logs = receipt.logs.filter(log => sameAddress(log.address,purchase.asset));
  let matched = false;
  for (let index = 0; index + 1 < logs.length; index++) {
    let used, transfer;
    try {
      used = decodeEventLog({abi:events,data:logs[index].data,topics:logs[index].topics,strict:true});
      transfer = decodeEventLog({abi:events,data:logs[index+1].data,topics:logs[index+1].topics,strict:true});
    } catch { continue; }
    if (used.eventName !== "AuthorizationUsed" || transfer.eventName !== "Transfer") continue;
    if (!sameAddress(used.args.authorizer,row.payer)) continue;
    // Circle emits AuthorizationUsed immediately before its corresponding
    // Transfer. Bind both events, not an unrelated transfer in the same batch.
    const key = await authorizationKey(purchase.network,purchase.asset,row.payer,used.args.nonce);
    if (key === row.payment_key && sameAddress(transfer.args.from,row.payer)
        && sameAddress(transfer.args.to,purchase.pay_to)
        && transfer.args.value === BigInt(purchase.amount_usdc_micros)) {
      matched = true;
      break;
    }
  }
  if (!matched) throw new CommerceError("transaction_purchase_mismatch",409);
  return {transaction:receipt.transactionHash,network:purchase.network,payer:row.payer,
    block_hash:receipt.blockHash,block_number:receipt.blockNumber.toString(),
    settled_at:new Date(Number(block.timestamp)*1000).toISOString()};
}
