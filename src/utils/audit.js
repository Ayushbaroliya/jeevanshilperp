import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Logs a governance-related change (settings, roles, etc.) to the `governance_audit` collection.
 * 
 * @param {Object} params
 * @param {string} params.userId - The UID of the user performing the action
 * @param {string} params.role - The role of the user performing the action
 * @param {string} params.schoolId - The school branch associated with the action
 * @param {string} params.action - Description of the action (e.g., 'UPDATE_ROLE', 'SET_ACTIVE_ACADEMIC_YEAR')
 * @param {any} [params.oldValue] - The previous state/value (optional)
 * @param {any} [params.newValue] - The new state/value (optional)
 * @param {string} [params.targetId] - Optional ID of the affected document/user
 */
export async function auditLogGovernance({ userId, role, schoolId, action, oldValue = null, newValue = null, targetId = null }) {
  if (!userId || !action) {
    console.error("auditLogGovernance requires userId and action");
    return;
  }
  
  try {
    await addDoc(collection(db, 'governance_audit'), {
      userId,
      role: role || 'Unknown',
      schoolId: schoolId || 'ALL',
      action,
      oldValue,
      newValue,
      targetId,
      timestamp: serverTimestamp()
    });
  } catch (err) {
    console.error("Failed to write governance audit log:", err);
  }
}
