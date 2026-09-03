import React, { useState, useEffect } from 'react';
import { CreditCard, DollarSign, Activity, FileText } from 'lucide-react';
import { fetchAuthoritativeFeeSummary } from './dashboardUtils';
import { SCHOOLS } from '../../utils/translations';

export default function FinanceDashboard({ onNavigate, selectedSchool, classSettings, activeAcademicYearId }) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalFeeCollection: 0, totalOutstanding: 0, recentPayments: [] });

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      const data = await fetchAuthoritativeFeeSummary(selectedSchool, activeAcademicYearId, classSettings);
      setStats(data);
      setLoading(false);
    };
    fetchStats();
  }, [selectedSchool, classSettings, activeAcademicYearId]);

  const schoolName = selectedSchool === 'ALL' 
    ? 'All Campuses (Consolidated Group)' 
    : SCHOOLS.find(s => s.id === selectedSchool)?.name || 'Finance Dashboard';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <h1 className="page-title">{schoolName} - Finance Dashboard</h1>
        <p className="page-subtitle">Fee collections, outstanding dues, and recent payments</p>
      </div>

      <div className="grid-responsive">
        <div className="glass-card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DollarSign size={24} />
            </div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Total Fee Collection</h3>
              <span className="badge success" style={{ fontSize: 10, marginTop: 4, display: 'inline-block' }}>Real-time</span>
            </div>
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--success)' }}>
            {loading ? '...' : `₹${stats.totalFeeCollection.toLocaleString()}`}
          </div>
        </div>

        <div className="glass-card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Activity size={24} />
            </div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Outstanding Dues</h3>
              <span className="badge warning" style={{ fontSize: 10, marginTop: 4, display: 'inline-block' }}>Calculated via Ledger</span>
            </div>
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--danger)' }}>
            {loading ? '...' : `₹${stats.totalOutstanding.toLocaleString()}`}
          </div>
        </div>
      </div>

      <div className="glass-card" style={{ padding: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText size={18} /> Recent Fee Payments
        </h2>
        {loading ? (
          <p style={{ color: 'var(--text-secondary)' }}>Loading payments...</p>
        ) : stats.recentPayments.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>No recent payments found.</p>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Method</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentPayments.map(p => (
                  <tr key={p.id}>
                    <td>{new Date(p.date).toLocaleDateString()}</td>
                    <td style={{ fontWeight: 600, color: 'var(--success)' }}>₹{Number(p.amount).toLocaleString()}</td>
                    <td>{p.method || 'Cash'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
