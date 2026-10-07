import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useTitle } from "@/lib/use-title";

export function NotFoundPage() {
  useTitle("Page not found");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-balance">Page not found</h1>
      <p className="text-muted-foreground">This page doesn't exist or was moved.</p>
      <Button asChild>
        <Link to="/">Go to notes</Link>
      </Button>
    </div>
  );
}
