# Jeevanshilp Group ERP — Permanent Project Context

This file is the **single source of truth** for the project's state. Update this after every major iteration.

---

## Project Stack
- **Framework**: React + Vite
- **Backend**: Firebase (Firestore, Auth, Hosting, Cloud Functions)
- **Schools**: SCH_01 (JSPS), SCH_02 (JSIC), SCH_03
- **Firebase Project**: jeevanshilpgroup (Spark plan — no Cloud Functions deployment)

---

## 🔁 Last Iteration — Session 7 (2026-09-05)

### ✅ Changes Made This Session

#### 1. Fee Waiver Reason in Student Transaction History
- **File**: `src/components/students/StudentsModule.jsx`
- **What**: `StudentLedger` now fetches `fee_adjustments` (approved waivers) and appends them to `paymentHistory`, showing the stored `reason` field. If reason is empty, displays `"Reason not recorded"`.
- **Waiver rows** appear in the payment history table as: `Fee Waiver (reason text)` with status `Approved`.

#### 2. Add Teacher / Add Staff Button in Staff & Salary Module
- **Files**: `src/components/staff/StaffSalaryModule.jsx`, `src/App.jsx`
- **What**: Added an **"Add / Manage Staff"** button in the Staff & Salary module header (visible to Owner/Director roles only). Clicking it navigates to `Settings → Staff Directory & Permissions` where the full staff registration form lives.
- **Why**: The add-staff form was hidden inside Settings and not discoverable from the Staff & Salary sidebar. This button bridges the gap without duplicating the form.

#### 3. Permanent Project Context Created
- **File**: `PROJECT_CONTEXT.md` (this file) at project root.

---

## 📋 Previous Sessions Summary

### Session 1-4: Fee Engine V4
- Built V4 materialized ledger system (`feeEngine.js`)
- `generateChargeSchedule`, `calculateOpeningArrears`, deduplication via Map keyed on charge IDs
- Firestore: `fee_charges`, `student_ledger`, `invoices`, `fee_adjustments` collections

### Session 5: Firestore Rules & Security
- Tightened `fee_charges` rules: create-only for Accountant/Admin/Owner; no update/delete
- Verified `schoolId` removal was safe because queries are scoped by `studentId`

### Session 6: Invoices History & Receipt Printing
- `InvoicesModule` enhanced: local search, no composite index dependency
- `generateFeeReceipt` in `pdfGenerator.js` prioritizes `receiptId` from invoice records
- Added composite indexes to `firestore.indexes.json` for `invoices` collection

---

## 🏗 Key Architecture Notes

| Collection | Purpose |
|---|---|
| `students` | Permanent student records |
| `enrollments` | Per-year enrollment (class/section/roll) |
| `fee_charges` | Immutable generated charge schedule (create-only) |
| `student_ledger` | Credits (payments) and debits |
| `fee_adjustments` | Waivers/adjustments — `reason`, `amount`, `status: approved` |
| `invoices` | Printed receipts/invoices |
| `staff` | Staff profiles |
| `staff_salary` | Base salary per staff ID |
| `payroll` | Monthly processed payroll records |
| `school_settings` | Firestore-synced class/fee/section config |

## 🔐 Firestore Security Rules Summary
- `fee_charges`: Authenticated users can read; Owner/Admin/Accountant can create; **no update/delete**
- `fee_adjustments`: Owner/Admin can CRUD; Accountant can read + create only
- `student_ledger`: Owner/Admin/Accountant can read+write
- `invoices`: Owner/Admin/Accountant can read+write

## ⚠️ Known Limitations
- Cloud Functions NOT deployed (Spark plan) — password reset via `adminUpdateUserPassword` won't work in production
- Chunk size warning exists (~2.7MB JS bundle) — not critical for current usage
- `selectedSchool === 'ALL'` disables most operational actions intentionally

## 🚀 Deployment Command
```
npx firebase-tools deploy --only hosting,firestore
```
