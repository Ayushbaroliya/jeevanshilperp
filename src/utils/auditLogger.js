import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Logs a sensitive financial or administrative action to the audit_logs collection.
 * @param {Object} params
 * @param {string} params.action - The action performed (e.g., 'PAYROLL_GENERATED', 'STUDENT_ARCHIVED', 'INVOICE_CANCELLED')
 * @param {string} params.performedBy - User ID or Name of the person performing the action
 * @param {string} params.schoolId - The school campus ID
 * @param {Object} params.details - Any additional context (e.g., amount, target student ID)
 */
export const logAuditAction = async ({ action, performedBy, schoolId, details = {} }) => {
  try {
    await addDoc(collection(db, 'audit_logs'), {
      action,
      performedBy,
      schoolId: schoolId || 'UNKNOWN',
      details,
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error('Failed to write audit log:', error);
    // Usually, in a highly compliant system, failing to audit should fail the transaction.
    // For this ERP, we log the error but allow the operation to continue if Firestore is unreachable briefly.
  }
};
