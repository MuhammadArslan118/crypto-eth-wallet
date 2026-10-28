import { ethers } from "ethers";
import { RpcProvider } from "./rpc/provider";
import { ActivityItem, NftInfo, TokenInfo } from "../shared/types";

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

const NFT_ABI = [
  "function supportsInterface(bytes4) view returns (bool)",
  "function name() view returns (string)",
  // ERC-721
  "function ownerOf(uint256) view returns (address)",
  "function tokenURI(uint256) view returns (string)",
  // ERC-1155
  "function balanceOf(address, uint256) view returns (uint256)",
  "function uri(uint256) view returns (string)",
];

// Transfer functions are overloaded across the two standards, so each gets its own interface
const ERC721_TRANSFER = new ethers.Interface(["function safeTransferFrom(address from, address to, uint256 tokenId)"]);
const ERC1155_TRANSFER = new ethers.Interface([
  "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)",
]);

const ERC721_INTERFACE = "0x80ac58cd";
const ERC1155_INTERFACE = "0xd9b67a26";

export interface AssetContext {
  rpc: RpcProvider;
  chainId: number;
  owner: string;
}

// ---------- storage helpers ----------
// tokens are stored per chain; NFTs and activity per chain + account.

async function getList<T>(key: string, scope: string): Promise<T[]> {
  const stored = (await chrome.storage.local.get(key))[key] ?? {};
  return stored[scope] ?? [];
}

async function setList<T>(key: string, scope: string, list: T[]) {
  const stored = (await chrome.storage.local.get(key))[key] ?? {};
  stored[scope] = list;
  await chrome.storage.local.set({ [key]: stored });
}

const accountScope = (ctx: AssetContext) => `${ctx.chainId}:${ctx.owner.toLowerCase()}`;

