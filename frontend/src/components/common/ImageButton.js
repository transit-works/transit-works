import React from 'react';
import Image from 'next/image';

function ImageButton({ 
  text, 
  imageSrc, 
  altText = "Button icon", 
  onClick, 
  disabled = false,
  isLoading = false 
}) {
  const baseClasses = "flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-800 px-4 py-2 font-body text-sm text-white";
  
  // Determine button color based on state
  let buttonClasses = `${baseClasses} bg-background-dk hover:bg-accent/80`;
  
  if (disabled) {
    buttonClasses = `${baseClasses} bg-zinc-800/50 cursor-not-allowed opacity-60`;
  } else if (isLoading) {
    buttonClasses = `${baseClasses} bg-orange-500 cursor-wait`;
  }

  return (
    <button 
      className={buttonClasses} 
      onClick={onClick} 
      disabled={disabled || isLoading}
    >
      <div className="relative h-5 w-5">
        <Image 
          src={imageSrc} 
          alt={altText} 
          layout="fill" 
          objectFit="contain" 
        />
      </div>
      <span className="whitespace-nowrap">{text}</span>
    </button>
  );
}

export default ImageButton;
