// ИСПРАВЛЕННЫЙ КОНТРАКТ для функции cancelSaleListing
// Ключевое изменение: добавлен constraint #[account(close = seller)]
// который автоматически закрывает аккаунт и возвращает rent

use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer};

// КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ для cancelSaleListing:
// Добавляем #[account(close = seller)] к sale_listing
// Это автоматически закроет аккаунт после выполнения инструкции
// и вернет rent обратно продавцу

#[derive(Accounts)]
pub struct CancelSaleListing<'info> {
    #[account(
        mut,
        close = seller, // <-- ИСПРАВЛЕНИЕ: автоматически закрывает аккаунт
        has_one = seller,
        has_one = listing_vault,
        constraint = sale_listing.is_active @ ErrorCode::ListingNotActive,
    )]
    pub sale_listing: Account<'info, SaleListing>,

    #[account(
        mut,
        constraint = listing_vault.owner == sale_listing.key() @ ErrorCode::InvalidVault,
    )]
    pub listing_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = seller_token_account.owner == seller.key(),
        constraint = seller_token_account.mint == sale_listing.token_mint,
    )]
    pub seller_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub seller: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn cancel_sale_listing(ctx: Context<CancelSaleListing>) -> Result<()> {
    let sale_listing = &mut ctx.accounts.sale_listing;
    
    // 1. Возвращаем токены из vault обратно продавцу
    let seeds = &[
        b"sale_listing",
        sale_listing.seller.as_ref(),
        sale_listing.property.as_ref(),
        &[sale_listing.bump],
    ];
    let signer_seeds = &[&seeds[..]];
    
    let cpi_accounts = Transfer {
        from: ctx.accounts.listing_vault.to_account_info(),
        to: ctx.accounts.seller_token_account.to_account_info(),
        authority: sale_listing.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
    token::transfer(cpi_ctx, sale_listing.token_amount)?;
    
    // 2. Закрываем token vault аккаунт
    let close_vault_accounts = CloseAccount {
        account: ctx.accounts.listing_vault.to_account_info(),
        destination: ctx.accounts.seller.to_account_info(),
        authority: sale_listing.to_account_info(),
    };
    let close_vault_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        close_vault_accounts,
        signer_seeds,
    );
    token::close_account(close_vault_ctx)?;
    
    // 3. Отмечаем листинг как неактивный (для безопасности, хотя аккаунт будет закрыт)
    sale_listing.is_active = false;
    
    msg!("Listing cancelled, {} tokens returned to seller", sale_listing.token_amount);
    
    // 4. Аккаунт sale_listing будет автоматически закрыт constraint'ом #[account(close = seller)]
    // Rent будет возвращен продавцу автоматически
    
    Ok(())
}

#[account]
pub struct SaleListing {
    pub seller: Pubkey,
    pub property: Pubkey,
    pub token_mint: Pubkey,
    pub token_amount: u64,
    pub price_per_token_lamports: u64,
    pub listing_vault: Pubkey,
    pub is_active: bool,
    pub bump: u8,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Listing is not active")]
    ListingNotActive,
    #[msg("Invalid vault account")]
    InvalidVault,
}
