import { useState, useEffect, useRef } from 'react';

export default function MathRenderer({ content }) {
  const containerRef = useRef(null);
  const [isClient, setIsClient] = useState(false);
  const [hasMathJax, setHasMathJax] = useState(false);

  // Set isClient to true on component mount
  useEffect(() => {
    setIsClient(true);
    
    // Check if MathJax is loaded
    const checkMathJax = () => {
      if (window.MathJax) {
        setHasMathJax(true);
        return true;
      }
      return false;
    };
    
    // If MathJax is not loaded, wait for it
    if (!checkMathJax()) {
      const interval = setInterval(() => {
        if (checkMathJax()) {
          clearInterval(interval);
        }
      }, 100);
      
      // Clear the interval if the component unmounts
      return () => clearInterval(interval);
    }
  }, []);

  useEffect(() => {
    // Only run when we have content, we're client-side, and MathJax is loaded
    if (content && isClient && hasMathJax && containerRef.current) {
      // Set the content
      containerRef.current.innerHTML = content;
      
      // Queue MathJax to process the content
      if (window.MathJax.Hub && typeof window.MathJax.Hub.Queue === 'function') {
        // MathJax v2
        window.MathJax.Hub.Queue(["Typeset", window.MathJax.Hub, containerRef.current]);
      } else if (typeof window.MathJax.typeset === 'function') {
        // MathJax v3 direct method
        window.MathJax.typeset([containerRef.current]);
      } else {
        // Another approach for MathJax v3
        try {
          window.MathJax.typesetClear([containerRef.current]);
          window.MathJax.typeset([containerRef.current]);
        } catch (error) {
          console.error('Error with MathJax typeset:', error);
          
          // Last resort: just reload the page
          setTimeout(() => {
            if (typeof window.MathJax.texReset === 'function') {
              window.MathJax.texReset();
              window.MathJax.typeset([containerRef.current]);
            }
          }, 100);
        }
      }
    }
  }, [content, isClient, hasMathJax]);

  if (!isClient) {
    return <div dangerouslySetInnerHTML={{ __html: content }} />;
  }

  return <div ref={containerRef} />;
}