import React from "react";
import { motion } from "framer-motion";

export default function ScrollIndicator() {
    return (
        <div className="relative min-h-screen flex items-end justify-center">
            <motion.div
                animate={{ scale: [1, 1.2, 1, 1.2, 1, 1.2, 1] }}
                transition={{ delay: 0.2, duration: 8, repeat: Infinity }}
                className="mb-4 flex flex-col items-center"
            >
                <p className="font-logo font-light text-text-2"> Scroll</p>
                <p className="text-text-2 -mt-1">▼</p>
            </motion.div>
        </div>
    );
}
