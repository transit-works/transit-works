import React from 'react';

function ImageButton({ text, imageSrc, onClick, altText = 'icon' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center px-4 py-2 bg-background-dk border-zinc-800 border rounded-xl hover:bg-primary text-white w-full"
    >
      <img
        src={imageSrc}
        alt={altText}
        className="w-5 h-5 mr-2"  // Adjust size of the icon
      />
      <span className="text-sm">{text}</span> {/* Make text size consistent */}
    </button>
  );
}

export default ImageButton;
