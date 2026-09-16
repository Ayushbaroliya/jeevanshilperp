# Jeevanshilp Group ERP — Permanent Project Context

This file is the **single source of truth** for the project's state. Update this after every major iteration.

---

## Project Stack
- **Framework**: React + Vite
- **Backend**: Firebase (Firestore, Auth, Hosting, Cloud Functions)
- **Schools**: SCH_01 (JSPS), SCH_02 (JSIC), SCH_03
- **Firebase Project**: jeevanshilpgroup (Spark plan — no Cloud Functions deployment)

---

## 🔁 Last Iteration — Session 8 (2026-09-12)

### ✅ Changes Made This Session

#### 1. Father's Name Input in Student Registration Form
- **File**: `src/components/students/StudentsModule.jsx`
- **What**: Added `Father's Name / पिता का नाम` input field to the Add Student registration form (`isAddingStudent`), binding to existing `fatherName` state and saving directly into both `students` and `enrollments` Firestore collections.
- Remains fully editable in the student edit modal.

#### 2. Classwise Student Directory Excel Export
- **File**: `src/components/students/StudentsModule.jsx`
- **What**:
  - **Selected Class View**: Added "Export [Class] to Excel" button exporting that specific class roster.
  - **All Classes View**: Added "Export All Classes (Excel)" button exporting a single workbook with a separate worksheet tab for each class, plus an "All Students Summary" tab.
  - Columns: S.No., Roll No., Student Name, Father's Name, Class, Section, Contact, Admission Type, Attendance, and Live Due (₹).

#### 3. Classwise Finance Dues Excel Export
- **File**: `src/components/finance/FinanceModule.jsx`
- **What**:
  - Enhanced `ClasswiseDueFeesReport` to include `fatherName` and `roll` in dues state and display them under student names.
  - When a class is selected, exports that specific class's due fees.
  - When "All Classes" is selected, exports a multi-tab Excel workbook with a separate worksheet for each class, plus an "All Dues Summary" tab.
#### 4. Date-Wise Receipt Filtering & Collection Totals
- **File**: `src/components/finance/FinanceModule.jsx`
- **What**:
  - Implemented 5 date filter modes in `InvoicesModule` (Receipt History): Today, Yesterday, Custom Date, Date Range, and All Dates.
  - Added daily & range totals calculation and summary cards: Total Receipts, Total Collected, Cash, Online/UPI, and Other Methods.
  - Added date-range summary footer at the bottom of the table.
  - Enriched invoice display with Father's Name, Section, Roll No., Payment Method badge, dynamic fee allocations, and school branch.
  - Future-proof generic allocation model: zero hardcoded fee categories (compatible with future transport payments).

---

## 📋 Previous Sessions Summary

### Session 7 (2026-09-05)
- Fee Waiver Reason in Student Transaction History (`StudentsModule.jsx`)
- Add Teacher / Add Staff Button in Staff & Salary Module (`StaffSalaryModule.jsx`)

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
