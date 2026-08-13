# Jeevanshilp Group — Version 3.0.0

Jeevanshilp Group production architecture and QA baseline.

This package is **Version 3**. It includes the agreed student/enrollment, fee, migration, roll-number, teacher assignment, permissions, and Firebase security architecture.

See `QA_REPORT.md` for remaining verification items.

# Jeevanshilp Group

React + Vite + Firebase Jeevanshilp Group for multi-campus school administration.

## What is implemented

- Multi-campus dashboard with consolidated and campus views
- Student directory, registration, editing, deletion and ledger
- Fee collection, invoices, dues and receipt workflow
- Academics: attendance and gradebook persistence in Firestore
- Staff directory, role/permission management and class-teacher assignments
- Staff attendance and payroll persistence
- Responsive/mobile UI, dark mode and Hindi/English switch
- Firebase Authentication for production staff/owner sign-in
- Firestore security rules and offline persistence
- Playwright E2E coverage for the primary navigation and module flows

## Authentication

The previous demo authentication accepted arbitrary credentials and stored staff passwords in Firestore. That is not safe for a production ERP. The project now uses Firebase Authentication in production.

Create `.env.local` from `.env.example` and configure the Firebase Web App values. Set `VITE_OWNER_EMAIL` to the Firebase Auth owner account email.

For development only, the app enables the existing demo owner/teacher login when running under Vite dev mode and `VITE_ENABLE_DEMO_AUTH` is not explicitly `false`. Set it explicitly to `false` when testing production authentication behavior.

### Owner bootstrap

1. Create the owner account in Firebase Authentication.
2. Create a Firestore document at `users/{OWNER_AUTH_UID}` with:
   - `role: "Owner"`
   - `name: "Group Owner / Super Admin"`
   - `schoolId: "ALL"`
3. Sign in through the Owner / Super Admin portal.
4. Register staff from School Settings. Staff accounts are created in Firebase Auth and linked to Firestore staff/user profiles.

## Firestore deployment

`firestore.rules` is included and is intentionally deny-by-default for unauthenticated access. Deploy it with the Firebase CLI after reviewing it against your final role model:

```bash
firebase deploy --only firestore
```

The rules assume every authenticated staff member has a `users/{uid}` profile and that the profile contains `role` and `schoolId`.

## Development

```bash
npm install
npm run dev
```

## QA

```bash
npm run lint
npm run build
npm run test:e2e
```

The E2E suite uses the development demo login unless `VITE_ENABLE_DEMO_AUTH=false` is set.

## Production blockers still requiring infrastructure

- Password reset currently requires a trusted Firebase Admin/Cloud Function flow. The UI no longer writes fake passwords into Firestore.
- Deleting a staff profile removes the ERP access profile, but the underlying Firebase Auth account should also be disabled/deleted by a trusted backend/Admin SDK.
- Review Firestore indexes after the first production dataset; Firebase will surface any composite index requirements for your exact queries.
- Replace any remaining seeded/demo financial and HR data with production data before launch.
# jeevanshilperp
