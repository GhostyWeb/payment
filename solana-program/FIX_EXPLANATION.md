# Исправление Ошибки "instruction spent from the balance of an account it does not own"

## Проблема

При отмене листинга (cancelSaleListing) смарт-контракт успешно возвращает токены продавцу, но затем падает с ошибкой:

```
Error: instruction spent from the balance of an account it does not own
```

### Что Происходит

1. ✅ Токены успешно возвращаются из `listing_vault` продавцу
2. ✅ Лог показывает: "Listing cancelled, 1 tokens returned to seller"
3. ❌ Программа падает при попытке закрыть PDA аккаунт `sale_listing`
4. ❌ Флаг `isActive` НЕ устанавливается в `false`
5. ❌ Rent НЕ возвращается продавцу
6. ❌ Листинг остается в Active Listings (потому что `isActive = true`)

### Почему Это Происходит

Проблема в том, что программа пытается **вручную** закрыть PDA аккаунт и вернуть rent, но для этого нужны специальные permissions. В Solana только владелец аккаунта может тратить его lamports, но PDA принадлежит программе, а не seller'у.

## Решение

Используйте Anchor constraint `#[account(close = seller)]` вместо ручного закрытия аккаунта.

### До (Неправильно)

```rust
#[derive(Accounts)]
pub struct CancelSaleListing<'info> {
    #[account(
        mut,
        has_one = seller,
        has_one = listing_vault,
    )]
    pub sale_listing: Account<'info, SaleListing>,
    
    #[account(mut)]
    pub seller: Signer<'info>,
    // ...
}

pub fn cancel_sale_listing(ctx: Context<CancelSaleListing>) -> Result<()> {
    // Возвращаем токены
    token::transfer(...)?;
    
    // ❌ Пытаемся вручную закрыть аккаунт - здесь падает ошибка
    sale_listing.is_active = false;
    
    // Попытка вернуть rent вручную (не работает)
    // **seller.lamports.borrow_mut() += sale_listing.lamports();
    
    Ok(())
}
```

### После (Правильно)

```rust
#[derive(Accounts)]
pub struct CancelSaleListing<'info> {
    #[account(
        mut,
        close = seller, // ✅ ИСПРАВЛЕНИЕ: автоматически закрывает аккаунт
        has_one = seller,
        has_one = listing_vault,
        constraint = sale_listing.is_active @ ErrorCode::ListingNotActive,
    )]
    pub sale_listing: Account<'info, SaleListing>,
    
    #[account(mut)]
    pub seller: Signer<'info>,
    // ...
}

pub fn cancel_sale_listing(ctx: Context<CancelSaleListing>) -> Result<()> {
    let sale_listing = &mut ctx.accounts.sale_listing;
    
    // 1. Возвращаем токены
    token::transfer(cpi_ctx, sale_listing.token_amount)?;
    
    // 2. Закрываем vault
    token::close_account(close_vault_ctx)?;
    
    // 3. Отмечаем как неактивный (опционально, для безопасности)
    sale_listing.is_active = false;
    
    // 4. ✅ Аккаунт sale_listing автоматически закроется благодаря close = seller
    // ✅ Rent автоматически вернется продавцу
    
    Ok(())
}
```

## Что Делает `#[account(close = seller)]`

Anchor автоматически генерирует код, который:

1. **Переносит все lamports** из `sale_listing` в `seller`
2. **Обнуляет данные** аккаунта (устанавливает все байты в 0)
3. **Переназначает владельца** на System Program
4. **Делает это безопасно** с использованием program signing

Это происходит **после** выполнения функции, поэтому:
- Все операции в функции выполняются корректно
- Аккаунт закрывается правильно
- Нет ошибки "instruction spent from the balance"

## Как Задеплоить Исправление

### 1. Обновите Rust Код

Откройте ваш файл `programs/your-program/src/lib.rs` и найдите структуру `CancelSaleListing`:

```rust
#[derive(Accounts)]
pub struct CancelSaleListing<'info> {
    #[account(
        mut,
        close = seller, // Добавьте эту строку
        has_one = seller,
        has_one = listing_vault,
        constraint = sale_listing.is_active @ ErrorCode::ListingNotActive,
    )]
    pub sale_listing: Account<'info, SaleListing>,
    
    // ... остальные аккаунты
}
```

### 2. Пересоберите Программу

```bash
anchor build
```

### 3. Задеплойте на Devnet (для тестов)

```bash
anchor deploy --provider.cluster devnet
```

### 4. Протестируйте

```bash
anchor test --provider.cluster devnet
```

### 5. Задеплойте на Mainnet (после тестов)

```bash
anchor deploy --provider.cluster mainnet
```

### 6. Обновите Frontend

После деплоя нового контракта, обновите Program ID в фронтенде (если изменился) и удалите временный workaround с localStorage:

```typescript
// Можно удалить эти функции из lib/p2p-market.ts:
// - markListingAsCancelled()
// - isListingCancelled()

// И убрать проверки isListingCancelled() из fetchAllUserListings()
```

## Дополнительные Ресурсы

- [Anchor Account Constraints](https://www.anchor-lang.com/docs/account-constraints)
- [Solana Account Model](https://solana.com/docs/core/accounts)
- [Anchor Close Account Example](https://github.com/solana-developers/anchor-examples/tree/main/account-constraints/close)
- [Solana PDAs](https://solana.com/docs/core/pda)

## Примечания

- Constraint `close` доступен только для `Account<'info, T>`, не для `UncheckedAccount`
- Rent автоматически возвращается указанному аккаунту (в нашем случае `seller`)
- Закрытие происходит **после** выполнения функции, так что все операции в функции успешно завершаются
- Это официальный паттерн Anchor для закрытия аккаунтов

## Временный Workaround (Пока Не Задеплоили)

Пока не задеплоили исправленный контракт, используется localStorage для отслеживания отмененных листингов. Это работает локально, но не синхронизируется между устройствами/браузерами. После деплоя исправленного контракта этот workaround можно удалить.
