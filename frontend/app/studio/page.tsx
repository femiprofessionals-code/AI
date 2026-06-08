import Link from "next/link";

export default function StudioIndex() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Studio</h1>
      <p className="text-ink-100/60">Pick a project to open its studio.</p>
      <Link href="/projects" className="btn-primary">Go to projects</Link>
    </div>
  );
}
