import { Connection, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js'
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor'
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { IDL } from './wallet-context'

const DEVNET = 'https://api.devnet.solana.com'
const connection = new Connection(DEVNET, 'confirmed')
const PROGRAM_ID = new PublicKey("HSvH1CMkjiY6ce5B4BjuHNkHdan6sGb9J5d1WUUJf1GM")

function getProvider(wallet: any) {
  return new AnchorProvider(connection, wallet, { preflightCommitment: 'confirmed' })
}

export async function checkExistingListing(
  wallet: any,
  propertyId: string
): Promise<boolean> {
  try {
    const provider = getProvider(wallet)
    const program = new Program(IDL as any, provider)
    const seller = new PublicKey(wallet.publicKey.toString())
    const [registryPda] = PublicKey.findProgramAddressSync([Buffer.from("registry")], PROGRAM_ID)
    const [propertyPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("property"), registryPda.toBuffer(), Buffer.from(propertyId)],
      PROGRAM_ID
    )

    const propAccount = await (program.account as any).propertyState.fetch(propertyPda)
    const mintPk = propAccount.tokenMint as PublicKey

    const [saleListingPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("sale_listing"), seller.toBuffer(), propertyPda.toBuffer(), mintPk.toBuffer()],
      PROGRAM_ID
    )

    const existingAccount = await connection.getAccountInfo(saleListingPda)
    return existingAccount !== null
  } catch (e) {
    console.error('Error checking existing listing:', e)
    return false
  }
}