function resolveUri(uri: string) {
  if (uri.startsWith("ipfs://")) return "https://ipfs.io/ipfs/" + uri.slice(7).replace(/^ipfs\//, "");
  if (uri.startsWith("ar://")) return "https://arweave.net/" + uri.slice(5);
  return uri;
}

// ---------- tokens ----------

export async function getTokens(ctx: AssetContext): Promise<TokenInfo[]> {
  const tokens = await getList<TokenInfo>("tokens", String(ctx.chainId));
  return Promise.all(
    tokens.map(async (token) => {
      try {
        const raw = await ctx.rpc.run((p) => new ethers.Contract(token.address, ERC20_ABI, p).balanceOf(ctx.owner));
        return { ...token, balance: ethers.formatUnits(raw, token.decimals) };
      } catch {
        return token;
      }
    })
  );
}

export async function importToken(ctx: AssetContext, rawAddress: string): Promise<TokenInfo> {
  if (!ethers.isAddress(rawAddress)) throw new Error("Invalid token contract address");
  const address = ethers.getAddress(rawAddress);
  const tokens = await getList<TokenInfo>("tokens", String(ctx.chainId));
  if (tokens.some((t) => t.address === address)) throw new Error("Token already added");

  const code = await ctx.rpc.run((p) => p.getCode(address));
  if (code === "0x") throw new Error("No contract at this address on the current network");

  let token: TokenInfo;
  try {
    const [symbol, decimals] = await ctx.rpc.run((p) => {
      const c = new ethers.Contract(address, ERC20_ABI, p);
      return Promise.all([c.symbol(), c.decimals()]);
    });
    const name = await ctx.rpc.run((p) => new ethers.Contract(address, ERC20_ABI, p).name()).catch(() => undefined);
    token = { address, symbol, decimals: Number(decimals), name };
  } catch {
    throw new Error("This contract is not an ERC-20 token");
  }

  await setList("tokens", String(ctx.chainId), [...tokens, token]);
  return token;
}

export async function removeToken(ctx: AssetContext, address: string) {
  const tokens = await getList<TokenInfo>("tokens", String(ctx.chainId));
  await setList("tokens", String(ctx.chainId), tokens.filter((t) => t.address !== address));
}

export function parseAmount(amount: string, decimals: number, symbol: string): bigint {
  let value: bigint;
  try {
    value = ethers.parseUnits(amount.trim(), decimals);
  } catch {
    throw new Error(
      /\.\d+$/.test(amount.trim()) ? `${symbol} supports at most ${decimals} decimal places` : "Enter a valid amount"
    );
  }
  if (value <= 0n) throw new Error("Amount must be greater than 0");
  return value;
}

export async function buildTokenTransfer(ctx: AssetContext, tokenAddress: string, to: string, amount: string) {
  const tokens = await getList<TokenInfo>("tokens", String(ctx.chainId));
  const token = tokens.find((t) => t.address === tokenAddress);
  if (!token) throw new Error("This token isn't in your wallet on the current network");
  const value = parseAmount(amount, token.decimals, token.symbol);
  const balance: bigint = await ctx.rpc.run((p) => new ethers.Contract(token.address, ERC20_ABI, p).balanceOf(ctx.owner));
  if (value > balance) {
    throw new Error(`Insufficient ${token.symbol} balance (you have ${ethers.formatUnits(balance, token.decimals)})`);
  }
  const data = new ethers.Interface(ERC20_ABI).encodeFunctionData("transfer", [to, value]);
  return { tx: { to: token.address, data }, token };
}

// ---------- NFTs ----------

export function getNfts(ctx: AssetContext): Promise<NftInfo[]> {
  return getList<NftInfo>("nfts", accountScope(ctx));
}

async function fetchMetadata(uri: string): Promise<any> {
  try {
    const res = await fetch(resolveUri(uri), { signal: AbortSignal.timeout(10000) });
    return res.ok ? await res.json() : {};
  } catch {
    return {};
  }
}

export async function importNft(ctx: AssetContext, rawContract: string, rawTokenId: string): Promise<NftInfo> {
  if (!ethers.isAddress(rawContract)) throw new Error("Invalid NFT contract address");
  const contract = ethers.getAddress(rawContract);
  let id: bigint;
  try {
    id = BigInt(rawTokenId.trim());
  } catch {
    throw new Error("Token ID must be a number");
  }

  const nfts = await getNfts(ctx);
  if (nfts.some((n) => n.contract === contract && n.tokenId === id.toString())) throw new Error("NFT already added");

  const call = <T>(fn: (c: ethers.Contract) => Promise<T>) =>
    ctx.rpc.run((p) => fn(new ethers.Contract(contract, NFT_ABI, p)));
  const supports = (iface: string) => call((c) => c.supportsInterface(iface)).catch(() => false);

  let standard: NftInfo["standard"];
  let uri: string;
  let balance: bigint | undefined;
  if (await supports(ERC721_INTERFACE)) {
    standard = "ERC721";
    const owner: string = await call((c) => c.ownerOf(id));
    if (owner.toLowerCase() !== ctx.owner.toLowerCase()) throw new Error("This NFT is not owned by the selected account");
    uri = await call((c) => c.tokenURI(id)).catch(() => "");
  } else if (await supports(ERC1155_INTERFACE)) {
    standard = "ERC1155";
    balance = await call<bigint>((c) => c.balanceOf(ctx.owner, id));
    if (balance === 0n) throw new Error("This NFT is not owned by the selected account");
    const template: string = await call((c) => c.uri(id)).catch(() => "");
    uri = template.replace("{id}", id.toString(16).padStart(64, "0"));
  } else {
    throw new Error("This contract is not an ERC-721 or ERC-1155 NFT on the current network");
  }

  const meta = uri ? await fetchMetadata(uri) : {};
  const collection = await call((c) => c.name()).catch(() => undefined);
  const image = meta.image ?? meta.image_url;
  const nft: NftInfo = {
    contract,
    tokenId: id.toString(),
    standard,
    name: meta.name ?? `#${id}`,
    collection,
    image: typeof image === "string" ? resolveUri(image) : undefined,
    description: typeof meta.description === "string" ? meta.description : undefined,
    balance: balance?.toString(),
  };

  await setList("nfts", accountScope(ctx), [...nfts, nft]);
  return nft;
}

// Builds a safeTransferFrom call after checking the account still owns the NFT
export async function buildNftTransfer(ctx: AssetContext, contract: string, tokenId: string, to: string, quantity: string) {
  const nft = (await getNfts(ctx)).find((n) => n.contract === contract && n.tokenId === tokenId);
  if (!nft) throw new Error("This NFT isn't in your wallet on the current network");
  const id = BigInt(tokenId);
  const call = <T>(fn: (c: ethers.Contract) => Promise<T>) =>
    ctx.rpc.run((p) => fn(new ethers.Contract(contract, NFT_ABI, p)));

  if (nft.standard === "ERC721") {
    const owner: string = await call((c) => c.ownerOf(id));
    if (owner.toLowerCase() !== ctx.owner.toLowerCase()) throw new Error("You no longer own this NFT");
    const data = ERC721_TRANSFER.encodeFunctionData("safeTransferFrom", [ctx.owner, to, id]);
    return { tx: { to: contract, data }, nft, quantity: "1" };
  }

  if (!/^\d+$/.test(quantity.trim()) || BigInt(quantity) <= 0n) throw new Error("Quantity must be a whole number greater than 0");
  const amount = BigInt(quantity);
  const balance = await call<bigint>((c) => c.balanceOf(ctx.owner, id));
  if (amount > balance) throw new Error(`You only own ${balance} of this NFT`);
  const data = ERC1155_TRANSFER.encodeFunctionData("safeTransferFrom", [ctx.owner, to, id, amount, "0x"]);
  return { tx: { to: contract, data }, nft, quantity: amount.toString() };
}

async function afterNftSent(ctx: AssetContext, sent: NonNullable<ActivityItem["nft"]>) {
  const nfts = await getNfts(ctx);
  const updated: NftInfo[] = [];
  for (const n of nfts) {
    if (n.contract !== sent.contract || n.tokenId !== sent.tokenId) {
      updated.push(n);
    } else if (n.standard === "ERC1155") {
      // Keep ERC-1155s the account still holds some of
      const balance = await ctx.rpc
        .run((p) => new ethers.Contract(n.contract, NFT_ABI, p).balanceOf(ctx.owner, BigInt(n.tokenId)))
        .catch(() => null);
      if (balance === null || balance > 0n) updated.push({ ...n, balance: balance?.toString() ?? n.balance });
    }
  }
  await setList("nfts", accountScope(ctx), updated);
}

export async function removeNft(ctx: AssetContext, contract: string, tokenId: string) {
  const nfts = await getNfts(ctx);
  await setList("nfts", accountScope(ctx), nfts.filter((n) => !(n.contract === contract && n.tokenId === tokenId)));
}

// ---------- activity ----------

export async function addActivity(ctx: AssetContext, item: ActivityItem) {
  const items = await getList<ActivityItem>("activity", accountScope(ctx));
  await setList("activity", accountScope(ctx), [item, ...items].slice(0, 100));
}

export async function getActivity(ctx: AssetContext): Promise<ActivityItem[]> {
  const items = await getList<ActivityItem>("activity", accountScope(ctx));
  let changed = false;
  await Promise.all(
    items
      .filter((i) => i.status === "pending")
      .map(async (item) => {
        const receipt = await ctx.rpc.getTransactionReceipt(item.hash).catch(() => null);
        if (receipt) {
          item.status = receipt.status === 1 ? "confirmed" : "failed";
          changed = true;
          if (item.status === "confirmed" && item.nft) await afterNftSent(ctx, item.nft);
        }
      })
  );
  if (changed) await setList("activity", accountScope(ctx), items);
  return items;
}
