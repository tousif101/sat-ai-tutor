import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useRouter } from "next/router";
import Link from "next/link";

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
  
  // New states for enhanced tracking
  const [questionStartTime, setQuestionStartTime] = useState(null);
  const [difficultyLevel, setDifficultyLevel] = useState(1);
  const [adaptiveMode, setAdaptiveMode] = useState(true);
  const [challengeMode, setChallengeMode] = useState(false);
  const [abilityData, setAbilityData] = useState(null);
  
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
        fetchUserAbility(user.id);
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

  const fetchUserAbility = async (userId) => {
    try {
      const response = await fetch(`/api/user-ability?user_id=${userId}`);
      if (response.ok) {
        const data = await response.json();
        console.log("User ability data:", data);
        setAbilityData(data);
      }
    } catch (error) {
      console.error("Failed to fetch user ability:", error);
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
          question_id: questionData.question_id,
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
      let response;
      
      if (adaptiveMode && user) {
        // Use adaptive question generation
        console.log(`Generating adaptive question for user ${user.id} with topic ${topic} and challenge mode ${challengeMode}`);
        response = await fetch(`/api/generate-adaptive-question?user_id=${user.id}&topic=${topic}&challenge_mode=${challengeMode}`);
      } else {
        // Use standard question generation with manual difficulty
        console.log(`Generating question with topic ${topic} and manual difficulty ${difficultyLevel}`);
        response = await fetch(`/api/generate-question?topic=${topic}&difficulty_level=${difficultyLevel}`);
      }

      const data = await response.json();

      if (data.error) {
        alert("Error generating question");
        console.error("Error:", data.error);
      } else {
        console.log("✅ Question Data:", data);
        if (!data.question_id) {
          console.error("❌ Missing `question_id` in response!");
          alert("Error: Question ID is missing. Please regenerate.");
          return;
        }
        setQuestionData(data);
        
        // If we're in adaptive mode, update the difficulty level display
        if (adaptiveMode && data.adaptive_info) {
          setDifficultyLevel(data.adaptive_info.recommended_difficulty);
          console.log("Updated difficulty level from adaptive info:", data.adaptive_info.recommended_difficulty);
        }
        
        // Start timing when question is shown
        setQuestionStartTime(Date.now());
      }
    } catch (error) {
      console.error("Failed to fetch question:", error);
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

    // Calculate time taken to answer in seconds
    const timeTakenSeconds = questionStartTime 
      ? Math.round((Date.now() - questionStartTime) / 1000) 
      : 0;
    
    const correct = userAnswer.toUpperCase() === questionData.correct_answer;

    const payload = {
      user_id: user.id,
      topic,
      question_id: questionData.question_id,
      user_answer: userAnswer,
      correct,
      confidence,
      // Add enhanced tracking data
      time_taken: timeTakenSeconds,
      difficulty_level: difficultyLevel
    };

    console.log("📌 Sending Enhanced Answer Submission:", payload);

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

      // Show correct/incorrect feedback
      setIsCorrect(correct);

      // Show explanation after answering
      alert(correct ? "✅ Correct Answer!" : `❌ Incorrect! Correct Answer: ${questionData.correct_answer}\nExplanation: ${questionData.solution}`);

      // After submission, refresh the user ability data
      if (user) {
        fetchUserAbility(user.id);
      }
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

  // Format ability score for display
  const formatAbilityScore = (score) => {
    if (score === undefined || score === null) return "N/A";
    
    // First, ensure we have a number
    const numericScore = parseFloat(score);
    
    // For debugging
    console.log(`Raw ability score: ${numericScore}`);
    
    // More conservative formula:
    // Use a hard cap on positive scores until we fix the backend calculation
    // This is a temporary fix until we identify the root cause
    const cappedScore = Math.min(numericScore, 1.0); // Cap at 1.0 (about 67%)
    
    // Convert to percentage (scale of -3 to +3)
    const percentage = Math.min(Math.max(Math.round(((cappedScore + 3) / 6) * 100), 0), 100);
    
    return `${percentage}%`;
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-6">
      <div className="w-full max-w-6xl">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-4xl font-bold text-blue-600">SAT AI Tutor</h1>
          
          <div className="flex items-center space-x-4">
            {user && (
              <span className="text-lg">
                Welcome, <span className="font-semibold">{user.email}</span>
              </span>
            )}
            
            <Link href="/performance" className="px-4 py-2 bg-green-500 text-white rounded">
              View Performance
            </Link>
          </div>
        </div>

        {/* Ability Overview Card (if data is available) */}
        {abilityData && (
          <div className="mb-6 p-4 bg-white shadow rounded">
            <h2 className="text-xl font-semibold mb-2">Your Current Progress</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 bg-blue-50 rounded">
                <p className="text-sm text-gray-600">Overall Ability</p>
                <p className="text-lg font-bold">{formatAbilityScore(abilityData.overall_ability)}</p>
              </div>
              <div className="p-3 bg-blue-50 rounded">
                <p className="text-sm text-gray-600">Questions Answered</p>
                <p className="text-lg font-bold">{abilityData.questions_answered || 0}</p>
              </div>
              
              {/* Display topic-specific ability if available */}
              {topic && abilityData.topic_abilities && abilityData.topic_abilities[topic] && (
                <>
                  <div className="p-3 bg-blue-50 rounded">
                    <p className="text-sm text-gray-600">{topic} Ability</p>
                    <p className="text-lg font-bold">
                      {formatAbilityScore(abilityData.topic_abilities[topic].ability)}
                    </p>
                  </div>
                  <div className="p-3 bg-blue-50 rounded">
                    <p className="text-sm text-gray-600">{topic} Success Rate</p>
                    <p className="text-lg font-bold">
                      {Math.round((abilityData.topic_abilities[topic].success_rate || 0) * 100)}%
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Topic Selection & Question Generation */}
        <div className="bg-white p-6 rounded-lg shadow-md mb-6">
          <h2 className="text-xl font-semibold mb-4">Generate a Practice Question</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select Topic:
              </label>
              <select 
                className="w-full border p-2 rounded" 
                value={topic} 
                onChange={(e) => setTopic(e.target.value)}
              >
                {satTopics.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            
            <div>
              <div className="flex items-center mb-2">
                <input
                  id="adaptive-mode"
                  type="checkbox"
                  className="mr-2"
                  checked={adaptiveMode}
                  onChange={(e) => setAdaptiveMode(e.target.checked)}
                />
                <label htmlFor="adaptive-mode" className="text-sm font-medium text-gray-700">
                  Use Adaptive Difficulty
                </label>
              </div>
              
              {adaptiveMode ? (
                <div className="flex items-center">
                  <input
                    id="challenge-mode"
                    type="checkbox"
                    className="mr-2"
                    checked={challengeMode}
                    onChange={(e) => setChallengeMode(e.target.checked)}
                  />
                  <label htmlFor="challenge-mode" className="text-sm font-medium text-gray-700">
                    Challenge Mode (slightly harder questions)
                  </label>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Manual Difficulty Level:
                  </label>
                  <select 
                    className="w-full border p-2 rounded" 
                    value={difficultyLevel} 
                    onChange={(e) => setDifficultyLevel(parseInt(e.target.value))}
                    disabled={adaptiveMode}
                  >
                    <option value="1">Very Easy (1)</option>
                    <option value="2">Easy (2)</option>
                    <option value="3">Medium (3)</option>
                    <option value="4">Hard (4)</option>
                    <option value="5">Very Hard (5)</option>
                  </select>
                </div>
              )}
            </div>
          </div>
          
          <button
            className="mt-4 w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-700 transition"
            onClick={handleGenerateQuestion}
            disabled={loading}
          >
            {loading ? "Generating..." : "Generate Question"}
          </button>
        </div>

        {/* Question Section */}
        {questionData && (
          <div className="mb-6 p-6 bg-white shadow rounded-lg">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-semibold">Practice Question</h2>
              <div className="flex items-center space-x-2 text-sm bg-gray-100 px-3 py-1 rounded">
                <span>Difficulty:</span>
                <span className={`font-semibold ${
                  difficultyLevel <= 2 ? 'text-green-600' : 
                  difficultyLevel === 3 ? 'text-blue-600' : 'text-red-600'
                }`}>
                  {difficultyLevel === 1 ? 'Very Easy' : 
                   difficultyLevel === 2 ? 'Easy' : 
                   difficultyLevel === 3 ? 'Medium' : 
                   difficultyLevel === 4 ? 'Hard' : 'Very Hard'}
                </span>
              </div>
            </div>

            {questionData.passage && (
              <div className="mb-6">
                <h3 className="font-medium mb-2">Passage:</h3>
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 max-h-60 overflow-y-auto">
                  <p className="text-gray-800 whitespace-pre-wrap">{questionData.passage}</p>
                </div>
              </div>
            )}
    
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <p className="text-lg">{questionData.question}</p>
              
              {/* Display timer if question is active */}
              {questionStartTime && (
                <div className="text-sm text-gray-500 mt-2">
                  Time elapsed: <span id="time-counter">{Math.round((Date.now() - questionStartTime) / 1000)}</span> seconds
                </div>
              )}
            </div>
            
            {questionData.choices && (
              <div className="mb-6">
                <h3 className="font-medium mb-2">Answer Choices:</h3>
                <div className="space-y-2">
                  {Object.entries(questionData.choices).map(([key, value]) => (
                    <div key={key} className="p-3 border rounded hover:bg-gray-50 transition">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input 
                          type="radio" 
                          name="answer" 
                          value={key} 
                          checked={userAnswer === key}
                          onChange={() => setUserAnswer(key)} 
                        />
                        <span><strong>{key}:</strong> {value}</span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Confidence selector */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confidence Level:
              </label>
              <select 
                className="border p-2 rounded w-full" 
                value={confidence} 
                onChange={(e) => setConfidence(parseInt(e.target.value))}
              >
                <option value="1">Not Confident</option>
                <option value="2">Slightly Confident</option>
                <option value="3">Somewhat Confident</option>
                <option value="4">Confident</option>
                <option value="5">Very Confident</option>
              </select>
            </div>

            <div className="flex space-x-2">
              <button 
                className="flex-1 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-700 transition" 
                onClick={handleSubmitAnswer}
              >
                Submit Answer
              </button>

              <button 
                className="flex-1 px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-700 transition" 
                onClick={handleGetHint}
              >
                Get Hint
              </button>
            </div>

            {showHint && (
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                <h3 className="font-medium text-yellow-800">Hint:</h3>
                <p className="text-gray-700">{hint}</p>
              </div>
            )}
            
            {isCorrect !== null && (
              <div className={`mt-4 p-3 rounded ${isCorrect ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                <h3 className={`font-medium ${isCorrect ? "text-green-800" : "text-red-800"}`}>
                  {isCorrect ? "✅ Correct!" : "❌ Incorrect!"}
                </h3>
                {!isCorrect && (
                  <div className="mt-1">
                    <p><strong>Correct Answer:</strong> {questionData.correct_answer}</p>
                    <p className="mt-1"><strong>Explanation:</strong> {questionData.solution}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Chat Section */}
        <div className="bg-white p-6 rounded-lg shadow-md mb-6">
          <h2 className="text-xl font-semibold mb-4">Chat with AI Tutor</h2>
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
              onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
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

      {/* Add a live timer update effect */}
      {questionStartTime && (
        <script dangerouslySetInnerHTML={{
          __html: `
            const timerInterval = setInterval(() => {
              const counter = document.getElementById('time-counter');
              if (counter) {
                counter.textContent = Math.round((Date.now() - ${questionStartTime}) / 1000);
              } else {
                clearInterval(timerInterval);
              }
            }, 1000);
          `
        }} />
      )}
    </div>
  );
}