export async function createSaleListing(
  wallet: any,
  propertyId: string,
  tokenAmount: number,
  pricePerTokenLamports: number
) {
  const provider = getProvider(wallet)
  const program = new Program(IDL as any, provider)
  const seller = new PublicKey(wallet.publicKey.toString())
  const [registryPda] = PublicKey.findProgramAddressSync([Buffer.from("registry")], PROGRAM_ID)
  const [propertyPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("property"), registryPda.toBuffer(), Buffer.from(propertyId)],
    PROGRAM_ID
  )

  const propAccount = await (program.account as any).propertyState.fetch(propertyPda)
  const mintPk = propAccount.tokenMint as PublicKey

  const [saleListingPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("sale_listing"), seller.toBuffer(), propertyPda.toBuffer(), mintPk.toBuffer()],
    PROGRAM_ID
  )

  const [listingVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("listing_vault"), seller.toBuffer(), propertyPda.toBuffer(), mintPk.toBuffer()],
    PROGRAM_ID
  )

  const sellerTokenAccount = getAssociatedTokenAddressSync(mintPk, seller, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID)
  
  // Check if a listing account already exists
  // The smart contract cannot create a listing if ANY account exists at this PDA
  const existingAccount = await connection.getAccountInfo(saleListingPda)
  if (existingAccount) {
    // Check if it's active
    let isActive = false
    try {
      const listing = await (program.account as any).saleListing.fetch(saleListingPda)
      isActive = listing.isActive
    } catch (e: any) {
      // If we can't decode with Anchor, manually check the isActive byte
      if (existingAccount.data.length >= 113) { // 8 + 32 + 32 + 32 + 8 + 8 + 1
        isActive = existingAccount.data[112] === 1
      }
    }
    
    if (isActive) {
      throw new Error('You already have an active listing for this property. Please cancel it first in the "Active Listings" section below.')
    } else {
      // Account exists but is inactive - propose cleanup
      throw new Error('A stale listing record exists for this property. Please click "Cancel" on this property in your Active Listings first to clean it up (you will receive a small SOL refund), then you can list it again.')
    }
  }

  return await program.methods.createSaleListing(new BN(tokenAmount), new BN(pricePerTokenLamports))
    .accounts({
      saleListing: saleListingPda,
      listingVault: listingVaultPda,
      sellerTokenAccount,
      property: propertyPda,
      tokenMint: mintPk,
      registry: registryPda,
      seller,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc()
}

export async function cancelSaleListing(
  wallet: any,
  propertyId: string
) {
  const provider = getProvider(wallet)
  const program = new Program(IDL as any, provider)
  const seller = new PublicKey(wallet.publicKey.toString())
  const [registryPda] = PublicKey.findProgramAddressSync([Buffer.from("registry")], PROGRAM_ID)
  const [propertyPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("property"), registryPda.toBuffer(), Buffer.from(propertyId)],
    PROGRAM_ID
  )

  const propAccount = await (program.account as any).propertyState.fetch(propertyPda)
  const mintPk = propAccount.tokenMint as PublicKey

  const [saleListingPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("sale_listing"), seller.toBuffer(), propertyPda.toBuffer(), mintPk.toBuffer()],
    PROGRAM_ID
  )

  const [listingVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("listing_vault"), seller.toBuffer(), propertyPda.toBuffer(), mintPk.toBuffer()],
    PROGRAM_ID
  )

  const sellerTokenAccount = getAssociatedTokenAddressSync(mintPk, seller, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID)

  // CRITICAL: Smart contract has a bug - it cannot close PDA accounts properly
  // This will fail with "instruction spent from the balance of an account it does not own"
  // You MUST deploy the fixed contract from solana-program/FIXED_CONTRACT.rs
  return await program.methods.cancelSaleListing()
    .accounts({
      saleListing: saleListingPda,
      listingVault: listingVaultPda,
      sellerTokenAccount,
      property: propertyPda,
      tokenMint: mintPk,
      registry: registryPda,
      seller,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc()
}

export async function executeSale(
  wallet: any,
  sellerStr: string,
  propertyId: string
) {
  const provider = getProvider(wallet)
  const program = new Program(IDL as any, provider)
  const buyer = new PublicKey(wallet.publicKey.toString())
  const seller = new PublicKey(sellerStr)
  const [registryPda] = PublicKey.findProgramAddressSync([Buffer.from("registry")], PROGRAM_ID)
  const [propertyPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("property"), registryPda.toBuffer(), Buffer.from(propertyId)],
    PROGRAM_ID
  )

  const propAccount = await (program.account as any).propertyState.fetch(propertyPda)
  const mintPk = propAccount.tokenMint as PublicKey
  const [treasuryPda] = PublicKey.findProgramAddressSync([Buffer.from("treasury")], PROGRAM_ID)

  const [saleListingPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("sale_listing"), seller.toBuffer(), propertyPda.toBuffer(), mintPk.toBuffer()],
    PROGRAM_ID
  )

  const [listingVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("listing_vault"), seller.toBuffer(), propertyPda.toBuffer(), mintPk.toBuffer()],
    PROGRAM_ID
  )

  const buyerTokenAccount = getAssociatedTokenAddressSync(mintPk, buyer, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID)

  return await program.methods.executeSale()
    .accounts({
      saleListing: saleListingPda,
      listingVault: listingVaultPda,
      buyerTokenAccount,
      treasury: treasuryPda,
      property: propertyPda,
      tokenMint: mintPk,
      registry: registryPda,
      seller,
      buyer,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc()
}

export async function lockTokens(
  wallet: any,
  propertyId: string,
  tokenAmount: number,
  lockDurationDays: number
) {
  const provider = getProvider(wallet)
  const program = new Program(IDL as any, provider)
  const investor = new PublicKey(wallet.publicKey.toString())
  const [registryPda] = PublicKey.findProgramAddressSync([Buffer.from("registry")], PROGRAM_ID)
  const [propertyPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("property"), registryPda.toBuffer(), Buffer.from(propertyId)],
    PROGRAM_ID
  )

  const propAccount = await (program.account as any).propertyState.fetch(propertyPda)
  const mintPk = propAccount.tokenMint as PublicKey

  const [lockupPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("lockup"), investor.toBuffer(), propertyPda.toBuffer(), mintPk.toBuffer()],
    PROGRAM_ID
  )

  const [lockupVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("lockup_vault"), investor.toBuffer(), propertyPda.toBuffer(), mintPk.toBuffer()],
    PROGRAM_ID
  )

  const investorTokenAccount = getAssociatedTokenAddressSync(mintPk, investor, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID)

  return await program.methods.lockTokens(new BN(tokenAmount), new BN(lockDurationDays))
    .accounts({
      lockup: lockupPda,
      lockupVault: lockupVaultPda,
      investorTokenAccount,
      property: propertyPda,
      tokenMint: mintPk,
      registry: registryPda,
      investor,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc()
}

export async function unlockTokens(
  wallet: any,
  propertyId: string
) {
  const provider = getProvider(wallet)
  const program = new Program(IDL as any, provider)
  const investor = new PublicKey(wallet.publicKey.toString())
  const [registryPda] = PublicKey.findProgramAddressSync([Buffer.from("registry")], PROGRAM_ID)
  const [propertyPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("property"), registryPda.toBuffer(), Buffer.from(propertyId)],
    PROGRAM_ID
  )

  const propAccount = await (program.account as any).propertyState.fetch(propertyPda)
  const mintPk = propAccount.tokenMint as PublicKey

  const [lockupPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("lockup"), investor.toBuffer(), propertyPda.toBuffer(), mintPk.toBuffer()],
    PROGRAM_ID
  )

  const [lockupVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("lockup_vault"), investor.toBuffer(), propertyPda.toBuffer(), mintPk.toBuffer()],
    PROGRAM_ID
  )

  const investorTokenAccount = getAssociatedTokenAddressSync(mintPk, investor, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID)

  return await program.methods.unlockTokens()
    .accounts({
      lockup: lockupPda,
      lockupVault: lockupVaultPda,
      investorTokenAccount,
      property: propertyPda,
      tokenMint: mintPk,
      registry: registryPda,
      investor,
      systemProgram: SystemProgram.programId,
    })
    .rpc()
}

