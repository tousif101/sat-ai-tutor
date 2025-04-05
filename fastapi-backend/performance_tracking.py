from pydantic import BaseModel, Field
from datetime import datetime
from fastapi import APIRouter, HTTPException
import os
from supabase import create_client, Client
from dotenv import load_dotenv
from typing import Optional

# Load environment variables
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Create router
router = APIRouter()

# Enhanced User Answer model - with Optional timestamp
class EnhancedUserAnswer(BaseModel):
    user_id: str
    topic: str
    question_id: str
    user_answer: str
    correct: bool
    confidence: int = Field(..., ge=1, le=5)
    time_taken: float  # in seconds
    difficulty_level: int = Field(..., ge=1, le=5)
    # Make timestamp optional to avoid serialization issues
    timestamp: Optional[datetime] = None

    class Config:
        schema_extra = {
            "example": {
                "user_id": "user123",
                "topic": "Algebra",
                "question_id": "question456",
                "user_answer": "A",
                "correct": True,
                "confidence": 4,
                "time_taken": 45.2,
                "difficulty_level": 3
            }
        }
        # Add JSON serialization configuration
        json_encoders = {
            datetime: lambda dt: dt.isoformat()
        }

# Submit enhanced answer endpoint
@router.post("/submit-answer")
async def submit_answer(answer: EnhancedUserAnswer):
    try:
        # Create a dict from the model, manually handling the timestamp
        answer_dict = answer.dict(exclude={"timestamp"})
        
        # Add the current timestamp in ISO format
        answer_dict["timestamp"] = datetime.utcnow().isoformat()
            
        print("📌 Received Enhanced Answer Submission:", answer_dict)
        
        # Save enhanced answer to Supabase with serialized timestamp
        response = supabase.table("user_progress").insert(answer_dict).execute()
        
        if response.data and isinstance(response.data, dict) and "error" in response.data:
            raise HTTPException(status_code=500, detail=response.data["error"])
            
        return {"message": "Answer recorded successfully!", "data": response.data}
        
    except Exception as e:
        print("❌ Error submitting enhanced answer:", str(e))
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/user-stats/{user_id}")
async def get_user_stats(user_id: str):
    try:
        # Fetch user's performance data
        response = supabase.table("user_progress").select("*").eq("user_id", user_id).execute()
        
        if not response.data:
            return {
                "total_questions": 0,
                "correct_answers": 0,
                "accuracy": 0,
                "average_time": 0,
                "by_topic": {}
            }
            
        # Calculate statistics
        answers = response.data
        total_questions = len(answers)
        correct_answers = sum(1 for answer in answers if answer.get("correct", False))
        accuracy = (correct_answers / total_questions) * 100 if total_questions > 0 else 0
        
        # Calculate average time taken - with safety checks for None values
        valid_times = [answer.get("time_taken", 0) for answer in answers if answer.get("time_taken") is not None]
        total_time = sum(valid_times)
        average_time = total_time / len(valid_times) if valid_times else 0
        
        # Group by topic
        topics = {}
        for answer in answers:
            topic = answer.get("topic", "Unknown")
            if topic not in topics:
                topics[topic] = {
                    "total": 0,
                    "correct": 0,
                    "total_time": 0,
                    "times": []
                }
            
            topics[topic]["total"] += 1
            if answer.get("correct", False):
                topics[topic]["correct"] += 1
            
            # Only add time if it's not None
            time_taken = answer.get("time_taken")
            if time_taken is not None:
                topics[topic]["total_time"] += time_taken
                topics[topic]["times"].append(time_taken)
        
        # Calculate per-topic statistics
        for topic in topics:
            total_valid_times = len(topics[topic]["times"])
            if topics[topic]["total"] > 0:
                topics[topic]["accuracy"] = (topics[topic]["correct"] / topics[topic]["total"]) * 100
                topics[topic]["average_time"] = topics[topic]["total_time"] / total_valid_times if total_valid_times > 0 else 0
            else:
                topics[topic]["accuracy"] = 0
                topics[topic]["average_time"] = 0
            
            # Remove temporary calculation fields
            del topics[topic]["total_time"]
            del topics[topic]["times"]
        
        return {
            "total_questions": total_questions,
            "correct_answers": correct_answers,
            "accuracy": accuracy,
            "average_time": average_time,
            "by_topic": topics
        }
        
    except Exception as e:
        print(f"❌ Error fetching user statistics: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Get performance trends over time
@router.get("/performance-trends/{user_id}")
async def get_performance_trends(user_id: str):
    try:
        # Fetch user's performance data ordered by timestamp
        response = supabase.table("user_progress")\
            .select("*")\
            .eq("user_id", user_id)\
            .order("timestamp", desc=False)\
            .execute()
        
        if not response.data:
            return {"trends": []}
            
        # Process data for trend analysis
        trends = []
        for answer in response.data:
            trends.append({
                "timestamp": answer.get("timestamp"),
                "topic": answer.get("topic"),
                "correct": answer.get("correct", False),
                "time_taken": answer.get("time_taken", 0),
                "difficulty_level": answer.get("difficulty_level", 1),
                "confidence": answer.get("confidence", 3)
            })
            
        return {"trends": trends}
        
    except Exception as e:
        print("❌ Error fetching performance trends:", str(e))
        raise HTTPException(status_code=500, detail=str(e))