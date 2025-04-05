"""
Adaptive Difficulty Module

This module implements a simplified version of Item Response Theory (IRT) to estimate 
user ability levels and determine appropriate difficulty levels for questions.
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Dict, Optional
import numpy as np
from datetime import datetime, timedelta
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

# Initial difficulty parameters
INITIAL_ABILITY = 0.0  # Standard IRT scale (approximately -3 to +3)
INITIAL_GUESS = 0.25   # Probability of guessing correctly (for 4 choices)
INITIAL_SLIP = 0.1     # Probability of slipping on a known answer

# Models
class TopicAbility(BaseModel):
    topic: str
    ability: float
    confidence: float  # How confident we are in this ability estimate
    question_count: int
    last_updated: datetime

class UserAbility(BaseModel):
    user_id: str
    overall_ability: float
    topic_abilities: Dict[str, TopicAbility]
    last_updated: datetime

class QuestionDifficulty(BaseModel):
    question_id: str
    topic: str
    difficulty: float  # IRT difficulty parameter
    discrimination: float = 1.0  # How well the question distinguishes abilities
    last_updated: datetime

class RecommendedQuestion(BaseModel):
    topic: str
    difficulty_level: int
    estimated_ability: float

# Helper functions for the IRT model
def calculate_success_probability(ability, difficulty, discrimination=1.0, guess=0.25):
    """
    Calculate the probability of a correct response using a 3PL IRT model.
    
    Parameters:
    - ability: User's ability parameter (theta)
    - difficulty: Question difficulty parameter (b)
    - discrimination: Question discrimination parameter (a)
    - guess: Guessing parameter (c) - probability of getting the item right by guessing
    
    Returns:
    - Probability of a correct response
    """
    # 3-parameter logistic model
    z = discrimination * (ability - difficulty)
    p = guess + (1 - guess) / (1 + np.exp(-z))
    return p

def estimate_ability(responses, difficulties, discriminations=None, guess=0.25, prior_ability=0.0, 
                    prior_weight=1.0, max_iter=25, tolerance=0.001):
    """
    Estimate a user's ability parameter based on their responses using Bayesian EAP.
    
    Parameters:
    - responses: List of 1s (correct) and 0s (incorrect)
    - difficulties: List of question difficulty parameters
    - discriminations: List of question discrimination parameters
    - guess: Guessing parameter
    - prior_ability: Prior estimate of ability
    - prior_weight: Weight to give to the prior
    - max_iter: Maximum iterations for the algorithm
    - tolerance: Convergence tolerance
    
    Returns:
    - Estimated ability
    - Confidence metric (inverse of posterior variance)
    """
    if not responses:
        return prior_ability, 0.0
    
    if discriminations is None:
        discriminations = [1.0] * len(difficulties)
    
    # Initialize with prior
    ability = prior_ability
    
    # Simple estimate based on success rate as a starting point
    success_rate = sum(responses) / len(responses)
    # Map success rate to IRT scale (roughly -3 to +3)
    # 0% -> -3, 50% -> 0, 100% -> +3
    simple_ability = (success_rate - 0.5) * 6
    ability = min(max(simple_ability, -3.0), 3.0)  # Clamp to reasonable range
    
    # Add a safety check to prevent numerical instability
    safe_iterations = 0
    
    # Use Newton-Raphson to find maximum of likelihood
    for _ in range(max_iter):
        safe_iterations += 1
        if safe_iterations > 10:  # Limit iterations for safety
            break
            
        try:
            # Compute probabilities with current estimate
            probs = []
            for diff, disc in zip(difficulties, discriminations):
                # Calculate success probability with safety checks
                z = disc * (ability - diff)
                # Clamp z to prevent exp overflow
                z = min(max(z, -15.0), 15.0)
                p = guess + (1 - guess) / (1 + np.exp(-z))
                # Ensure p is in valid range to prevent division by zero
                p = min(max(p, 0.001), 0.999)
                probs.append(p)
            
            # Compute first derivative (gradient)
            gradient = sum([(r - p) * disc for r, p, disc in zip(responses, probs, discriminations)])
            gradient += prior_weight * (prior_ability - ability)  # Add prior gradient
            
            # Compute second derivative (Hessian)
            hessian = -sum([p * (1 - p) * disc**2 for p, disc in zip(probs, discriminations)])
            hessian -= prior_weight  # Add prior hessian
            
            # Ensure hessian is not too close to zero
            if abs(hessian) < 0.01:
                hessian = -0.01 if hessian < 0 else -0.01
            
            # Newton-Raphson update with step size limitation
            update = gradient / hessian
            # Limit step size to prevent big jumps
            update = min(max(update, -0.5), 0.5)
            
            ability_new = ability + update
            
            # Keep ability in reasonable bounds
            ability_new = min(max(ability_new, -3.0), 3.0)
            
            # Check for convergence
            if abs(ability_new - ability) < tolerance:
                ability = ability_new
                break
            
            ability = ability_new
            
        except Exception as e:
            print(f"Error in ability estimation: {e}")
            # Fallback to simple estimate based on success rate
            return simple_ability, 0.5
    
    # Confidence is inverse of posterior variance
    confidence = min(abs(hessian), 10.0)  # Cap confidence
    
    # Final sanity check
    if not (-3.0 <= ability <= 3.0):
        print(f"WARNING: Ability estimate outside normal range: {ability}")
        ability = min(max(ability, -3.0), 3.0)
    
    return ability, confidence

def estimate_question_difficulty(responses, abilities, discriminations=None, guess=0.25, 
                               prior_difficulty=0.0, prior_weight=1.0, max_iter=25, tolerance=0.001):
    """
    Estimate a question's difficulty parameter based on student responses.
    
    Parameters:
    - responses: List of 1s (correct) and 0s (incorrect)
    - abilities: List of user ability parameters
    - discriminations: List of question discrimination parameters
    - guess: Guessing parameter
    - prior_difficulty: Prior estimate of difficulty
    - prior_weight: Weight to give to the prior
    - max_iter: Maximum iterations
    - tolerance: Convergence tolerance
    
    Returns:
    - Estimated difficulty
    - Confidence metric
    """
    if not responses or not abilities:
        return prior_difficulty, 0.0
    
    if discriminations is None:
        discriminations = [1.0] * len(abilities)
    
    # Initialize with prior
    difficulty = prior_difficulty
    
    # Use Newton-Raphson
    for _ in range(max_iter):
        # Compute probabilities with current estimate
        probs = [calculate_success_probability(ab, difficulty, disc, guess) 
                for ab, disc in zip(abilities, discriminations)]
        
        # For difficulty, gradient is negative of ability gradient
        gradient = -sum([(r - p) * disc for r, p, disc in zip(responses, probs, discriminations)])
        gradient += prior_weight * (prior_difficulty - difficulty)
        
        hessian = -sum([p * (1 - p) * disc**2 for p, disc in zip(probs, discriminations)])
        hessian -= prior_weight
        
        update = gradient / (hessian - 1e-8)
        
        difficulty_new = difficulty + update
        
        if abs(difficulty_new - difficulty) < tolerance:
            difficulty = difficulty_new
            break
        
        difficulty = difficulty_new
    
    confidence = abs(hessian)
    
    return difficulty, confidence

def irt_to_difficulty_level(irt_difficulty):
    """
    Convert IRT difficulty parameter to a 1-5 scale.
    
    ≤ -1.5: Very Easy (1)
    -1.5 to -0.5: Easy (2)
    -0.5 to 0.5: Medium (3)
    0.5 to 1.5: Hard (4)
    ≥ 1.5: Very Hard (5)
    """
    if irt_difficulty <= -1.5:
        return 1
    elif irt_difficulty <= -0.5:
        return 2
    elif irt_difficulty <= 0.5:
        return 3
    elif irt_difficulty <= 1.5:
        return 4
    else:
        return 5

def difficulty_level_to_irt(level):
    """Convert a 1-5 difficulty level to an IRT difficulty parameter."""
    mapping = {
        1: -2.0,  # Very Easy
        2: -1.0,  # Easy
        3: 0.0,   # Medium
        4: 1.0,   # Hard
        5: 2.0    # Very Hard
    }
    return mapping.get(level, 0.0)

# Endpoints
@router.get("/user-ability/{user_id}")
async def get_user_ability(user_id: str):
    """
    Retrieve the ability level of a user, overall and by topic.
    """
    try:
        # Load the user's history of responses
        response = supabase.table("user_progress").select("*").eq("user_id", user_id).execute()
        
        if not response.data:
            return {
                "user_id": user_id,
                "overall_ability": INITIAL_ABILITY,
                "topic_abilities": {},
                "questions_answered": 0
            }
        
        # Process the data
        questions_by_topic = {}
        overall_responses = []
        overall_difficulties = []
        
        for answer in response.data:
            topic = answer.get("topic", "Unknown")
            correct = answer.get("correct", False)
            difficulty_level = answer.get("difficulty_level", 3)
            
            # Convert reported difficulty level to IRT scale
            difficulty = difficulty_level_to_irt(difficulty_level)
            
            # Add to topic-specific data
            if topic not in questions_by_topic:
                questions_by_topic[topic] = {"responses": [], "difficulties": []}
            
            questions_by_topic[topic]["responses"].append(1 if correct else 0)
            questions_by_topic[topic]["difficulties"].append(difficulty)
            
            # Add to overall data
            overall_responses.append(1 if correct else 0)
            overall_difficulties.append(difficulty)
        
        # Calculate overall ability
        overall_ability, overall_confidence = estimate_ability(
            overall_responses, overall_difficulties, prior_ability=INITIAL_ABILITY
        )
        
        # Calculate topic-specific abilities
        topic_abilities = {}
        for topic, data in questions_by_topic.items():
            ability, confidence = estimate_ability(
                data["responses"], data["difficulties"], prior_ability=overall_ability
            )
            
            topic_abilities[topic] = {
                "topic": topic,
                "ability": ability,
                "confidence": confidence,
                "question_count": len(data["responses"]),
                "average_difficulty": sum(data["difficulties"]) / len(data["difficulties"]) if data["difficulties"] else 0,
                "success_rate": sum(data["responses"]) / len(data["responses"]) if data["responses"] else 0
            }
        print(f"DEBUG - User: {user_id}, Overall ability: {overall_ability}, Topic abilities: {topic_abilities}")

        return {
            "user_id": user_id,
            "overall_ability": overall_ability,
            "overall_confidence": overall_confidence,
            "topic_abilities": topic_abilities,
            "questions_answered": len(overall_responses)
        }
        
    except Exception as e:
        print(f"❌ Error calculating user ability: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/recommend-difficulty")
async def recommend_difficulty(
    user_id: str = Query(...),
    topic: str = Query(...),
    challenge_mode: bool = Query(False)
):
    """
    Recommend an appropriate difficulty level for a given user and topic.
    
    Parameters:
    - user_id: User's ID
    - topic: The topic for which to recommend a difficulty
    - challenge_mode: If True, recommend a slightly higher difficulty
    """
    try:
        # Get the user's abilities
        user_ability_response = await get_user_ability(user_id)
        
        # Extract the relevant ability
        topic_ability = 0.0
        if topic in user_ability_response["topic_abilities"]:
            topic_ability = user_ability_response["topic_abilities"][topic]["ability"]
        else:
            # If no data for this topic, use overall ability
            topic_ability = user_ability_response["overall_ability"]
        
        # Add challenge if requested
        if challenge_mode:
            topic_ability += 0.5  # Bump up difficulty slightly
        
        # Convert to a target difficulty
        target_difficulty = topic_ability  # For IRT, target_difficulty = ability for ~50% success
        
        # Convert to 1-5 scale
        difficulty_level = irt_to_difficulty_level(target_difficulty)
        
        return {
            "topic": topic,
            "difficulty_level": difficulty_level,
            "estimated_ability": topic_ability,
            "challenge_mode": challenge_mode
        }
        
    except Exception as e:
        print(f"❌ Error recommending difficulty: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/question-difficulty/{question_id}")
async def get_question_difficulty(question_id: str):
    """
    Get the estimated difficulty level of a specific question.
    """
    try:
        # Get all responses to this question
        response = supabase.table("user_progress").select("*").eq("question_id", question_id).execute()
        
        if not response.data:
            return {
                "question_id": question_id,
                "difficulty": 0.0,  # Neutral difficulty
                "difficulty_level": 3,  # Medium on 1-5 scale
                "response_count": 0,
                "success_rate": 0
            }
        
        # Extract the data
        responses = [1 if answer.get("correct", False) else 0 for answer in response.data]
        
        # Calculate simple statistics
        response_count = len(responses)
        success_rate = sum(responses) / response_count if response_count > 0 else 0
        
        # Estimate difficulty based on success rate
        if success_rate < 0.2:
            difficulty = 1.5  # Very difficult
        elif success_rate < 0.4:
            difficulty = 0.8  # Difficult
        elif success_rate < 0.6:
            difficulty = 0.0  # Medium
        elif success_rate < 0.8:
            difficulty = -0.8  # Easy
        else:
            difficulty = -1.5  # Very easy
        
        # Convert to 1-5 scale
        difficulty_level = irt_to_difficulty_level(difficulty)
        
        return {
            "question_id": question_id,
            "difficulty": difficulty,
            "difficulty_level": difficulty_level,
            "response_count": response_count,
            "success_rate": success_rate
        }
        
    except Exception as e:
        print(f"❌ Error getting question difficulty: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/adaptive-question")
async def get_adaptive_question(
    user_id: str = Query(...),
    topic: str = Query(...),
    challenge_mode: bool = Query(False)
):
    """
    Generate a question with appropriate difficulty level for the user.
    This combines the difficulty recommendation with question generation.
    """
    try:
        # First, get the recommended difficulty
        recommendation = await recommend_difficulty(user_id, topic, challenge_mode)
        
        # The ideal approach would be to select a question with appropriate difficulty
        # from a question bank. Since we're generating questions on-the-fly, we'll
        # adjust the generation prompt to target the recommended difficulty.
        
        # For now, just return the recommendation - this will be extended in the 
        # question generation module
        return {
            "topic": topic,
            "recommended_difficulty": recommendation["difficulty_level"],
            "user_ability": recommendation["estimated_ability"],
            "challenge_mode": challenge_mode
        }
        
    except Exception as e:
        print(f"❌ Error getting adaptive question: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))