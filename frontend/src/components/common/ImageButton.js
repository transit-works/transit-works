import React from 'react';

function ImageButton({ text, imageSrc, onClick, altText = 'icon' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center rounded-xl border border-zinc-800 bg-background-dk px-4 py-2 text-white hover:bg-primary"
    >
      <img
        src={imageSrc}
        alt={altText}
        className="mr-2 h-5 w-5" // Adjust size of the icon
      />
      <span className="text-sm">{text}</span> {/* Make text size consistent */}
    </button>
  );
}

export default ImageButton;
