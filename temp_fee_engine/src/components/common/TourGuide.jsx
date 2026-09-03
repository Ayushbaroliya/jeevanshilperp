import React, { useState } from 'react';
import { Joyride, STATUS } from 'react-joyride';

export default function TourGuide({ run, onFinish }) {
  const [steps] = useState([
    {
      target: '.tour-school-switcher',
      content: 'Switch between different school branches (like Public School or Inter College) right here. Each branch has its own isolated data!',
      disableBeacon: true,
      placement: 'bottom',
    },
    {
      target: '.tour-global-search',
      content: 'Quickly find any student, receipt, or invoice using this global search bar.',
      placement: 'bottom',
    },
    {
      target: '.tour-nav-dashboard',
      content: 'The Executive Overview. Here you can see total revenue, pending dues, and enrollment counts at a glance.',
      placement: 'right',
    },
    {
      target: '.tour-nav-students',
      content: 'Manage your student directory here. Add new students, view their ledgers, or mark their daily attendance.',
      placement: 'right',
    },
    {
      target: '.tour-nav-finance',
      content: 'Handles all fee collections, dues tracking, printing thermal receipts, and expense management.',
      placement: 'right',
    },
    {
      target: '.tour-nav-academics',
      content: 'Enter examination marks, generate report cards, and track academic progress over the year.',
      placement: 'right',
    },
    {
      target: '.tour-nav-staff',
      content: 'Manage your teachers and staff, track their daily check-ins, and process monthly payroll.',
      placement: 'right',
    },
    {
      target: '.tour-nav-settings',
      content: 'Configure your classes, set up complex fee structures, and manage system permissions for other staff.',
      placement: 'right',
    }
  ]);

  const handleJoyrideCallback = (data) => {
    const { status } = data;
    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status)) {
      if (onFinish) onFinish();
    }
  };

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous={true}
      showSkipButton={true}
      showProgress={true}
      callback={handleJoyrideCallback}
      styles={{
        options: {
          arrowColor: 'var(--bg-card)',
          backgroundColor: 'var(--bg-card)',
          overlayColor: 'rgba(0, 0, 0, 0.6)',
          primaryColor: 'var(--brand-orange)',
          textColor: 'var(--text-primary)',
          zIndex: 10000,
        },
        tooltip: {
          borderRadius: 16,
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          border: '1px solid var(--border-light)',
          padding: 20
        },
        buttonNext: {
          borderRadius: 8,
          fontWeight: 700,
          padding: '8px 16px'
        },
        buttonBack: {
          color: 'var(--text-secondary)'
        }
      }}
    />
  );
}
