import React from 'react';
import OwnerDashboard from './OwnerDashboard';
import OperationsDashboard from './OperationsDashboard';
import FinanceDashboard from './FinanceDashboard';
import TeacherDashboard from './TeacherDashboard';

export default function AdminDashboard(props) {
  const { currentUser } = props;
  const role = currentUser?.role;

  if (role === 'Owner' || role === 'Director') {
    return <OwnerDashboard {...props} />;
  }
  
  if (role === 'Administrator' || role === 'Principal') {
    return <OperationsDashboard {...props} />;
  }
  
  if (role === 'Accountant') {
    return <FinanceDashboard {...props} />;
  }

  // Fallback for Teachers, Senior Teachers, etc.
  return <TeacherDashboard {...props} />;
}
