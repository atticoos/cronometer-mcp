import type { Metadata } from "next";
import Link from "next/link";

// The root layout sets the homepage as canonical. A 404 must not inherit it,
// or every broken URL tells Google it is a copy of the homepage.
export const metadata: Metadata = {
  title: "Page not found",
  alternates: { canonical: null },
};

export default function NotFound() {
  return (
    <main style={{ padding: "4rem 1.5rem", textAlign: "center" }}>
      <h1>Page not found</h1>
      <p>
        <Link href="/">Go to the Cronometer MCP home page</Link>
      </p>
    </main>
  );
}
