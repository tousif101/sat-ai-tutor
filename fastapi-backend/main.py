from fastapi import FastAPI, Query, HTTPException
from langchain_openai import ChatOpenAI
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.prompts import PromptTemplate
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv
from pydantic import BaseModel, Field, validator
from supabase import create_client, Client
from datetime import datetime
from langchain.chains import LLMChain
from langchain.memory import ConversationBufferMemory
from langchain.llms import OpenAI
from typing import Optional, Dict
from leaderboard import router as leaderboard_router
from fastapi import BackgroundTasks



# Import our modules
from performance_tracking import router as performance_router, EnhancedUserAnswer
from adaptive_difficulty import router as adaptive_router
# Import the functions directly from adaptive_difficulty
from adaptive_difficulty import recommend_difficulty, get_user_ability

# Load API Keys & Supabase Credentials
load_dotenv()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SERVICE_KEY   = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
print("SERVICE_KEY prefix:", SERVICE_KEY[:15] if SERVICE_KEY else "None")

supabase: Client = create_client(SUPABASE_URL, SERVICE_KEY)
service_supabase = supabase                                   # reuse it

app = FastAPI()

# CORS for Next.js
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
ALLOWED_TOPICS = {"Algebra", "Geometry", "Grammar", "Reading Comprehension", "Trigonometry"}

# Include the routers
app.include_router(performance_router, tags=["Performance Tracking"])
app.include_router(adaptive_router, tags=["Adaptive Difficulty"])
app.include_router(leaderboard_router, tags=["Leaderboard"])

# Define the SAT Question Model with enhanced validation
class SATQuestion(BaseModel):
    topic: str
    question: str
    choices: Dict[str, str]
    correct_answer: str
    solution: str
    hint: str
    passage: Optional[str] = None
    
    # Add validation for choices and correct_answer
    @validator('choices')
    def validate_choices(cls, v):
        # Ensure choices contains exactly keys A, B, C, D
        required_keys = {'A', 'B', 'C', 'D'}
        if set(v.keys()) != required_keys:
            raise ValueError(f"Choices must contain exactly keys {required_keys}")
        
        # Ensure choice values are not empty
        for key, value in v.items():
            if not value.strip():
                raise ValueError(f"Choice {key} cannot be empty")
        
        return v
    
    @validator('correct_answer')
    def validate_correct_answer(cls, v, values):
        # Ensure correct_answer is one of the choices
        if 'choices' in values and v not in values['choices']:
            raise ValueError(f"Correct answer '{v}' must be one of the choices keys")
        return v
    
    @validator('solution')
    def validate_solution_consistency(cls, solution, values):
        """Validate that the solution is consistent with the correct answer."""
        if 'choices' not in values or 'correct_answer' not in values:
            return solution
            
        correct_answer = values['correct_answer']
        correct_choice = values['choices'].get(correct_answer, '')
        
        # Basic consistency check - the correct answer value should appear in the solution
        # This is a heuristic and might need refinement
        if correct_choice:
            # Extract just the number from the choice (assuming it's a number)
            import re
            match = re.search(r'\b(\d+)\b', correct_choice)
            if match:
                number = match.group(1)
                # Check if this number appears in the conclusion of the solution
                if number not in solution.split('=')[-1]:
                    raise ValueError(f"Solution appears inconsistent with correct answer '{correct_answer}': {correct_choice}")
        
        return solution

@app.get("/test-db-permissions")
async def test_db_permissions():
    try:
        # Try different operations
        table_list = []
        for table in ["user_progress", "users", "auth.users"]:
            try:
                result = supabase.table(table).select("*").limit(1).execute()
                table_list.append({"table": table, "status": "success", "data": result.data})
            except Exception as e:
                table_list.append({"table": table, "status": "error", "error": str(e)})
        
        return {"results": table_list}
    except Exception as e:
        return {"error": str(e)}
    
