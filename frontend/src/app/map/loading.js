import React from 'react';

export default function Loading() {
    return (
        <div className="h-screen flex flex-col items-center justify-center bg-background-dk">
            <div className="animate-spin rounded-full h-20 w-20 border-t-2 border-b-2 border-background" />
            <p className="mt-5 text-background text-xs">TransitWorks by TOVERP</p>
        </div>
    );
}
