# BargainBot Deployment

## Vercel Setup

**Build Command:** `npm run vercel-build`  
**Output Directory:** `build/client`  
**Install Command:** `npm install`  
**Node.js Version:** `20.x`

## Required Environment Variables

| Variable | Description |
|---|---|
| `SHOPIFY_API_KEY` | From Shopify Partner Dashboard |
| `SHOPIFY_API_SECRET` | From Shopify Partner Dashboard |
| `SHOPIFY_APP_URL` | Your Vercel deployment URL |
| `DATABASE_URL` | PostgreSQL connection string (Neon) |
| `SCOPES` | `read_products,write_products,read_orders,write_discounts` |
| `NODE_ENV` | `production` |