# Generate SAT Question + Hint Using LangChain with retry mechanism
def generate_sat_question(topic: str, difficulty_level: int = 3, max_retries: int = 3) -> dict:
    llm = ChatOpenAI(model_name="gpt-4o", openai_api_key=OPENAI_API_KEY, temperature=0.7)
    parser = JsonOutputParser(pydantic_object=SATQuestion)

    # Updated prompt to include difficulty level and clearer instructions for choices
    difficulty_descriptions = {
        1: "very easy (suitable for beginners)",
        2: "somewhat easy (for review)",
        3: "medium difficulty (standard SAT level)",
        4: "challenging (for advanced students)",
        5: "very challenging (for high-performers)"
    }
    
    difficulty_desc = difficulty_descriptions.get(difficulty_level, "medium difficulty (standard SAT level)")
    
    # Create different templates based on topic
    if topic == "Reading Comprehension":
        prompt = PromptTemplate(
            template="""Generate a {difficulty} SAT Reading Comprehension question with the following format:

1. First, create a passage (about 200-300 words) on a topic suitable for SAT.
2. Then, create a question about the passage.
3. Provide exactly four answer choices labeled A, B, C, and D (use these exact keys).
4. Your correct_answer field must contain only one of these letters: A, B, C, or D.
5. Include a hint before revealing the correct answer.
6. Explain why the correct answer is correct and why the others are incorrect.

The question should be labeled as 'question' and should ONLY ask about the passage you generated.
The passage should be labeled as 'passage' in your JSON output.

IMPORTANT: Ensure that:
- The choices field contains exactly four key-value pairs with keys 'A', 'B', 'C', and 'D'
- The correct_answer field contains only one of these letters: 'A', 'B', 'C', or 'D'
- Each answer choice should be distinct and substantial

{format_instructions}""",
            input_variables=["difficulty"],
            partial_variables={"format_instructions": parser.get_format_instructions()},
        )
    else:
        prompt = PromptTemplate(
            template="""Generate a {difficulty} multiple-choice SAT question about {topic}.

REQUIREMENTS:
1. Provide exactly four answer choices labeled A, B, C, D (use these exact keys).
2. The 'choices' field in your JSON must be a dictionary with exactly these four keys: 'A', 'B', 'C', 'D'.
3. Your correct_answer field must contain only one of these letters: A, B, C, or D.
4. Include a hint that guides the student without giving away the answer.
5. Provide a detailed solution that explains why the correct answer is correct.
6. Make the question realistic for SAT and age-appropriate.

IMPORTANT: Ensure that:
- The choices field contains exactly four key-value pairs with keys 'A', 'B', 'C', and 'D'
- The correct_answer field contains only one of these letters: 'A', 'B', 'C', or 'D'
- Each answer choice should be distinct and substantial

{format_instructions}""",
            input_variables=["topic", "difficulty"],
            partial_variables={"format_instructions": parser.get_format_instructions()},
        )

    # Implement retry logic
    for attempt in range(max_retries):
        try:
            # Invoke LLM with appropriate parameters
            if topic == "Reading Comprehension":
                response_dict = (prompt | llm | parser).invoke({"difficulty": difficulty_desc})
            else:
                response_dict = (prompt | llm | parser).invoke({
                    "topic": topic, 
                    "difficulty": difficulty_desc
                })

            # Convert to Pydantic model - this will run the validators
            question_obj = SATQuestion(**response_dict)
            question_data = question_obj.dict()

            # Add metadata about the difficulty level
            question_data["difficulty_level"] = difficulty_level
            
            result = supabase.table("questions").insert(question_data).execute()

            if not result.data:
                raise HTTPException(status_code=500, detail="Failed to insert question into database.")

            inserted_id = result.data[0]["id"]  # Ensure Supabase returns the ID

            question_data["question_id"] = inserted_id
            return question_data
            
        except (ValueError, HTTPException) as e:
            if attempt == max_retries - 1:  # Last attempt
                print(f"Failed to generate valid question after {max_retries} attempts: {str(e)}")
                raise HTTPException(
                    status_code=500, 
                    detail=f"Failed to generate a valid question: {str(e)}"
                )
            print(f"Attempt {attempt+1} failed: {str(e)}. Retrying...")

@app.get("/generate-question")
async def generate_question(
    topic: str = Query(..., title="SAT Topic"),
    difficulty_level: int = Query(3, ge=1, le=5, title="Difficulty Level"),
    user_id: str = Query(None, title="User ID for Adaptive Difficulty")
):
    if topic not in ALLOWED_TOPICS:
        raise HTTPException(status_code=400, detail="Invalid topic. Choose an SAT-relevant subject.")
    
    # If user_id is provided, use adaptive difficulty
    if user_id:
        try:
            # Get recommended difficulty for this user and topic
            recommendation = await recommend_difficulty(
                user_id=user_id,
                topic=topic,
                challenge_mode=False
            )
            difficulty_level = recommendation["difficulty_level"]
            print(f"Using adaptive difficulty level {difficulty_level} for user {user_id}")
        except Exception as e:
            print(f"Error getting adaptive difficulty: {str(e)}")
            # Fall back to default difficulty
            pass
    
    return generate_sat_question(topic, difficulty_level)

