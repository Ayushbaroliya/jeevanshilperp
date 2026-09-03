import React from 'react';
import { Joyride, STATUS } from 'react-joyride';

export default function GuidedTour({ run, steps, onTourEnd }) {
  const handleJoyrideCallback = (data) => {
    const { status } = data;
    const finishedStatuses = [STATUS.FINISHED, STATUS.SKIPPED];
    
    if (finishedStatuses.includes(status)) {
      if (onTourEnd) {
        onTourEnd();
      }
    }
  };

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous={true}
      showSkipButton={true}
      showProgress={true}
      scrollToFirstStep={true}
      callback={handleJoyrideCallback}
      styles={{
        options: {
          primaryColor: '#10b981', // Brand green
          textColor: '#1f2937',
          backgroundColor: '#ffffff',
          overlayColor: 'rgba(0, 0, 0, 0.6)',
          zIndex: 10000,
        },
        tooltipContainer: {
          textAlign: 'left'
        },
        buttonNext: {
          backgroundColor: 'var(--brand-green)',
          borderRadius: 8,
          padding: '8px 16px',
          fontWeight: 700
        },
        buttonBack: {
          color: 'var(--text-secondary)'
        }
      }}
    />
  );
}
