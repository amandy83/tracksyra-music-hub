import Spline from "@splinetool/react-spline";
import { useState } from "react";

const SplineBackground = () => {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div className="absolute inset-0 z-0">
      {/* Fallback gradient while loading */}
      <div 
        className={`absolute inset-0 transition-opacity duration-1000 ${isLoaded ? 'opacity-0' : 'opacity-100'}`}
        style={{ 
          background: 'radial-gradient(ellipse at center, hsl(330, 85%, 92%) 0%, hsl(0, 0%, 100%) 70%)' 
        }}
      />
      
      {/* Spline 3D Scene */}
      <div className={`absolute inset-0 transition-opacity duration-1000 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}>
        <Spline
          scene="https://prod.spline.design/6Wq1Q7YGyM-iab9i/scene.splinecode"
          onLoad={() => setIsLoaded(true)}
        />
      </div>

      {/* Overlay gradient for better text readability */}
      <div 
        className="absolute inset-0 z-10 pointer-events-none"
        style={{ 
          background: 'linear-gradient(180deg, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0.8) 100%)' 
        }}
      />
    </div>
  );
};

export default SplineBackground;
