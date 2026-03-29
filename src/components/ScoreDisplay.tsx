import { cn } from "@/lib/utils";

interface ScoreDisplayProps {
  score: number;
  maxScore?: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

export default function ScoreDisplay({
  score,
  maxScore = 100,
  size = "md",
  showLabel = true,
}: ScoreDisplayProps) {
  const percentage = (score / maxScore) * 100;
  const tier = percentage >= 75 ? "high" : percentage >= 50 ? "medium" : "low";

  const sizeClasses = {
    sm: "h-10 w-10 text-sm",
    md: "h-14 w-14 text-lg",
    lg: "h-20 w-20 text-2xl",
  };

  const tierColors = {
    high: "bg-success/10 text-success border-success/30",
    medium: "bg-warning/10 text-warning border-warning/30",
    low: "bg-destructive/10 text-destructive border-destructive/30",
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={cn(
          "rounded-xl border-2 flex items-center justify-center font-bold",
          sizeClasses[size],
          tierColors[tier]
        )}
      >
        {Math.round(score)}
      </div>
      {showLabel && (
        <span className="text-xs text-muted-foreground capitalize">{tier}</span>
      )}
    </div>
  );
}
