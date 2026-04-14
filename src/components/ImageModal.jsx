import React from 'react';

const ImageModal = ({ isOpen, imageUrl, onClose }) => {
  if (!isOpen) return null;

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(0,0,0,0.8)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(4px)'
      }}
      onClick={onClose}
    >
      <div 
        style={{
          position: 'relative',
          maxWidth: '90%',
          maxHeight: '90%',
        }}
        onClick={e => e.stopPropagation()}
      >
        <button 
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '-40px',
            right: 0,
            background: 'none',
            border: 'none',
            color: 'white',
            fontSize: '32px',
            cursor: 'pointer'
          }}
        >
          &times;
        </button>
        <img 
          src={imageUrl} 
          alt="Preview" 
          style={{
            maxWidth: '100%',
            maxHeight: '80vh',
            objectFit: 'contain',
            borderRadius: '8px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
          }} 
        />
      </div>
    </div>
  );
};

export default ImageModal;
