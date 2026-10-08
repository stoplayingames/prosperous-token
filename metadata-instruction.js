/**
 * Shared instruction builder for the PROSP token metadata attachment.
 * Used by BOTH the browser page (index.html) and the Node devnet test,
 * so the exact code path is validated before mainnet use.
 *
 * Builds a Metaplex Token Metadata `CreateMetadataAccountV3` instruction
 * (discriminator 33). The resulting transaction contains ONLY this one
 * instruction: it creates the metadata account and moves no tokens or SOL
 * anywhere except the metadata account rent.
 */
import { Buffer } from 'buffer';
import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';

export const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'
);

export function getMetadataPda(mintAddress) {
  const mint = new PublicKey(mintAddress);
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
  return pda;
}

function encodeBorshString(str) {
  const bytes = Buffer.from(str, 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(bytes.length, 0);
  return Buffer.concat([len, bytes]);
}

/**
 * @param {object} p
 * @param {string} p.mint            SPL mint address
 * @param {string} p.mintAuthority   must sign (the PROSP mint authority = user's wallet)
 * @param {string} p.payer           pays the metadata account rent, must sign
 * @param {string} p.updateAuthority future metadata update authority (no signature needed now)
 * @param {string} p.name            max 32 chars
 * @param {string} p.symbol          max 10 chars
 * @param {string} p.uri             max 200 chars, https URL of the JSON metadata
 * @returns {TransactionInstruction} exactly one create-metadata instruction
 */
export function buildCreateMetadataInstruction(p) {
  const mint = new PublicKey(p.mint);
  const mintAuthority = new PublicKey(p.mintAuthority);
  const payer = new PublicKey(p.payer);
  const updateAuthority = new PublicKey(p.updateAuthority);
  const metadataPda = getMetadataPda(p.mint);

  if (p.name.length > 32) throw new Error('name too long (max 32)');
  if (p.symbol.length > 10) throw new Error('symbol too long (max 10)');
  if (p.uri.length > 200) throw new Error('uri too long (max 200)');

  // CreateMetadataAccountV3 layout:
  //   u8 discriminator (33)
  //   DataV2 { name: String, symbol: String, uri: String, seller_fee_basis_points: u16,
  //            creators: Option<Vec<Creator>> = None, collection: Option = None, uses: Option = None }
  //   is_mutable: bool
  //   collection_details: Option = None
  const sellerFee = Buffer.alloc(2);
  sellerFee.writeUInt16LE(0, 0);
  const data = Buffer.concat([
    Buffer.from([33]),
    encodeBorshString(p.name),
    encodeBorshString(p.symbol),
    encodeBorshString(p.uri),
    sellerFee,
    Buffer.from([0]), // creators: None
    Buffer.from([0]), // collection: None
    Buffer.from([0]), // uses: None
    Buffer.from([1]), // is_mutable: true
    Buffer.from([0]), // collection_details: None
  ]);

  return new TransactionInstruction({
    programId: TOKEN_METADATA_PROGRAM_ID,
    keys: [
      { pubkey: metadataPda, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: mintAuthority, isSigner: true, isWritable: false },
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: updateAuthority, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
  });
}
