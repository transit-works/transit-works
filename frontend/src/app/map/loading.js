import React from 'react';

export default function Loading() {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-background-dk">
      <div className="h-20 w-20 animate-spin rounded-full border-b-2 border-t-2 border-background" />
      <p className="mt-5 text-xs text-background">TransitWorks by TOVERP</p>
    </div>
  );
}
