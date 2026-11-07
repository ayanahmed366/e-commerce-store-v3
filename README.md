# Rustam Super Mart + RS Online Orders

Do website ek hi server se chalti hain:

- Customer shop:  `http://aap-ka-domain/`
- Owner panel:    `http://aap-ka-domain/owner`  ("RS Online Orders", password se khulti hai)

## Apne computer par chalane ka tareeqa

1. Node.js 18 ya naya install karein (nodejs.org).
2. Is folder mein terminal kholein aur yeh chalayen:

   Windows (PowerShell):
   ```
   $env:OWNER_PASSWORD="apna-lamba-password"; node server.js
   ```
   Mac / Linux:
   ```
   OWNER_PASSWORD="apna-lamba-password" node server.js
   ```
3. Browser mein `http://localhost:3000` (shop) aur `http://localhost:3000/owner` (owner panel) kholein.

Password kam az kam 8 characters ka hona chahiye, warna server shuru nahi hota.

## Internet par daalne ke liye

Aam free static hosting (jaise GitHub Pages) par yeh NAHI chalega, kyunke orders, accounts aur products ke liye server chahiye.
Aisi hosting chahiye jo Node.js chalaye (Render, Railway, Fly.io, ya koi VPS). Hosting par:

- Start command: `node server.js`
- Environment variable: `OWNER_PASSWORD` (apna lamba password)
- Agar hosting proxy ke peeche hai to `TRUST_PROXY=1` bhi set karein.
- **Sara data `storage/` folder mein save hota hai** (orders, customers, products, pictures, payment settings).
  Hosting par is folder ke liye "persistent disk" / volume lagayein (aur `DATA_DIR` us disk ka path rakhein),
  warna restart par sab ud sakta hai.
- HTTPS zaroor use karein (zyada tar hostings khud dete hain), warna passwords saaf text mein jate hain.

## Owner panel (`/owner`) ke 7 tabs

1. **Orders** - naya order aate hi "New order RS-0001!" aata hai (page har 20 second baad khud check karta hai).
   **Confirm**, **Mark Delivered**, **Cancel** dabayein. **Mark Paid** se payment mil jane ka nishan lagayein.
   **Print** se parchi nikal sakte hain. Har order mein customer ka payment method aur (online payment ho to) TID nazar aata hai.
2. **Collections & Products** - yahan se shop ka poora catalog sambhalein:
   - Collection add / edit / delete (naam, picture, description).
   - Collection ke andar **Products** dabayein: product add / edit / delete (box price, pieces, carton price, boxes per carton, picture).
   - **Mark Sold Out / Mark In Stock** ek click mein.
   - Har tabdeeli turant sab customers ko nazar aati hai. `data.js` ya `?owner` / Edit Mode ki ab zaroorat nahi.
3. **Customers** - jin logon ne account banaya unki list. Agar koi password bhool jaye to **Reset password** se naya password de dein.
4. **Payment Settings** - customers kaise payment karein:
   - **Cash on Delivery** (default on)
   - **Easypaisa**, **JazzCash** (account title + number likhein)
   - **Bank Transfer** (bank, account title, account number / IBAN)
   Online method on karne par customer ko aapki details nazar aati hain, woh paisay bhejta hai aur apni **Transaction ID (TID)** likhta hai.
   Aap TID check karke order confirm karein aur "Mark Paid" dabayein.

5. **Billing** - dukaan ka POS: bill banayen, 80mm parchi print karein, sales history dekhein.
6. **Khata** - customers ka udhaar ledger: udhaar, wasooli, statement print.
   (Billing aur Khata ka data usi browser mein rehta hai jahan bill bane - header ke **Download** se roz backup lein, **Upload** se restore.)
7. **Inventory** - stock: products, quantity, reorder level, low-stock alerts, CSV export.
   (Inventory ka data bhi usi browser mein rehta hai. Shuru mein 5 demo products hote hain, unhein delete kar dein.)

Billing / Khata / Inventory ko Tailwind, icons aur fonts ke liye internet chahiye.

## Customer ke liye

- **Create Account**: naam, phone, location aur password (kam az kam 6 characters). Phir **Login**: phone + password.
- Order dene ke liye login zaroori hai. Cart mein delivery address, payment method (aur online payment ho to TID) likhna hota hai.
- Password browser mein save nahi hota; server par sirf uska hash (scrambled form) rakha jata hai.

## Files

| File | Kaam |
| --- | --- |
| `server.js` | Server: shop dikhata hai, catalog, accounts, orders, owner login |
| `owner/` | RS Online Orders (owner panel): `index.html`, `owner.js`, `owner.css` |
| `owner/pos/` | Billing + Khata (owner panel ke tabs) |
| `owner/inventory/` | Inventory (owner panel ka tab) |
| `data.js` | Sirf pehli dafa ka shuru ka data (server isay `storage/catalog.json` mein badal deta hai) |
| `storage/catalog.json` | Collections aur products (server khud banata hai) |
| `storage/uploads/` | Owner ki upload ki hui pictures |
| `storage/customers.json` | Customer accounts (passwords hash ki shakal mein) |
| `storage/orders.json` | Saare orders |
| `storage/settings.json` | Payment settings |
| `storage/secret.key` | Customer login ki chaabi (kisi ko na dein; delete na karein) |
| baqi `.html` / `.js` / `.css` | Customer shop |
