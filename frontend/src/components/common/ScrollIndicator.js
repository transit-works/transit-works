import React from 'react';
import { motion } from 'framer-motion';

export default function ScrollIndicator() {
  return (
    <div className="relative flex min-h-screen items-end justify-center">
      <motion.div
        animate={{ scale: [1, 1.2, 1, 1.2, 1, 1.2, 1] }}
        transition={{ delay: 0.2, duration: 8, repeat: Infinity }}
        className="mb-4 flex flex-col items-center"
      >
        <p className="font-logo font-light text-text-2"> Scroll</p>
        <p className="-mt-1 text-text-2">▼</p>
      </motion.div>
    </div>
  );
}
