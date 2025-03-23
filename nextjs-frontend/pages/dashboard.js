import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useRouter } from "next/router";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [topic, setTopic] = useState("Algebra");
  const [questionData, setQuestionData] = useState(null);
  const [userAnswer, setUserAnswer] = useState("");
  const [confidence, setConfidence] = useState(3);
  const [showHint, setShowHint] = useState(false);
  const [hint, setHint] = useState("");
  const [isCorrect, setIsCorrect] = useState(null);
  const [loading, setLoading] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const router = useRouter();

  const satTopics = ["Algebra", "Geometry", "Grammar", "Reading Comprehension", "Trigonometry"];

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth");
      } else {
        setUser(user);
        fetchChatHistory(user.id);
      }
    };
    checkUser();
  }, []);

  const fetchChatHistory = async (userId) => {
    try {
      const response = await fetch(`/api/user-chat?user_id=${userId}`);
      const data = await response.json();
      
      if (response.ok) {
        console.log("Fetched Chat History:", data);
        setChatHistory(data);
      } else {
        console.error("Error fetching chat history:", data.message);
      }
    } catch (error) {
      console.error("Failed to fetch chat history:", error);
    }
  };
  

  const sendMessage = async () => {
    if (!chatInput.trim() || !questionData || !questionData.question_id) return;

    try {
      const response = await fetch("/api/tutor-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          user_id: user.id, 
          question_id: questionData.question_id, // Include question_id in the payload
          message: chatInput 
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setChatHistory([...chatHistory, { user_message: chatInput, tutor_response: data.tutor_response }]);
        setChatInput("");
      } else {
        console.error("Error sending message:", data.message);
      }
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };


  const handleGenerateQuestion = async () => {
    setLoading(true);
    setQuestionData(null);
    setShowHint(false);
    setHint("");
    setUserAnswer("");
    setIsCorrect(null);

    try {
      const response = await fetch(`/api/generate-question?topic=${topic}`);
      const data = await response.json();

      if (data.error) {
        alert("Error generating question");
      } else {
        console.log("✅ Question Data (with ID):", data);
        if (!data.question_id) {
          console.error("❌ Missing `question_id` in response!");
          alert("Error: Question ID is missing. Please regenerate.");
          return;
        }
        setQuestionData(data);
      }
    } catch (error) {
      alert("Failed to fetch question");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!questionData || !user) {
      alert("No question or user found!");
      return;
    }

    if (!questionData.question_id) {
      console.error("❌ Error: `question_id` is missing in `questionData`!");
      alert("Error: Missing `question_id`. Please regenerate the question.");
      return;
    }

    const correct = userAnswer.toUpperCase() === questionData.correct_answer;

    const payload = {
      user_id: user.id,
      topic,
      question_id: questionData.question_id,
      user_answer: userAnswer,
      correct,
      confidence,
    };

    console.log("📌 Sending Answer Submission:", payload);

    try {
      const response = await fetch("/api/submit-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error("FastAPI Error:", await response.text());
        throw new Error("Failed to submit answer");
      }

      // ✅ Show correct/incorrect feedback
      setIsCorrect(correct);

      // ✅ Show explanation after answering
      alert(correct ? "✅ Correct Answer!" : `❌ Incorrect! Correct Answer: ${questionData.correct_answer}\nExplanation: ${questionData.solution}`);

    } catch (error) {
      console.error("❌ Error submitting answer:", error);
      alert("Failed to submit answer");
    }
  };

  const handleGetHint = async () => {
    if (!questionData) return;

    try {
      const response = await fetch(`/api/generate-hint?topic=${topic}&question=${questionData.question}`);
      const data = await response.json();

      if (data.error) {
        alert("Error fetching hint");
      } else {
        setHint(data.hint);
        setShowHint(true);
      }
    } catch (error) {
      alert("Failed to fetch hint");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-6">
      <h1 className="text-4xl font-bold text-blue-600">SAT AI Tutor</h1>

      {user ? (
        <p className="mt-2 text-lg">Welcome, <span className="font-semibold">{user.email}</span></p>
      ) : (
        <p className="mt-2 text-lg text-gray-500">Loading user...</p>
      )}

      {/* Topic Selection & Question Generation */}
      <div className="mt-4">
        <select 
          className="border p-2 rounded" 
          value={topic} 
          onChange={(e) => setTopic(e.target.value)}
        >
          {satTopics.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <button
          className="ml-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-700"
          onClick={handleGenerateQuestion}
          disabled={loading}
        >
          {loading ? "Generating..." : "Generate Question"}
        </button>
      </div>

      {/* Question Section */}
      {questionData && (
        <div className="mt-6 w-3/4 p-4 bg-white shadow rounded">
          <h2 className="text-xl font-semibold">{questionData.question}</h2>
          {questionData.choices && (
            <ul className="mt-2 space-y-2">
              {Object.entries(questionData.choices).map(([key, value]) => (
                <li key={key} className="p-2 border rounded">
                  <label className="flex items-center space-x-2">
                    <input type="radio" name="answer" value={key} onChange={() => setUserAnswer(key)} />
                    <span><strong>{key}:</strong> {value}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          <select className="mt-4 border p-2 rounded" value={confidence} onChange={(e) => setConfidence(parseInt(e.target.value))}>
            <option value="1">Not Confident</option>
            <option value="3">Somewhat Confident</option>
            <option value="5">Very Confident</option>
          </select>

          <button className="mt-4 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-700" onClick={handleSubmitAnswer}>
            Submit Answer
          </button>

          <button className="mt-4 px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-700" onClick={handleGetHint}>
            Get Hint
          </button>

          {showHint && <p className="mt-4 text-gray-700">Hint: {hint}</p>}
          {isCorrect !== null && <p className={`mt-4 font-bold ${isCorrect ? "text-green-600" : "text-red-600"}`}>{isCorrect ? "✅ Correct!" : "❌ Incorrect!"}</p>}
        </div>
      )}

      {/* Chat Section */}
      <div className="mt-6 w-3/4 p-4 bg-white shadow rounded">
        <h2 className="text-xl font-semibold">Chat with AI Tutor</h2>
        <div className="overflow-y-auto h-64 border rounded p-3 bg-gray-50">
          {chatHistory.length > 0 ? (
            chatHistory.map((chat, index) => (
              <div key={index} className="mb-3">
                <p className="text-gray-700"><strong className="text-blue-500">You:</strong> {chat.user_message}</p>
                <p className="text-gray-700"><strong className="text-purple-600">Tutor:</strong> {chat.tutor_response}</p>
              </div>
            ))
          ) : (
            <p className="text-gray-500 text-center">No messages yet. Start chatting!</p>
          )}
        </div>

        {/* Input Box */}
        <div className="flex mt-4 space-x-2">
          <input 
            type="text"
            className="flex-1 border p-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="Ask the tutor..."
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
          />
          <button 
            className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-700 transition"
            onClick={sendMessage}
          >
            Send
          </button>
        </div>
      </div>


    </div>
  );
}
