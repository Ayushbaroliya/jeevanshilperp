import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, query, where, getDocs, getDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { RefreshCcw, Trash2, AlertCircle, ArrowLeft, FileText, Briefcase, Filter } from 'lucide-react';
import { SCHOOLS } from '../../utils/translations';

export default function RecycleBin({ currentUser, selectedSchool, onBackToInvoices }) {
  const [deletedInvoices, setDeletedInvoices] = useState([]);
  const [deletedExpenses, setDeletedExpenses] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [subTab, setSubTab] = useState('all'); // 'all' | 'invoices' | 'expenses'

  const isOwnerUser = (user) => {
    if (!user) return false;
    if (user.email === 'jeevanshilporg@gmail.com') return true;
    const r = (user.role || '').toLowerCase();
    return r === 'owner' || r === 'director';
  };

  const isUserAdminOrOwner = (user) => {
    if (!user) return true;
    if (user.email === 'jeevanshilporg@gmail.com') return true;
    const r = (user.role || '').toLowerCase();
    return r === 'owner' || r === 'director' || r === 'admin' || r === 'administrator' || r.includes('admin');
  };

  const isOwner = isOwnerUser(currentUser);
  const isAdminOrOwner = isUserAdminOrOwner(currentUser);

  const fetchDeletedData = async () => {
    if (!isAdminOrOwner) return;
    setIsLoading(true);
    try {
      // 1. Fetch Invoices safely
      let invoices = [];
      try {
        let invQ = query(collection(db, 'invoices'), where('deleted', '==', true));
        if (selectedSchool && selectedSchool !== 'ALL') {
          invQ = query(invQ, where('schoolId', '==', selectedSchool));
        }
        const invSnap = await getDocs(invQ);
        invoices = invSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (invErr) {
        const invAllSnap = await getDocs(collection(db, 'invoices'));
        invAllSnap.forEach(d => {
          const data = d.data();
          if ((data.deleted || data.isDeleted || data.status === 'deleted') && (selectedSchool === 'ALL' || data.schoolId === selectedSchool)) {
            invoices.push({ id: d.id, ...data });
          }
        });
      }

      // 2. Fetch Expenses safely
      let expenses = [];
      try {
        let expQ = query(collection(db, 'school_expenses'), where('deleted', '==', true));
        if (selectedSchool && selectedSchool !== 'ALL') {
          expQ = query(expQ, where('schoolId', '==', selectedSchool));
        }
        const expSnap = await getDocs(expQ);
        expenses = expSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (expErr) {
        const expAllSnap = await getDocs(collection(db, 'school_expenses'));
        expAllSnap.forEach(d => {
          const data = d.data();
          if ((data.deleted || data.isDeleted || data.status === 'deleted') && (selectedSchool === 'ALL' || data.schoolId === selectedSchool)) {
            expenses.push({ id: d.id, ...data });
          }
        });
      }

      setDeletedInvoices(invoices);
      setDeletedExpenses(expenses);
    } catch (err) {
      console.error('Error fetching recycle bin:', err);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchDeletedData();
  }, [selectedSchool, currentUser]);

  const handleRestore = async (colName, docId) => {
    const itemLabel = colName === 'invoices' ? 'receipt' : 'expense';
    const itemHindi = colName === 'invoices' ? 'रसीद' : 'खर्च';

    const confirmMsg = `Are you sure you want to restore this ${itemLabel} back to active records?\n\nक्या आप वाकई इस ${itemHindi} को वापस सक्रिय रिकॉर्ड में पुनर्स्थापित करना चाहते हैं?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await updateDoc(doc(db, colName, docId), {
        deleted: false,
        status: colName === 'invoices' ? 'Paid' : 'active',
        restoredAt: serverTimestamp(),
        restoredBy: currentUser?.email || currentUser?.uid || 'Admin'
      });

      if (colName === 'invoices') {
        try {
          const invSnap = await getDoc(doc(db, 'invoices', docId));
          const invData = invSnap.data() || {};
          const recNum = invData.receiptId || invData.receiptNo || invData.receiptNumber;
          if (recNum) {
            const ledgerQ = query(collection(db, 'student_ledger'), where('receiptNumber', '==', recNum));
            const ledgerSnap = await getDocs(ledgerQ);
            await Promise.all(ledgerSnap.docs.map(d =>
              updateDoc(doc(db, 'student_ledger', d.id), {
                deleted: false,
                status: 'completed',
                restoredAt: serverTimestamp(),
                restoredBy: currentUser?.email || currentUser?.uid || 'Admin'
              })
            ));
          }
          window.dispatchEvent(new CustomEvent('receipt_deleted_or_restored', {
            detail: { invoiceId: docId, receiptNumber: recNum, studentId: invData.studentId }
          }));
        } catch (e) {
          console.warn('Could not sync restore to student_ledger in RecycleBin:', e);
        }
      }

      alert(`${itemLabel.charAt(0).toUpperCase() + itemLabel.slice(1)} restored successfully.\n${itemHindi} सफलतापूर्वक पुनर्स्थापित हो गया।`);
      fetchDeletedData();
    } catch (err) {
      console.error('Restore failed:', err);
      alert('Restore failed: ' + err.message);
    }
  };

  const handlePermanentDelete = async (colName, docId) => {
    if (!isOwner) {
      alert('Only Owners/Directors can permanently delete records from Recycle Bin.\nकेवल मालिक/निदेशक ही रिकॉर्ड स्थायी रूप से हटा सकते हैं।');
      return;
    }
    const itemLabel = colName === 'invoices' ? 'receipt' : 'expense';
    const itemHindi = colName === 'invoices' ? 'रसीद' : 'खर्च';

    const confirmMsg = `⚠️ WARNING: This action is PERMANENT and CANNOT be undone!\nAre you absolutely sure you want to permanently delete this ${itemLabel}?\n\n⚠️ चेतावनी: यह कार्रवाई स्थायी है और इसे वापस नहीं लाया जा सकता!\nक्या आप वाकई इस ${itemHindi} को हमेशा के लिए हटाना चाहते हैं?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      if (colName === 'invoices') {
        try {
          const invSnap = await getDoc(doc(db, 'invoices', docId));
          const invData = invSnap.data() || {};
          const recNum = invData.receiptId || invData.receiptNo || invData.receiptNumber;
          if (recNum) {
            const ledgerQ = query(collection(db, 'student_ledger'), where('receiptNumber', '==', recNum));
            const ledgerSnap = await getDocs(ledgerQ);
            await Promise.all(ledgerSnap.docs.map(d => deleteDoc(doc(db, 'student_ledger', d.id))));
          }
          window.dispatchEvent(new CustomEvent('receipt_deleted_or_restored', {
            detail: { invoiceId: docId, receiptNumber: recNum, studentId: invData.studentId }
          }));
        } catch (e) {
          console.warn('Could not sync permanent delete to student_ledger in RecycleBin:', e);
        }
      }

      await deleteDoc(doc(db, colName, docId));
      alert(`${itemLabel.charAt(0).toUpperCase() + itemLabel.slice(1)} permanently deleted.\n${itemHindi} स्थायी रूप से हटा दिया गया।`);
      fetchDeletedData();
    } catch (err) {
      console.error('Permanent delete failed:', err);
      alert('Permanent delete failed: ' + err.message);
    }
  };

  if (!isAdminOrOwner) {
    return (
      <div className="glass-card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>
        You do not have administrative permission to view the Recycle Bin.
      </div>
    );
  }

  const schoolName = SCHOOLS.find(s => s.id === selectedSchool)?.name || (selectedSchool === 'ALL' ? 'All Campuses' : selectedSchool);

  return (
    <div className="glass-card" style={{ padding: 24 }}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {onBackToInvoices && (
            <button
              type="button"
              className="btn-secondary"
              onClick={onBackToInvoices}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 13, fontWeight: 700 }}
            >
              <ArrowLeft size={16} /> Back to Receipt History
            </button>
          )}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Trash2 size={22} style={{ color: 'var(--danger, #ef4444)' }} />
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Recycle Bin</h2>
            </div>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Branch: <strong>{schoolName}</strong> • Soft-deleted items are excluded from active calculations
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={fetchDeletedData}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 13 }}
          >
            <RefreshCcw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* SUB-TABS */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid var(--border-light)', paddingBottom: 12 }}>
        <button
          type="button"
          className={subTab === 'all' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setSubTab('all')}
          style={{ padding: '6px 14px', fontSize: 13, fontWeight: 700 }}
        >
          All Deleted ({deletedInvoices.length + deletedExpenses.length})
        </button>
        <button
          type="button"
          className={subTab === 'invoices' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setSubTab('invoices')}
          style={{ padding: '6px 14px', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <FileText size={14} /> Deleted Receipts ({deletedInvoices.length})
        </button>
        <button
          type="button"
          className={subTab === 'expenses' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setSubTab('expenses')}
          style={{ padding: '6px 14px', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Briefcase size={14} /> Deleted Expenses ({deletedExpenses.length})
        </button>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
          Loading deleted records from Recycle Bin...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {/* DELETED RECEIPTS */}
          {(subTab === 'all' || subTab === 'invoices') && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FileText size={18} style={{ color: 'var(--primary)' }} />
                  Deleted Receipts ({deletedInvoices.length})
                </h3>
              </div>

              {deletedInvoices.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', backgroundColor: 'var(--bg-secondary)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
                  No deleted receipts in Recycle Bin.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="modern-table">
                    <thead>
                      <tr>
                        <th>Receipt No</th>
                        <th>Student Name</th>
                        <th>Class / Sec</th>
                        <th>Amount</th>
                        <th>Method</th>
                        <th>Deleted By</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deletedInvoices.map(inv => (
                        <tr key={inv.id}>
                          <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                            {inv.receiptId || inv.receiptNo || inv.id?.slice(0, 10)}
                          </td>
                          <td style={{ fontWeight: 700 }}>
                            {inv.student || inv.studentName || inv.name || inv.studentId || 'N/A'}
                          </td>
                          <td>
                            {inv.class ? `${inv.class}${inv.section ? ` (${inv.section})` : ''}` : '—'}
                          </td>
                          <td style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--danger, #ef4444)' }}>
                            ₹{Number(inv.amount || 0).toLocaleString()}
                          </td>
                          <td>
                            <span className="badge" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                              {inv.paymentMethod || inv.method || 'Cash'}
                            </span>
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {inv.deletedBy || 'Admin'}
                          </td>
                          <td style={{ textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => handleRestore('invoices', inv.id)}
                              style={{ padding: '6px 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--success, #10b981)', borderColor: 'rgba(16, 185, 129, 0.4)' }}
                              title="Restore Receipt back to active records"
                            >
                              <RefreshCcw size={14} /> Restore
                            </button>
                            {isOwner && (
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => handlePermanentDelete('invoices', inv.id)}
                                style={{ padding: '6px 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--danger, #ef4444)', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                                title="Permanently delete from database (Owner only)"
                              >
                                <Trash2 size={14} /> Permanent Delete
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* DELETED EXPENSES */}
          {(subTab === 'all' || subTab === 'expenses') && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Briefcase size={18} style={{ color: 'var(--warning, #f59e0b)' }} />
                  Deleted School Expenses ({deletedExpenses.length})
                </h3>
              </div>

              {deletedExpenses.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', backgroundColor: 'var(--bg-secondary)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
                  No deleted expenses in Recycle Bin.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="modern-table">
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th>Title / Description</th>
                        <th>Amount</th>
                        <th>Deleted By</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deletedExpenses.map(exp => (
                        <tr key={exp.id}>
                          <td style={{ fontWeight: 700 }}>
                            {exp.category || 'General'}
                          </td>
                          <td>
                            <div>{exp.title || exp.description || '—'}</div>
                            {exp.vendor && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Vendor: {exp.vendor}</div>}
                          </td>
                          <td style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--danger, #ef4444)' }}>
                            ₹{Number(exp.amount || 0).toLocaleString()}
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {exp.deletedBy || 'Admin'}
                          </td>
                          <td style={{ textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => handleRestore('school_expenses', exp.id)}
                              style={{ padding: '6px 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--success, #10b981)', borderColor: 'rgba(16, 185, 129, 0.4)' }}
                              title="Restore Expense back to active records"
                            >
                              <RefreshCcw size={14} /> Restore
                            </button>
                            {isOwner && (
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => handlePermanentDelete('school_expenses', exp.id)}
                                style={{ padding: '6px 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--danger, #ef4444)', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                                title="Permanently delete from database (Owner only)"
                              >
                                <Trash2 size={14} /> Permanent Delete
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