export async function fetchAllUserListings(wallet: any) {
  const provider = getProvider(wallet)
  const program = new Program(IDL as any, provider)
  const seller = new PublicKey(wallet.publicKey.toString())
  
  const [registryPda] = PublicKey.findProgramAddressSync([Buffer.from("registry")], PROGRAM_ID)
  
  // Import properties to check each one
  const { properties } = await import('./properties')
  
  const listings: any[] = []
  
  // Check each property to see if user has an active listing
  for (const property of properties) {
    try {
      const [propertyPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("property"), registryPda.toBuffer(), Buffer.from(property.id)],
        PROGRAM_ID
      )
      
      const propAccount = await (program.account as any).propertyState.fetch(propertyPda)
      const mintPk = propAccount.tokenMint as PublicKey
      
      const [saleListingPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("sale_listing"), seller.toBuffer(), propertyPda.toBuffer(), mintPk.toBuffer()],
        PROGRAM_ID
      )
      
      // Try to fetch the listing account using raw getAccountInfo first
      const accountInfo = await connection.getAccountInfo(saleListingPda)
      
      if (accountInfo) {
        try {
          const listingAccount = await (program.account as any).saleListing.fetch(saleListingPda)
          // Only add active listings
          if (listingAccount.isActive) {
            listings.push({
              publicKey: saleListingPda,
              account: listingAccount
            })
          }
        } catch (e: any) {
          // Account exists but can't be decoded - manually decode
          try {
            // Manually parse the account data
            let offset = 8 // Skip discriminator
            
            // seller: PublicKey (32 bytes)
            const sellerBytes = accountInfo.data.slice(offset, offset + 32)
            offset += 32
            
            // property: PublicKey (32 bytes)  
            const propertyBytes = accountInfo.data.slice(offset, offset + 32)
            offset += 32
            
            // tokenMint: PublicKey (32 bytes)
            const tokenMintBytes = accountInfo.data.slice(offset, offset + 32)
            offset += 32
            
            // tokenAmount: u64 (8 bytes)
            const tokenAmountBytes = accountInfo.data.slice(offset, offset + 8)
            const tokenAmount = new BN(tokenAmountBytes, 'le')
            offset += 8
            
            // pricePerTokenLamports: u64 (8 bytes)
            const priceBytes = accountInfo.data.slice(offset, offset + 8)
            const pricePerTokenLamports = new BN(priceBytes, 'le')
            offset += 8
            
            // isActive: bool (1 byte)
            const isActive = accountInfo.data[offset] === 1
            
            // Only add active listings
            if (isActive) {
              const manuallyDecoded = {
                seller: new PublicKey(sellerBytes),
                property: new PublicKey(propertyBytes),
                tokenMint: new PublicKey(tokenMintBytes),
                tokenAmount,
                pricePerTokenLamports,
                isActive
              }
              
              listings.push({
                publicKey: saleListingPda,
                account: manuallyDecoded
              })
            }
          } catch (decodeError) {
            // Skip this listing if we can't decode it
          }
        }
      }
    } catch (e) {
      // Skip properties that don't exist or have errors
    }
  }
  
  return listings
  }
