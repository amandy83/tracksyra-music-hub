import { forwardRef } from "react";
import { Music } from "lucide-react";

interface LogoProps {
  className?: string;
  showText?: boolean;
  size?: "sm" | "md" | "lg";
  style?: React.CSSProperties;
}

const Logo = forwardRef<HTMLDivElement, LogoProps>(
  ({ className = "", showText = true, size = "md", style }, ref) => {
    const sizeClasses = {
      sm: "w-8 h-8",
      md: "w-10 h-10",
      lg: "w-14 h-14",
    };

    const textSizeClasses = {
      sm: "text-lg",
      md: "text-xl",
      lg: "text-2xl",
    };

    const iconSizeClasses = {
      sm: "w-4 h-4",
      md: "w-5 h-5",
      lg: "w-7 h-7",
    };

    return (
      <div ref={ref} className={`flex items-center gap-3 ${className}`} style={style}>
        {/* Animated Logo Icon */}
        <div className="relative group">
          {/* Glow effect */}
          <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary to-accent blur-lg opacity-50 group-hover:opacity-70 transition-opacity duration-300" />
          
          {/* Main logo container */}
          <div
            className={`relative ${sizeClasses[size]} rounded-xl bg-gradient-to-br from-primary via-primary to-accent flex items-center justify-center shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-105`}
          >
            {/* Inner shine effect */}
            <div className="absolute inset-0.5 rounded-[10px] bg-gradient-to-br from-white/30 to-transparent" />
            
            {/* Music icon */}
            <Music className={`${iconSizeClasses[size]} text-primary-foreground relative z-10 drop-shadow-sm`} />
            
            {/* Animated rings */}
            <div className="absolute inset-0 rounded-xl border border-primary-foreground/20 animate-ping opacity-20" style={{ animationDuration: '2s' }} />
          </div>
        </div>

        {/* Logo Text */}
        {showText && (
          <div className="flex flex-col">
            <span className={`font-syne font-bold ${textSizeClasses[size]} gradient-text tracking-tight`}>
              TrackSyra
            </span>
            {size === "lg" && (
              <span className="text-xs text-muted-foreground font-medium tracking-wider uppercase">
                Music Distribution
              </span>
            )}
          </div>
        )}
      </div>
    );
  }
);

Logo.displayName = "Logo";

export default Logo;
