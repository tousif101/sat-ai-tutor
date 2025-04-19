import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import { useRouter } from "next/router";
import Link from "next/link";

export default function LeaderboardPage() {
  const [user, setUser] = useState(null);
  const [globalLeaderboard, setGlobalLeaderboard] = useState([]);
  const [topicLeaderboard, setTopicLeaderboard] = useState([]);
  const [userRanking, setUserRanking] = useState(null);
  const [selectedTopic, setSelectedTopic] = useState("Algebra");
  const [loading, setLoading] = useState(true);
  
  const router = useRouter();
  
  const topics = ["Algebra", "Geometry", "Grammar", "Reading Comprehension", "Trigonometry"];
  
  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth");
      } else {
        setUser(user);
        fetchGlobalLeaderboard();
        fetchTopicLeaderboard(selectedTopic);
        fetchUserRanking(user.id);
      }
    };
    
    checkUser();
  }, []);
  
  useEffect(() => {
    if (user) {
      fetchTopicLeaderboard(selectedTopic);
    }
  }, [selectedTopic]);
  
const fetchGlobalLeaderboard = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/leaderboard?type=global&limit=10`);
      const data = await response.json();
      console.log("Global leaderboard data:", data); // Add this to debug
      setGlobalLeaderboard(data.leaderboard || []);
    } catch (error) {
      console.error("Failed to fetch global leaderboard:", error);
    } finally {
      setLoading(false);
    }
  };
  
  const fetchTopicLeaderboard = async (topic) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/leaderboard?type=topic&topic=${topic}&limit=10`);
      const data = await response.json();
      setTopicLeaderboard(data.leaderboard || []);
    } catch (error) {
      console.error(`Failed to fetch ${topic} leaderboard:`, error);
    } finally {
      setLoading(false);
    }
  };
  
  const fetchUserRanking = async (userId) => {
    try {
      const response = await fetch(`/api/leaderboard?type=user&userId=${userId}`);
      const data = await response.json();
      setUserRanking(data);
    } catch (error) {
      console.error("Failed to fetch user ranking:", error);
    }
  };
  
  const formatEmail = (email) => {
    if (!email || email.indexOf('@') === -1) {
      return "Anonymous User";
    }
    const [username, domain] = email.split('@');
    if (username.length <= 3) return email;
    return `${username.substring(0, 3)}***@${domain}`;
  };
  
  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-6xl mx-auto">
        <nav className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-blue-600">SAT AI Tutor</h1>
          <div className="flex gap-4">
            <Link href="/dashboard" className="px-4 py-2 bg-blue-500 text-white rounded">
              Practice
            </Link>
            <Link href="/performance" className="px-4 py-2 bg-green-500 text-white rounded">
              Performance
            </Link>
          </div>
        </nav>

        <h2 className="text-2xl font-semibold mb-6">Leaderboards</h2>

        {user && userRanking && (
          <div className="bg-white p-6 rounded-lg shadow-md mb-8">
            <h3 className="text-xl font-semibold mb-4 text-blue-600">Your Rankings</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded">
                <p className="text-gray-500 text-sm">Global Rank</p>
                <p className="text-3xl font-bold text-blue-600">#{userRanking.rank || 'N/A'}</p>
                <p className="text-sm">out of {userRanking.total_users || 0} users</p>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded">
                <p className="text-gray-500 text-sm">Percentile</p>
                <p className="text-3xl font-bold text-blue-600">
                  {userRanking.percentile ? `${userRanking.percentile.toFixed(1)}%` : 'N/A'}
                </p>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded">
                <p className="text-gray-500 text-sm">Total Points</p>
                <p className="text-3xl font-bold text-blue-600">{userRanking.total_points || 0}</p>
              </div>
              <div className="text-center p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded">
                <p className="text-gray-500 text-sm">Next Milestone</p>
                <p className="text-3xl font-bold text-purple-600">
                  {userRanking.total_points < 1000 ? 1000 : 
                   userRanking.total_points < 5000 ? 5000 : 
                   userRanking.total_points < 10000 ? 10000 : '✓'}
                </p>
                {userRanking.total_points < 10000 && (
                  <p className="text-sm">
                    {userRanking.total_points < 1000 ? 
                      `${(userRanking.total_points / 1000 * 100).toFixed(0)}% to Bronze` : 
                     userRanking.total_points < 5000 ? 
                      `${((userRanking.total_points - 1000) / 4000 * 100).toFixed(0)}% to Silver` : 
                      `${((userRanking.total_points - 5000) / 5000 * 100).toFixed(0)}% to Gold`}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Global Leaderboard */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold mb-4 text-blue-600">Global Leaderboard</h3>
            {loading ? (
              <p className="text-center py-4">Loading...</p>
            ) : globalLeaderboard.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-2 text-left">Rank</th>
                      <th className="px-4 py-2 text-left">User</th>
                      <th className="px-4 py-2 text-center">Points</th>
                      <th className="px-4 py-2 text-center">Accuracy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {globalLeaderboard.map((entry) => (
                      <tr 
                        key={entry.user_id} 
                        className={`border-t ${entry.user_id === user?.id ? 'bg-blue-50' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full 
                            ${entry.rank === 1 ? 'bg-yellow-100 text-yellow-800' :
                              entry.rank === 2 ? 'bg-gray-100 text-gray-800' :
                              entry.rank === 3 ? 'bg-amber-100 text-amber-800' : 'bg-blue-50 text-blue-600'}`
                          }>
                            {entry.rank}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {formatEmail(entry.email)}
                          {entry.user_id === user?.id && <span className="ml-2 text-blue-500">(You)</span>}
                        </td>
                        <td className="px-4 py-3 text-center font-semibold">{entry.total_points}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-1 rounded ${
                            entry.accuracy >= 80 ? 'bg-green-100 text-green-800' : 
                            entry.accuracy >= 60 ? 'bg-yellow-100 text-yellow-800' : 
                            'bg-red-100 text-red-800'
                          }`}>
                            {entry.accuracy.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-center py-4">No data available yet</p>
            )}
          </div>

          {/* Topic Leaderboard */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-blue-600">Topic Leaderboard</h3>
              <select 
                className="border rounded px-2 py-1" 
                value={selectedTopic} 
                onChange={(e) => setSelectedTopic(e.target.value)}
              >
                {topics.map((topic) => (
                  <option key={topic} value={topic}>{topic}</option>
                ))}
              </select>
            </div>
            
            {loading ? (
              <p className="text-center py-4">Loading...</p>
            ) : topicLeaderboard.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-2 text-left">Rank</th>
                      <th className="px-4 py-2 text-left">User</th>
                      <th className="px-4 py-2 text-center">Points</th>
                      <th className="px-4 py-2 text-center">Accuracy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topicLeaderboard.map((entry) => (
                      <tr 
                        key={entry.user_id} 
                        className={`border-t ${entry.user_id === user?.id ? 'bg-blue-50' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full 
                            ${entry.rank === 1 ? 'bg-yellow-100 text-yellow-800' :
                              entry.rank === 2 ? 'bg-gray-100 text-gray-800' :
                              entry.rank === 3 ? 'bg-amber-100 text-amber-800' : 'bg-blue-50 text-blue-600'}`
                          }>
                            {entry.rank}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {formatEmail(entry.email)}
                          {entry.user_id === user?.id && <span className="ml-2 text-blue-500">(You)</span>}
                        </td>
                        <td className="px-4 py-3 text-center font-semibold">{entry.total_points}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-1 rounded ${
                            entry.accuracy >= 80 ? 'bg-green-100 text-green-800' : 
                            entry.accuracy >= 60 ? 'bg-yellow-100 text-yellow-800' : 
                            'bg-red-100 text-red-800'
                          }`}>
                            {entry.accuracy.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-center py-4">No data available for {selectedTopic}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}