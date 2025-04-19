import { useState, useEffect, useRef } from 'react';

export default function MathRenderer({ content }) {
  const containerRef = useRef(null);
  const [isClient, setIsClient] = useState(false);

  // Set isClient to true on component mount
  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    // Only run this effect on client-side and when MathJax is loaded
    if (isClient && window.MathJax && containerRef.current && content) {
      // Set the content to be rendered
      containerRef.current.innerHTML = content;
      
      // Process the math in the container
      window.MathJax.typesetPromise([containerRef.current]).catch((err) => {
        console.error('MathJax error:', err);
      });
    }
  }, [content, isClient]); // Re-run when content changes or when mounted on client

  // Only render the content on the client side to avoid hydration mismatches
  if (!isClient) {
    return <div ref={containerRef}>{content}</div>;
  }

  return <div ref={containerRef} />;
}