@app.get("/generate-adaptive-question")
async def generate_adaptive_question(
    user_id: str = Query(..., title="User ID"),
    topic: str = Query(..., title="SAT Topic"),
    challenge_mode: bool = Query(False, title="Challenge Mode")
):
    """
    Generate a question with difficulty adapted to the user's ability level.
    """
    if topic not in ALLOWED_TOPICS:
        raise HTTPException(status_code=400, detail="Invalid topic. Choose an SAT-relevant subject.")
    
    try:
        # Get recommended difficulty for this user and topic
        # Call the function directly instead of through the router
        recommendation = await recommend_difficulty(
            user_id=user_id,
            topic=topic,
            challenge_mode=challenge_mode
        )
        
        # Generate a question with the recommended difficulty
        question_data = generate_sat_question(topic, recommendation["difficulty_level"])
        
        # Add adaptive info to the response
        question_data["adaptive_info"] = {
            "user_ability": recommendation["estimated_ability"],
            "recommended_difficulty": recommendation["difficulty_level"],
            "challenge_mode": challenge_mode
        }
        
        return question_data
        
    except Exception as e:
        print(f"Error generating adaptive question: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate adaptive question: {str(e)}")

@app.get("/generate-hint")
async def generate_hint(topic: str = Query(..., title="SAT Topic"), question: str = Query(..., title="SAT Question")):
    llm = ChatOpenAI(model_name="gpt-3.5-turbo", openai_api_key=OPENAI_API_KEY)

    hint_prompt = PromptTemplate(
        template="Provide a helpful hint for solving this SAT question: {question}. "
                 "Do not give away the answer, just a guiding clue.",
        input_variables=["question"],
    )

    response = hint_prompt | llm
    hint_response = response.invoke({"question": question})

    if isinstance(hint_response, dict) and "content" in hint_response:
        hint_text = hint_response["content"]
    elif hasattr(hint_response, "content"):
        hint_text = hint_response.content
    else:
        hint_text = str(hint_response)  # Fallback in case of unexpected structure

    return {"hint": hint_text}

@app.post("/submit-answer")
async def submit_answer(answer: EnhancedUserAnswer):
    try:
        print("📌 Received Answer Submission:", answer.dict())

        answer_dict = answer.dict(exclude={"timestamp"})
        answer_dict["timestamp"] = datetime.utcnow().isoformat()

        response = service_supabase.table("user_progress").insert(answer_dict).execute()

        # Check for database errors
        if response.data and isinstance(response.data, dict) and "error" in response.data:
            raise HTTPException(status_code=500, detail=response.data["error"])

        background_tasks = BackgroundTasks()
        background_tasks.add_task(update_leaderboard_entry, answer.user_id)
        
        # Success! Now update leaderboard directly here rather than relying on a database trigger
        return {"message": "Answer recorded successfully!"}

    except Exception as e:
        print("Error submitting answer:", str(e))
        raise HTTPException(status_code=400, detail=str(e))
    

async def update_leaderboard_entry(user_id):
    try:
        # Same implementation as before, but with extra error handling
        progress_response = service_supabase.table("user_progress") \
            .select("user_id,correct,difficulty_level") \
            .eq("user_id", user_id) \
            .execute()
        
        # Process data to calculate stats
        total_questions = len(progress_response.data)
        correct_answers = sum(1 for record in progress_response.data if record.get("correct", False))
        difficulty_sum = sum(record.get("difficulty_level", 1) for record in progress_response.data)
        points = sum(record.get("difficulty_level", 1) * 10 for record in progress_response.data if record.get("correct", False))
        
        # Calculate derived stats
        accuracy = (correct_answers / total_questions * 100) if total_questions > 0 else 0
        avg_difficulty = difficulty_sum / total_questions if total_questions > 0 else 0
        
        # Get existing email if possible
        email_query = service_supabase.table("leaderboards").select("email").eq("user_id", user_id).execute()
        email = email_query.data[0]["email"] if email_query.data else "Anonymous"
        
        # Update leaderboard
        service_supabase.table("leaderboards").upsert({
            "user_id": user_id,
            "email": email,
            "total_questions": total_questions,
            "correct_answers": correct_answers,
            "accuracy": accuracy,
            "avg_difficulty": avg_difficulty,
            "total_points": points,
            "updated_at": datetime.utcnow().isoformat()
        }).execute()
        
        print(f"Successfully updated leaderboard for user {user_id}")
    except Exception as e:
        print(f"Error updating leaderboard for user {user_id}: {str(e)}")
        # Log the error but don't propagate it
