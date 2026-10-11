# Customer registration without email verification

The website submits registration to `POST /api/v1/auth/register`. The backend validates the fields and creates a customer through Supabase Admin Auth with `email_confirm: true`, then persists the customer profile. The browser signs in with the submitted email and password immediately and redirects to `/`, replacing the registration history entry. No verification email is required for this flow. If account creation succeeds but automatic login fails, the registration page retains the guidance to log in manually.

Duplicate email returns HTTP 409 (`CUSTOMER_EMAIL_EXISTS`). Registration never resets an existing user's password, changes their role, or confirms an existing account. Existing accounts awaiting email confirmation retain their prior state. Supabase's global email-confirmation setting for direct client signups is unchanged.

The endpoint requires an allowed Origin and limits each IP to five attempts per minute in the database. Admin credentials remain on the backend. Name and phone are validated and saved; the profile form waits for profile data before initializing its fields.

Validation commands:

```powershell
cd backend
npm.cmd test
# With the local website and backend running:
$env:PLAYWRIGHT_BROWSERS_PATH='D:/Charity/ShopForCharity/frontend/.browsers'
node scripts/customer-registration-probe.mjs
cd ../frontend
npm.cmd run test:e2e:types
npm.cmd run lint
npx.cmd playwright test e2e/auth-orders.spec.ts e2e/seller-registration.spec.ts --workers=1
```

The live probe creates one temporary customer, checks immediate login, persisted name/phone, duplicate email rejection and unchanged password, then removes that exact account and profile. It requires the existing backend/frontend environment files and access to the configured Supabase project.

Reference: [Supabase Admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser).
