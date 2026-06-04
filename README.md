# Northstar Portfolio (v2)

Kişisel çok varlıklı portföy takibi (TR / ABD / Crypto / Cash Flow).
Cloudflare Pages + D1 üzerinde çalışır, frontend ve API tek deploy.

## Mimari

- `index.html`, `app.js`, `style.css`, `favicon.png` — statik frontend (vanilla JS)
- `_worker.js` — Pages advanced mode worker; `/api/*` istekleri burada, geri kalan her şey statik
- D1 binding adı: `DB`

## Kurulum (tek seferlik)

1. Yeni boş bir D1 oluştur:
   ```
   wrangler d1 create northstar-v2
   ```
2. Schema'yı yükle:
   ```
   wrangler d1 execute northstar-v2 --remote --file=schema.sql
   ```
3. Cloudflare Pages dashboard → Settings → Functions → D1 bindings:
   Variable name = `DB`, D1 database = `northstar-v2`
4. (Opsiyonel) `SEED_OWNER_USERNAME` environment variable: seed verilerinin yükleneceği kullanıcı adı (varsayılan: `sekkpl`)

## Deploy

Her `git push` Cloudflare Pages tarafından otomatik deploy edilir. Manuel deploy:
```
wrangler pages deploy . --project-name=northstar-v2
```

## Geliştirme

Lokal preview:
```
wrangler pages dev .
```
