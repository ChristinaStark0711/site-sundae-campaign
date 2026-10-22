import Link from "next/link";
import Image from "next/image";

// The header is the Sundae wordmark only, linking to the events (owner's choice, 2026-10-22: no other pages or links).
export default function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-gray bg-white/95 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-7xl items-center px-5 py-4 md:px-8" aria-label="Main">
        {/* wordmark at a modest 28px with clear space of at least the height of the "u" on every side */}
        <Link href="/" className="flex items-center py-1" aria-label="Sundae events">
          <Image src="/brand/sundae-wordmark-red.svg" alt="Sundae" width={99} height={28} priority className="h-7 w-auto" />
        </Link>
      </nav>
    </header>
  );
}
