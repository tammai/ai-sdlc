import { Link } from "react-router";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-start gap-3 py-8">
      <h2 className="text-lg font-medium">Page not found</h2>
      <p className="text-sm text-muted-foreground">This page doesn&apos;t exist or has moved. Your notes are one click away.</p>
      <Button asChild className="h-11 px-6">
        <Link to="/">Back to your notes</Link>
      </Button>
    </div>
  );
}
