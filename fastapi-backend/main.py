from fastapi import FastAPI, Query, HTTPException
from langchain_openai import ChatOpenAI
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.prompts import PromptTemplate
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from supabase import create_client, Client
from datetime import datetime
from langchain.chains import LLMChain
from langchain.memory import ConversationBufferMemory
from langchain.llms import OpenAI
from typing import Optional

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

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
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

# Define the SAT Question Model
class SATQuestion(BaseModel):
    topic: str
    question: str
    choices: dict
    correct_answer: str
    solution: str
    hint: str
    passage: Optional[str] = None  

# Generate SAT Question + Hint Using LangChain
def generate_sat_question(topic: str, difficulty_level: int = 3) -> dict:
    llm = ChatOpenAI(model_name="gpt-4o", openai_api_key=OPENAI_API_KEY)
    parser = JsonOutputParser(pydantic_object=SATQuestion)

    # Updated prompt to include difficulty level
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
            template="Generate a {difficulty} SAT Reading Comprehension question with the following format:\n"
                     "1. First, create a passage (about 200-300 words) on a topic suitable for SAT.\n"
                     "2. Then, create a question about the passage.\n"
                     "3. Provide four answer choices (A, B, C, D).\n"
                     "4. Include a hint before revealing the correct answer.\n"
                     "5. Explain why the correct answer is correct.\n\n"
                     "The question should be labeled as 'question' and should ONLY ask about the passage you generated.\n"
                     "The passage should be labeled as 'passage' in your JSON output.\n"
                     "{format_instructions}",
            input_variables=["difficulty"],
            partial_variables={"format_instructions": parser.get_format_instructions()},
        )
    else:
        prompt = PromptTemplate(
            template="Generate a {difficulty} multiple-choice SAT question about {topic}. "
                     "Provide four answer choices (A, B, C, D). Include a hint before revealing the correct answer. "
                     "{format_instructions}",
            input_variables=["topic", "difficulty"],
            partial_variables={"format_instructions": parser.get_format_instructions()},
        )

    # Invoke LLM with appropriate parameters
    if topic == "Reading Comprehension":
        response_dict = (prompt | llm | parser).invoke({"difficulty": difficulty_desc})
    else:
        response_dict = (prompt | llm | parser).invoke({
            "topic": topic, 
            "difficulty": difficulty_desc
        })

    # Convert to Pydantic model
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

        # Create a dict from the model, manually handling the timestamp
        answer_dict = answer.dict(exclude={"timestamp"})
        
        # Add the current timestamp in ISO format
        answer_dict["timestamp"] = datetime.utcnow().isoformat()

        response = supabase.table("user_progress").insert(answer_dict).execute()

        if response.data and isinstance(response.data, dict) and "error" in response.data:
            raise HTTPException(status_code=500, detail=response.data["error"])

        return {"message": "Answer recorded successfully!"}

    except Exception as e:
        print("❌ Error submitting answer:", str(e))
        raise HTTPException(status_code=400, detail=str(e))

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