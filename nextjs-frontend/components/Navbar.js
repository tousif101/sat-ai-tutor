import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="flex items-center justify-between bg-blue-600 p-4 text-white">
      <h1 className="text-xl font-bold">SAT AI Tutor</h1>
      <div>
        <Link href="/dashboard" className="mr-4">
          Practice
        </Link>
        <Link href="/performance" className="mr-4">
          Performance
        </Link>
        <Link href="/leaderboard" className="mr-4">
          Leaderboard
        </Link>
        <Link href="/login">
          Login
        </Link>
      </div>
    </nav>
  );
}