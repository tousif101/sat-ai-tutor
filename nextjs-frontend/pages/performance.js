import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import { useRouter } from "next/router";
import Link from "next/link";

export default function PerformanceDashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [trends, setTrends] = useState([]);
  const router = useRouter();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth");
      } else {
        setUser(user);
        fetchStats(user.id);
        fetchTrends(user.id);
      }
    };
    checkUser();
  }, []);

  const fetchStats = async (userId) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/user-stats?user_id=${userId}`);
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      } else {
        console.error("Error fetching user stats");
      }
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTrends = async (userId) => {
    try {
      const response = await fetch(`/api/performance-trends?user_id=${userId}`);
      if (response.ok) {
        const data = await response.json();
        setTrends(data.trends || []);
      } else {
        console.error("Error fetching performance trends");
      }
    } catch (error) {
      console.error("Failed to fetch trends:", error);
    }
  };

  // Calculate time improvement (if any)
  const calculateTimeImprovement = () => {
    if (trends.length < 2) return null;
    
    // Group by topic
    const topicGroups = {};
    trends.forEach(item => {
      if (!topicGroups[item.topic]) {
        topicGroups[item.topic] = [];
      }
      topicGroups[item.topic].push(item);
    });
    
    // Calculate average time for first and last 3 questions per topic
    const improvements = {};
    Object.keys(topicGroups).forEach(topic => {
      const items = topicGroups[topic];
      if (items.length >= 6) {
        const firstThree = items.slice(0, 3);
        const lastThree = items.slice(-3);
        
        const firstAvg = firstThree.reduce((sum, item) => sum + item.time_taken, 0) / 3;
        const lastAvg = lastThree.reduce((sum, item) => sum + item.time_taken, 0) / 3;
        
        // Add this check to avoid division by zero or very small values
        if (firstAvg > 0.001) {
          const improvement = ((firstAvg - lastAvg) / firstAvg) * 100;
          // Add this check to handle infinity values
          improvements[topic] = isFinite(improvement) ? improvement : 0;
        } else {
          improvements[topic] = 0;
        }
      }
    });
    
    return improvements;
  };

  const timeImprovements = calculateTimeImprovement();

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-6xl mx-auto">
        <nav className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-blue-600">SAT AI Tutor</h1>
          <div className="flex gap-4">
            <Link href="/dashboard" className="px-4 py-2 bg-blue-500 text-white rounded">
              Return to Practice
            </Link>
          </div>
        </nav>

        <h2 className="text-2xl font-semibold mb-6">Performance Dashboard</h2>

        {user ? (
          <p className="mb-4">
            Welcome back, <span className="font-medium">{user.email}</span>
          </p>
        ) : null}

        {loading ? (
          <div className="text-center py-10">
            <p>Loading performance data...</p>
          </div>
        ) : stats ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Overall Statistics Card */}
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-xl font-semibold mb-4 text-blue-600">Overall Performance</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-gray-50 rounded">
                  <p className="text-gray-500 text-sm">Questions Attempted</p>
                  <p className="text-2xl font-bold">{stats.total_questions}</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded">
                  <p className="text-gray-500 text-sm">Correct Answers</p>
                  <p className="text-2xl font-bold">{stats.correct_answers}</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded">
                  <p className="text-gray-500 text-sm">Accuracy</p>
                  <p className="text-2xl font-bold">{stats.accuracy.toFixed(1)}%</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded">
                  <p className="text-gray-500 text-sm">Avg. Time</p>
                  <p className="text-2xl font-bold">{stats.average_time.toFixed(0)}s</p>
                </div>
              </div>
            </div>

            {/* Topic Performance Card */}
            <div className="bg-white p-6 rounded-lg shadow-md md:col-span-2">
              <h3 className="text-xl font-semibold mb-4 text-blue-600">Performance by Topic</h3>
              {Object.keys(stats.by_topic).length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-2 text-left">Topic</th>
                        <th className="px-4 py-2 text-center">Questions</th>
                        <th className="px-4 py-2 text-center">Correct</th>
                        <th className="px-4 py-2 text-center">Accuracy</th>
                        <th className="px-4 py-2 text-center">Avg. Time</th>
                        {timeImprovements && <th className="px-4 py-2 text-center">Improvement</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(stats.by_topic).map(([topic, data]) => (
                        <tr key={topic} className="border-t">
                          <td className="px-4 py-3 font-medium">{topic}</td>
                          <td className="px-4 py-3 text-center">{data.total}</td>
                          <td className="px-4 py-3 text-center">{data.correct}</td>
                          <td className="px-4 py-3 text-center">
                            <span 
                              className={`px-2 py-1 rounded ${
                                data.accuracy >= 80 ? 'bg-green-100 text-green-800' : 
                                data.accuracy >= 60 ? 'bg-yellow-100 text-yellow-800' : 
                                'bg-red-100 text-red-800'
                              }`}
                            >
                              {data.accuracy.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">{data.average_time.toFixed(0)}s</td>
                          {timeImprovements && (
                            <td className="px-4 py-3 text-center">
                              {timeImprovements[topic] !== undefined ? (
                                  <span className={timeImprovements[topic] > 0 ? "text-green-600" : "text-red-600"}>
                                    {timeImprovements[topic] > 0 ? "+" : ""}{timeImprovements[topic].toFixed(1)}%
                                  </span>
                                ) : "N/A"}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">No topic data available yet</p>
              )}
            </div>

            {/* Recent Activity Card */}
            <div className="bg-white p-6 rounded-lg shadow-md lg:col-span-3">
              <h3 className="text-xl font-semibold mb-4 text-blue-600">Recent Activity</h3>
              {trends.length > 0 ? (
                <div className="overflow-x-auto max-h-80">
                  <table className="min-w-full">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-2 text-left">Date</th>
                        <th className="px-4 py-2 text-left">Topic</th>
                        <th className="px-4 py-2 text-center">Result</th>
                        <th className="px-4 py-2 text-center">Time</th>
                        <th className="px-4 py-2 text-center">Difficulty</th>
                        <th className="px-4 py-2 text-center">Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trends.slice(-10).reverse().map((item, index) => (
                        <tr key={index} className="border-t">
                          <td className="px-4 py-2">
                            {new Date(item.timestamp).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-2">{item.topic}</td>
                          <td className="px-4 py-2 text-center">
                            <span className={`px-2 py-1 rounded ${item.correct ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                              {item.correct ? "Correct" : "Incorrect"}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-center">{item.time_taken}s</td>
                          <td className="px-4 py-2 text-center">{item.difficulty_level}/5</td>
                          <td className="px-4 py-2 text-center">{item.confidence}/5</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">No activity recorded yet</p>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-10 bg-white rounded-lg shadow-md">
            <p className="text-xl text-gray-600">No performance data available yet.</p>
            <p className="mt-2 text-gray-500">Start practicing to see your statistics!</p>
            <Link href="/dashboard" className="mt-6 inline-block px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
              Go to Practice
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}