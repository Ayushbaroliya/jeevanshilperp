# Database Backup Policy

This document outlines the backup policy and procedures for the Jeevan Shilp School ERP production database (Firebase Firestore).

## 1. Automated Backups (Daily)
- **Schedule**: A scheduled Cloud Function triggers an export of the entire Firestore database every day at 02:00 AM IST.
- **Storage**: The backups are exported to a designated Google Cloud Storage (GCS) bucket (`gs://jeevanshilporg-51db8-backups`).
- **Retention**: Daily backups are retained for 30 days. After 30 days, Google Cloud Storage Object Lifecycle Management automatically archives them to nearline storage, and permanently deletes them after 1 year.

## 2. On-Demand Backups
On-demand backups can be initiated via the Google Cloud Console or using the `gcloud` CLI tool prior to any major schema migrations or application updates:
```bash
gcloud firestore export gs://jeevanshilporg-51db8-backups/manual-backups/$(date +"%Y%m%d-%H%M")
```

## 3. Restoration Procedure
If a database rollback is required, an authorized administrator can restore from a specific backup prefix in the GCS bucket:
```bash
gcloud firestore import gs://jeevanshilporg-51db8-backups/[BACKUP_PREFIX]
```

## 4. Security & Access
- The backup GCS bucket has restricted IAM permissions.
- Only users with `roles/datastore.importExportAdmin` and `roles/storage.admin` can view, export, or import backups.

## 5. Audit Logging
Every automated and manual export/import operation is logged in Google Cloud Cloud Audit Logs for compliance and monitoring purposes.
