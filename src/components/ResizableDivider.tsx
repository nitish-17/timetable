import React, { useEffect, useRef } from 'react';

interface ResizableDividerProps {
  onResize: (newWidth: number) => void;
  isDragging: boolean;
  setIsDragging: (dragging: boolean) => void;
}

export const ResizableDivider: React.FC<ResizableDividerProps> = ({
  onResize,
  isDragging,
  setIsDragging,
}) => {
  const dividerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      // Prevent text selection during drag
      e.preventDefault();
      onResize(e.clientX);
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging) return;
      if (e.touches.length > 0) {
        onResize(e.touches[0].clientX);
      }
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging, onResize, setIsDragging]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleTouchStart = () => {
    setIsDragging(true);
  };

  return (
    <div
      ref={dividerRef}
      className={`resizable-splitter ${isDragging ? 'dragging' : ''}`}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
    />
  );
};
