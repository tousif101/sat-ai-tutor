import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) router.push("/dashboard"); // Redirect if logged in
    };
    checkUser();
  }, []);

  const handleAuth = async (type) => {
    setLoading(true);
    setErrorMessage("");

    let result;
    if (type === "signup") {
      result = await supabase.auth.signUp({ email, password });
    } else {
      result = await supabase.auth.signInWithPassword({ email, password });
    }

    setLoading(false);
    if (result.error) {
      setErrorMessage(result.error.message);
    } else {
      router.push("/dashboard");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-lg w-96">
        <h2 className="text-2xl font-bold text-center">Welcome</h2>

        {errorMessage && <p className="text-red-500 text-center mt-2">{errorMessage}</p>}

        <input
          type="email"
          placeholder="Email"
          className="w-full mt-4 p-3 border rounded-lg"
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          className="w-full mt-2 p-3 border rounded-lg"
          onChange={(e) => setPassword(e.target.value)}
        />
        
        <button
          className="w-full bg-blue-600 text-white py-2 mt-4 rounded-lg hover:bg-blue-700"
          onClick={() => handleAuth("login")}
          disabled={loading}
        >
          {loading ? "Logging in..." : "Login"}
        </button>

        <button
          className="w-full bg-gray-600 text-white py-2 mt-2 rounded-lg hover:bg-gray-700"
          onClick={() => handleAuth("signup")}
          disabled={loading}
        >
          {loading ? "Signing up..." : "Sign Up"}
        </button>
      </div>
    </div>
  );
}
