# Northwest Investment

A responsive Node.js + Express full-stack prototype styled from the supplied mobile/admin references.

## Included
- Welcome screen -> Login/Register flow
- User registration with name, phone, email, UPI, bank details, login password and withdrawal password
- User dashboard with balance, plans, recharge, withdrawal, income, team and profile
- Manual recharge workflow with UTR/reference submission
- Admin approval/rejection for recharge and withdrawals
- Admin dashboard, users, plans and transactions
- Referral code + 3-level team overview
- Mobile-first navy/blue/gold UI
- JSON persistence so it runs without a database service

## Important deployment note
The included JSON database is suitable for a prototype/demo and simple testing. Railway's normal filesystem is ephemeral unless a persistent volume is attached. For production financial use, replace `data/db.json` with PostgreSQL or another managed database, add CSRF protection, rate limiting, audit logs, KYC/AML controls, HTTPS, secure secrets, and a compliant payment provider.

This project does **not** make any claim that investment returns are guaranteed. Plan figures are configurable examples.

## Run locally
```bash
npm install
npm start
```

Open `http://localhost:3000`

Default admin credentials come from `.env`, with the example defaults:
- Phone: `9999999999`
- Password: `ChangeMe123!`

Change them before deployment.

## Railway
1. Push this folder to GitHub.
2. Create a Railway project from the GitHub repository.
3. Add environment variables from `.env.example`.
4. Deploy.
5. Railway will run `npm start`.

For persistent data, attach a Railway volume or migrate the storage layer to PostgreSQL.

## GitHub
```bash
git init
git add .
git commit -m "Initial Northwest Investment app"
git branch -M main
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```
