from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
import os
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Create router
router = APIRouter()

class LeaderboardEntry(BaseModel):
    user_id: str
    email: str
    total_questions: int
    correct_answers: int
    accuracy: float
    avg_difficulty: float
    total_points: int
    rank: Optional[int] = None

@router.get("/global-leaderboard")
async def get_global_leaderboard(limit: int = Query(10, ge=1, le=100)):
    """
    Get the global leaderboard, aggregated directly from user_progress.
    """
    try:
        # Get all user_progress records
        progress_response = supabase.table("user_progress") \
            .select("user_id,correct,difficulty_level") \
            .execute()
        
        if not progress_response.data:
            return {"leaderboard": []}
        
        # Process data to calculate user stats
        user_stats = {}
        for record in progress_response.data:
            user_id = record.get("user_id")
            if user_id not in user_stats:
                user_stats[user_id] = {
                    "user_id": user_id,
                    "total_questions": 0,
                    "correct_answers": 0,
                    "points": 0,
                    "difficulty_sum": 0
                }
            
            user_stats[user_id]["total_questions"] += 1
            
            if record.get("correct", False):
                user_stats[user_id]["correct_answers"] += 1
                difficulty = record.get("difficulty_level", 1)
                user_stats[user_id]["points"] += difficulty * 10
            
            user_stats[user_id]["difficulty_sum"] += record.get("difficulty_level", 1)
        
        # Convert to leaderboard entries
        leaderboard = []
        for user_id, stats in user_stats.items():
            if stats["total_questions"] > 0:
                # Get email from leaderboards table if available
                email_query = supabase.table("leaderboards").select("email").eq("user_id", user_id).execute()
                email = email_query.data[0]["email"] if email_query.data else "Anonymous"
                
                entry = {
                    "user_id": user_id,
                    "email": email,
                    "total_questions": stats["total_questions"],
                    "correct_answers": stats["correct_answers"],
                    "accuracy": (stats["correct_answers"] / stats["total_questions"]) * 100,
                    "avg_difficulty": stats["difficulty_sum"] / stats["total_questions"],
                    "total_points": stats["points"]
                }
                leaderboard.append(entry)
        
        # Sort, limit, and add ranks
        leaderboard.sort(key=lambda x: x["total_points"], reverse=True)
        leaderboard = leaderboard[:limit]
        for i, entry in enumerate(leaderboard):
            entry["rank"] = i + 1
        
        return {"leaderboard": leaderboard}
        
    except Exception as e:
        print(f"Error fetching global leaderboard: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
@router.get("/topic-leaderboard/{topic}")
async def get_topic_leaderboard(topic: str, limit: int = Query(10, ge=1, le=100)):
    try:
        # Get all user_progress records for this topic
        progress_response = supabase.table("user_progress") \
            .select("user_id,correct,difficulty_level") \
            .eq("topic", topic) \
            .execute()
        
        if not progress_response.data:
            return {"leaderboard": []}
        
        # Process data to calculate topic stats
        user_stats = {}
        for record in progress_response.data:
            user_id = record.get("user_id")
            if user_id not in user_stats:
                user_stats[user_id] = {
                    "user_id": user_id,
                    "total_questions": 0,
                    "correct_answers": 0,
                    "points": 0,
                    "difficulty_sum": 0
                }
            
            user_stats[user_id]["total_questions"] += 1
            
            if record.get("correct", False):
                user_stats[user_id]["correct_answers"] += 1
                difficulty = record.get("difficulty_level", 1)
                user_stats[user_id]["points"] += difficulty * 10
            
            user_stats[user_id]["difficulty_sum"] += record.get("difficulty_level", 1)
        
        # Convert to leaderboard entries
        leaderboard = []
        for user_id, stats in user_stats.items():
            if stats["total_questions"] > 0:
                # Instead of querying auth.users directly, use the email from existing leaderboards table
                email_query = supabase.table("leaderboards").select("email").eq("user_id", user_id).execute()
                email = email_query.data[0]["email"] if email_query.data else "Anonymous"
                
                entry = {
                    "user_id": user_id,
                    "email": email,
                    "total_questions": stats["total_questions"],
                    "correct_answers": stats["correct_answers"],
                    "accuracy": (stats["correct_answers"] / stats["total_questions"]) * 100,
                    "avg_difficulty": stats["difficulty_sum"] / stats["total_questions"],
                    "total_points": stats["points"]
                }
                leaderboard.append(entry)
        
        # Sort, limit, and add ranks
        leaderboard.sort(key=lambda x: x["total_points"], reverse=True)
        leaderboard = leaderboard[:limit]
        for i, entry in enumerate(leaderboard):
            entry["rank"] = i + 1
        
        return {"leaderboard": leaderboard}
        
    except Exception as e:
        print(f"Error fetching topic leaderboard: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/user-ranking/{user_id}")
async def get_user_ranking(user_id: str):
    try:
        # Check if user exists in leaderboards
        user_response = supabase.table("leaderboards") \
            .select("total_points") \
            .eq("user_id", user_id) \
            .execute()
        
        # Return default values if no record found
        if not user_response.data:
            return {
                "rank": None,
                "total_users": 0,
                "percentile": None,
                "total_points": 0
            }
        
        user_points = user_response.data[0]["total_points"]
        
        # Count users with more points
        rank_response = supabase.table("leaderboards") \
            .select("count", count="exact") \
            .filter("total_points", "gt", user_points) \
            .execute()
        
        user_rank = rank_response.count + 1
        
        # Get total users
        total_response = supabase.table("leaderboards") \
            .select("count", count="exact") \
            .execute()
        
        total_users = total_response.count
        
        # Calculate percentile
        percentile = (user_rank / total_users) * 100 if total_users > 0 else None
        
        return {
            "rank": user_rank,
            "total_users": total_users,
            "percentile": percentile,
            "total_points": user_points
        }
        
    except Exception as e:
        print(f"Error fetching user ranking: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))