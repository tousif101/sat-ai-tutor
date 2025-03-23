import Link from "next/link";

export default function Home() {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-100">
      <div className="text-center">
        <h1 className="text-4xl font-bold">Welcome to AI-Powered SAT Tutor</h1>
        <p className="mt-2 text-gray-600">Your AI-driven personalized SAT learning experience.</p>
        <Link href="/dashboard">
          <button className="mt-4 rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-700">
            Get Started
          </button>
        </Link>
      </div>
    </div>
  );
}
