import { motion } from 'framer-motion';

function AnimatedText({ text }) {
  const textVariants = {
    initial: {
      scale: 1,
      opacity: 1,
    },
    animate: {
      scale: 1.05,
      opacity: 0.9,
      transition: {
        duration: 2,
        repeat: Infinity, // Infinite loop
        repeatType: 'reverse', // Alternates between states
        ease: 'easeInOut',
      },
    },
  };

  return (
    <motion.h1
      className="bubble-shadow relative bg-gradient-to-r from-indigo-600 to-purple-500 bg-clip-text font-logo text-9xl text-transparent"
      initial="initial"
      animate="animate"
      variants={textVariants}
    >
      {text}
    </motion.h1>
  );
}

export default AnimatedText;