# @app.post("/submit-answer")
# async def submit_answer(answer: EnhancedUserAnswer):
#     try:

#         print(f"Authenticated User ID: {answer.user_id}")
        
#         # Additional validation
#         if not answer.user_id:
#             raise HTTPException(status_code=400, detail="Invalid user ID")

#         print("📌 Received Answer Submission:", answer.dict())

#         # Create a dict from the model, manually handling the timestamp
#         answer_dict = answer.dict(exclude={"timestamp"})
        
#         # Add the current timestamp in ISO format
#         answer_dict["timestamp"] = datetime.utcnow().isoformat()

#         response = supabase.table("user_progress").insert(answer_dict).execute()

#         if response.data and isinstance(response.data, dict) and "error" in response.data:
#             raise HTTPException(status_code=500, detail=response.data["error"])

#         return {"message": "Answer recorded successfully!"}

#     except Exception as e:
#         print("❌ Error submitting answer:", str(e))
#         raise HTTPException(status_code=400, detail=str(e))

class TutorChatRequest(BaseModel):
    user_id: str
    message: str
    question_id: str

llm = OpenAI(temperature=0.7)

# Memory store per user
memory_dict = {}

# Define a tutoring prompt template
prompt = PromptTemplate(
    input_variables=["history", "question_text", "question_choices", "question"],
    template="""
    You are an SAT tutor. Help the student understand the given SAT question and their approach.
    
    SAT Question:
    {question_text}
    
    Choices:
    {question_choices}
    
    Previous Conversation:
    {history}
    
    Student's Question:
    {question}
    
    Response:
    """
)

# LangChain LLM Chain
llm_chain = LLMChain(llm=llm, prompt=prompt)

def fetch_question_details(question_id: str):
    """
    Fetch the full question details from Supabase using question_id.
    """
    try:
        response = supabase.table("questions").select("*").eq("id", question_id).single().execute()
        if response.data:
            return {
                "question_text": response.data["question"],
                "question_choices": response.data["choices"]
            }
        else:
            return None
    except Exception as e:
        print(f"Error fetching question details: {e}")
        return None

@app.post("/tutor-chat")
async def tutor_chat(request: TutorChatRequest):
    """
    Uses LangChain Memory to generate an AI response, stores chat in Supabase, and links to the generated SAT question.
    """
    try:
        # Fetch question details
        question_data = fetch_question_details(request.question_id)
        if not question_data:
            raise HTTPException(status_code=404, detail="Question not found")

        # Retrieve conversation memory (or initialize if missing)
        if request.user_id not in memory_dict:
            memory_dict[request.user_id] = ConversationBufferMemory()
        
        memory = memory_dict[request.user_id]
        history = memory.load_memory_variables({}).get("history", "")

        # Generate AI response with full question context
        ai_response = llm_chain.run({
            "history": history,
            "question_text": question_data["question_text"],
            "question_choices": question_data["question_choices"],
            "question": request.message
        })

        # Update memory with latest conversation
        memory.save_context({"input": request.message}, {"output": ai_response})

        # Store chat with question_id reference
        chat_data = {
            "user_id": request.user_id,
            "question_id": request.question_id,
            "user_message": request.message,
            "tutor_response": ai_response
        }

        result = supabase.table("tutor_chat").insert(chat_data).execute()
        
        if result.data:
            return {"user_message": request.message, "tutor_response": ai_response}
        else:
            raise HTTPException(status_code=500, detail="Failed to store chat in database")

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/user-chat")
async def get_user_chat(user_id: str = Query(...)):
    """
    Fetch chat history for a user from Supabase.
    """
    try:
        response = supabase.table("tutor_chat").select("*").eq("user_id", user_id).execute()
        return response.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    