import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, updateDoc, doc, serverTimestamp, query, orderBy, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Plus, Trash2, RotateCcw, AlertTriangle, ArrowLeft, RefreshCw, Search, Briefcase } from 'lucide-react';

const EXPENSE_CATEGORIES = [
  'Electricity',
  'Water',
  'Salary/Staff Related',
  'Transport',
  'Maintenance',
  'Stationery',
  'School Supplies',
  'Rent',
  'Internet/Phone',
  'Examination',
  'Events',
  'Repairs',
  'Cleaning',
  'Other'
];

export default function SchoolExpensesReport({ selectedSchool, classes, activeAcademicYearId, dict, currentUser }) {
  const isOwnerUser = (user) => {
    if (!user) return true;
    if (user.email === 'jeevanshilporg@gmail.com') return true;
    const r = (user.role || '').toLowerCase();
    return r === 'owner' || r === 'director' || r === 'admin' || r === 'administrator' || r.includes('admin');
  };

  const isOwner = isOwnerUser(currentUser);

  const [expenses, setExpenses] = useState([]);
  const [deletedExpenses, setDeletedExpenses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState('active'); // 'active' | 'recycle_bin'
  const [search, setSearch] = useState('');

  // Filters
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [filterCategory, setFilterCategory] = useState('ALL');

  // Form State
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({
    expenseDate: new Date().toISOString().slice(0, 10),
    category: 'Electricity',
    otherCategory: '',
    amount: '',
    description: '',
    paymentMethod: 'Cash',
    notes: ''
  });

  const fetchExpenses = async () => {
    setIsLoading(true);
    try {
      let q = query(collection(db, 'school_expenses'), orderBy('expenseDate', 'desc'));
      const snapshot = await getDocs(q);
      const activeData = [];
      const deletedData = [];

      snapshot.forEach(doc => {
        const d = doc.data();
        if (selectedSchool === 'ALL' || d.schoolId === selectedSchool) {
          if (d.deleted || d.isDeleted || d.status === 'deleted') {
            deletedData.push({ id: doc.id, ...d });
          } else {
            activeData.push({ id: doc.id, ...d });
          }
        }
      });

      setExpenses(activeData);
      setDeletedExpenses(deletedData);
    } catch (err) {
      console.error('Error fetching expenses:', err);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchExpenses();
  }, [selectedSchool]);

  const handleSoftDeleteExpense = async (id) => {
    const confirmMsg = "Are you sure you want to move this expense to the Recycle Bin?\n\nक्या आप वाकई इस खर्च को रीसायकल बिन में भेजना चाहते हैं?";
    if (!window.confirm(confirmMsg)) return;

    try {
      await updateDoc(doc(db, 'school_expenses', id), {
        deleted: true,
        deletedAt: serverTimestamp(),
        deletedBy: currentUser?.email || currentUser?.uid || 'Unknown'
      });
      alert("Expense moved to Recycle Bin.\nखर्च रीसायकल बिन में स्थानांतरित कर दिया गया है।");
      fetchExpenses();
    } catch (err) {
      console.error("Error moving expense to recycle bin:", err);
      alert("Failed to delete expense: " + err.message);
    }
  };

  const handleRestoreExpense = async (id) => {
    const confirmMsg = "Are you sure you want to restore this expense back to active records?\n\nक्या आप वाकई इस खर्च को वापस सक्रिय रिकॉर्ड में पुनर्स्थापित करना चाहते हैं?";
    if (!window.confirm(confirmMsg)) return;

    try {
      await updateDoc(doc(db, 'school_expenses', id), {
        deleted: false,
        isDeleted: false,
        status: 'active',
        restoredAt: serverTimestamp(),
        restoredBy: currentUser?.email || currentUser?.uid || 'Admin'
      });
      alert("Expense restored successfully.\nखर्च सफलतापूर्वक पुनर्स्थापित हो गया।");
      fetchExpenses();
    } catch (err) {
      console.error("Error restoring expense:", err);
      alert("Failed to restore expense: " + err.message);
    }
  };

  const handlePermanentDeleteExpense = async (id) => {
    if (!isOwner) {
      alert("Only Admins and Owners can permanently delete expenses.\nकेवल व्यवस्थापक और मालिक ही खर्चों को स्थायी रूप से हटा सकते हैं।");
      return;
    }

    const confirmMsg = "⚠️ WARNING: This action is PERMANENT and CANNOT be undone!\nAre you absolutely sure you want to permanently delete this expense from the database?\n\n⚠️ चेतावनी: यह कार्रवाई स्थायी है और इसे वापस नहीं लाया जा सकता!\nक्या आप वाकई इस खर्च को हमेशा के लिए डेटाबेस से हटाना चाहते हैं?";
    if (!window.confirm(confirmMsg)) return;

    try {
      await deleteDoc(doc(db, 'school_expenses', id));
      alert("Expense permanently deleted from database.\nखर्च डेटाबेस से स्थायी रूप से हटा दिया गया है।");
      fetchExpenses();
    } catch (err) {
      console.error("Error permanently deleting expense:", err);
      alert("Permanent delete failed: " + err.message);
    }
  };

  const handleSaveExpense = async (e) => {
    e.preventDefault();
    const finalCategory = formData.category === 'Other' ? formData.otherCategory : formData.category;
    if (!finalCategory || !formData.amount || !formData.description) {
      alert('Please fill all required fields (Amount, Category, Description).');
      return;
    }

    if (selectedSchool === 'ALL') {
      alert('Please select a specific school branch to record an expense.');
      return;
    }

    try {
      const d = new Date(formData.expenseDate);
      const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      
      await addDoc(collection(db, 'school_expenses'), {
        schoolId: selectedSchool,
        expenseDate: formData.expenseDate,
        month: monthStr,
        year: String(d.getFullYear()),
        category: finalCategory,
        amount: Number(formData.amount),
        description: formData.description,
        paymentMethod: formData.paymentMethod,
        notes: formData.notes,
        createdBy: currentUser?.email || 'Admin/Owner',
        createdAt: serverTimestamp()
      });

      setIsAdding(false);
      setFormData({
        expenseDate: new Date().toISOString().slice(0, 10),
        category: 'Electricity',
        otherCategory: '',
        amount: '',
        description: '',
        paymentMethod: 'Cash',
        notes: ''
      });
      fetchExpenses();
    } catch (err) {
      console.error('Error adding expense:', err);
      alert('Failed to add expense.');
    }
  };

  // Filtered Active Expenses
  const filteredExpenses = expenses.filter(ex => {
    if (filterMonth && filterMonth !== 'ALL') {
      if (ex.month !== filterMonth) return false;
    }
    if (filterCategory !== 'ALL' && ex.category !== filterCategory) return false;
    if (search.trim()) {
      const s = search.toLowerCase();
      const matchDesc = (ex.description || '').toLowerCase().includes(s);
      const matchCat = (ex.category || '').toLowerCase().includes(s);
      const matchNotes = (ex.notes || '').toLowerCase().includes(s);
      const matchAmt = String(ex.amount || '').includes(s);
      if (!matchDesc && !matchCat && !matchNotes && !matchAmt) return false;
    }
    return true;
  });

  // Filtered Deleted Expenses
  const filteredDeletedExpenses = deletedExpenses.filter(ex => {
    if (search.trim()) {
      const s = search.toLowerCase();
      const matchDesc = (ex.description || '').toLowerCase().includes(s);
      const matchCat = (ex.category || '').toLowerCase().includes(s);
      const matchNotes = (ex.notes || '').toLowerCase().includes(s);
      const matchAmt = String(ex.amount || '').includes(s);
      if (!matchDesc && !matchCat && !matchNotes && !matchAmt) return false;
    }
    return true;
  });

  const totalAmount = filteredExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const cashTotal = filteredExpenses.filter(e => e.paymentMethod === 'Cash').reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const bankTotal = filteredExpenses.filter(e => e.paymentMethod !== 'Cash').reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  return (
    <div className="glass-card" style={{ padding: 24 }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
            {viewMode === 'recycle_bin' ? '🗑️ School Expenses — Recycle Bin' : 'School Monthly Expenses'}
          </h2>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Branch: <strong>{selectedSchool === 'ALL' ? 'All Branches' : selectedSchool}</strong> •{' '}
            {viewMode === 'active' ? `${filteredExpenses.length} active record(s)` : `${filteredDeletedExpenses.length} deleted record(s) in recycle bin`}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* ViewMode Switcher (Active vs Recycle Bin) */}
          <div style={{ display: 'inline-flex', gap: 4, backgroundColor: 'var(--bg-secondary)', padding: 3, borderRadius: 8, border: '1px solid var(--border-light)' }}>
            <button
              type="button"
              className={viewMode === 'active' ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setViewMode('active')}
              style={{ padding: '6px 14px', fontSize: 12, fontWeight: 700, borderRadius: 6 }}
            >
              Active ({expenses.length})
            </button>
            <button
              type="button"
              className={viewMode === 'recycle_bin' ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setViewMode('recycle_bin')}
              style={{
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 700,
                borderRadius: 6,
                color: viewMode === 'recycle_bin' ? '#fff' : (deletedExpenses.length > 0 ? 'var(--danger, #ef4444)' : 'var(--text-secondary)'),
                backgroundColor: viewMode === 'recycle_bin' ? 'var(--danger, #ef4444)' : 'transparent',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5
              }}
              title="View and manage deleted expenses"
            >
              <Trash2 size={13} /> Recycle Bin {deletedExpenses.length > 0 ? `(${deletedExpenses.length})` : ''}
            </button>
          </div>

          {viewMode === 'active' && selectedSchool !== 'ALL' && (
            <button className="btn-primary" onClick={() => setIsAdding(!isAdding)} style={{ padding: '8px 16px', fontWeight: 700 }}>
              <Plus size={16} /> {isAdding ? 'Cancel' : 'Record Expense'}
            </button>
          )}
        </div>
      </div>

      {/* Recycle Bin Alert Banner */}
      {viewMode === 'recycle_bin' && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 10, marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Trash2 size={20} style={{ color: 'var(--danger, #ef4444)', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                Expense Recycle Bin
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Showing {filteredDeletedExpenses.length} soft-deleted expense record(s). Deleted items are excluded from monthly reports, P&L statements, and cash summaries.
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setViewMode('active')}
            style={{ padding: '6px 14px', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <ArrowLeft size={14} /> Back to Active Expenses
          </button>
        </div>
      )}

      {/* Record Expense Form (Active view only) */}
      {viewMode === 'active' && isAdding && (
        <form onSubmit={handleSaveExpense} style={{ background: 'var(--bg-secondary)', padding: 16, borderRadius: 8, marginBottom: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <div>
            <label className="form-label">Expense Date *</label>
            <input type="date" className="form-input" value={formData.expenseDate} onChange={e => setFormData({ ...formData, expenseDate: e.target.value })} required />
          </div>
          <div>
            <label className="form-label">Category *</label>
            <select className="form-input" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}>
              {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {formData.category === 'Other' && (
            <div>
              <label className="form-label">Specify Category *</label>
              <input type="text" className="form-input" value={formData.otherCategory} onChange={e => setFormData({ ...formData, otherCategory: e.target.value })} placeholder="e.g. Licensing" required />
            </div>
          )}
          <div>
            <label className="form-label">Amount (₹) *</label>
            <input type="number" className="form-input" value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} min="0" step="0.01" required />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Description *</label>
            <input type="text" className="form-input" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="e.g. September electricity bill" required />
          </div>
          <div>
            <label className="form-label">Payment Method</label>
            <select className="form-input" value={formData.paymentMethod} onChange={e => setFormData({ ...formData, paymentMethod: e.target.value })}>
              <option value="Cash">Cash</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="UPI">UPI</option>
              <option value="Cheque">Cheque</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label className="form-label">Notes (Optional)</label>
            <input type="text" className="form-input" value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} placeholder="Reference no. or remarks" />
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="submit" className="btn-primary" style={{ padding: '8px 24px' }}>Save Expense</button>
          </div>
        </form>
      )}

      {/* Search & Filter Bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ position: 'relative', minWidth: 220, flex: 1 }}>
          <label className="form-label" style={{ fontSize: 11, marginBottom: 4 }}>Search Expenses</label>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              className="form-input"
              placeholder="Search description, category, notes, amount..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 34, width: '100%' }}
            />
            <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          </div>
        </div>

        {viewMode === 'active' && (
          <>
            <div style={{ minWidth: 160 }}>
              <label className="form-label" style={{ fontSize: 11, marginBottom: 4 }}>Filter Month</label>
              <input type="month" className="form-input" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} />
            </div>
            <div style={{ minWidth: 160 }}>
              <label className="form-label" style={{ fontSize: 11, marginBottom: 4 }}>Filter Category</label>
              <select className="form-input" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                <option value="ALL">All Categories</option>
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <button className="btn-secondary" onClick={() => { setFilterMonth('ALL'); setFilterCategory('ALL'); setSearch(''); }} style={{ padding: '8px 14px' }}>
                Clear Filters
              </button>
            </div>
          </>
        )}
      </div>

      {/* Summary Cards (Active view only) */}
      {viewMode === 'active' && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ background: 'var(--bg-secondary)', padding: '12px 16px', borderRadius: 8, flex: 1, minWidth: 150 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Total Expenses</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--danger)' }}>₹{totalAmount.toLocaleString()}</div>
          </div>
          <div style={{ background: 'var(--bg-secondary)', padding: '12px 16px', borderRadius: 8, flex: 1, minWidth: 150 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Cash Payments</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>₹{cashTotal.toLocaleString()}</div>
          </div>
          <div style={{ background: 'var(--bg-secondary)', padding: '12px 16px', borderRadius: 8, flex: 1, minWidth: 150 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Bank / Online</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>₹{bankTotal.toLocaleString()}</div>
          </div>
          <div style={{ background: 'var(--bg-secondary)', padding: '12px 16px', borderRadius: 8, flex: 1, minWidth: 150 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Record Count</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{filteredExpenses.length}</div>
          </div>
        </div>
      )}

      {/* Tables Section */}
      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading expenses...</div>
      ) : viewMode === 'active' ? (
        /* ACTIVE EXPENSES TABLE */
        <div style={{ overflowX: 'auto' }}>
          <table className="modern-table" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Description</th>
                <th>School</th>
                <th>Payment Method</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                {isOwner && <th style={{ textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)' }}>No active expenses found for selected filters.</td>
                </tr>
              ) : (
                filteredExpenses.map(ex => (
                  <tr key={ex.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{ex.expenseDate}</td>
                    <td style={{ fontWeight: 600 }}>{ex.category}</td>
                    <td>
                      <div>{ex.description}</div>
                      {ex.notes && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Note: {ex.notes}</div>}
                    </td>
                    <td><span className="badge" style={{ background: 'var(--bg-secondary)' }}>{ex.schoolId}</span></td>
                    <td>{ex.paymentMethod}</td>
                    <td style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--danger)' }}>₹{Number(ex.amount).toLocaleString()}</td>
                    {isOwner && (
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => handleSoftDeleteExpense(ex.id)}
                          style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 6, borderRadius: 4 }}
                          title="Move Expense to Recycle Bin"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* RECYCLE BIN TABLE */
        <div style={{ overflowX: 'auto' }}>
          <table className="modern-table" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Description</th>
                <th>School</th>
                <th>Payment Method</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th>Deleted Info</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDeletedExpenses.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)' }}>
                    <Trash2 size={24} style={{ opacity: 0.4, marginBottom: 8 }} /><br />
                    Recycle bin is empty. No deleted expenses found.
                  </td>
                </tr>
              ) : (
                filteredDeletedExpenses.map(ex => (
                  <tr key={ex.id} style={{ backgroundColor: 'rgba(239, 68, 68, 0.02)' }}>
                    <td style={{ whiteSpace: 'nowrap', textDecoration: 'line-through', opacity: 0.7 }}>{ex.expenseDate}</td>
                    <td style={{ fontWeight: 600 }}>{ex.category}</td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{ex.description}</div>
                      {ex.notes && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Note: {ex.notes}</div>}
                    </td>
                    <td><span className="badge" style={{ background: 'var(--bg-secondary)' }}>{ex.schoolId}</span></td>
                    <td>{ex.paymentMethod}</td>
                    <td style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--danger, #ef4444)' }}>
                      ₹{Number(ex.amount).toLocaleString()}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      <div>By: {ex.deletedBy || 'Admin'}</div>
                      {ex.deletedAt?.toDate && (
                        <div>At: {ex.deletedAt.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => handleRestoreExpense(ex.id)}
                          style={{
                            padding: '5px 10px',
                            fontSize: 12,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            color: 'var(--success, #10b981)',
                            borderColor: 'rgba(16, 185, 129, 0.4)'
                          }}
                          title="Restore this expense back to active records"
                        >
                          <RotateCcw size={13} /> Restore
                        </button>
                        {isOwner && (
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => handlePermanentDeleteExpense(ex.id)}
                            style={{
                              padding: '5px 10px',
                              fontSize: 12,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              color: 'var(--danger, #ef4444)',
                              borderColor: 'rgba(239, 68, 68, 0.4)'
                            }}
                            title="Permanently delete this expense record from database"
                          >
                            <Trash2 size={13} /> Permanent Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
