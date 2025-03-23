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


# Define the SAT Question Model
class SATQuestion(BaseModel):
    topic: str
    question: str
    choices: dict
    correct_answer: str
    solution: str
    hint: str

# Generate SAT Question + Hint Using LangChain
def generate_sat_question(topic: str) -> dict:
    llm = ChatOpenAI(model_name="gpt-4o", openai_api_key=OPENAI_API_KEY)
    parser = JsonOutputParser(pydantic_object=SATQuestion)

    prompt = PromptTemplate(
        template="Generate a multiple-choice SAT question about {topic}. "
                  "Provide four answer choices (A, B, C, D). Include a hint before revealing the correct answer."
                  "{format_instructions}",
        input_variables=["topic"],
        partial_variables={"format_instructions": parser.get_format_instructions()},
    )

    # Invoke LLM
    response_dict = (prompt | llm | parser).invoke({"topic": topic})

    # Convert to Pydantic model
    question_obj = SATQuestion(**response_dict)
    question_data = question_obj.dict()

    result = supabase.table("questions").insert(question_data).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to insert question into database.")

    inserted_id = result.data[0]["id"]  # Ensure Supabase returns the ID

    question_data["question_id"] = inserted_id
    return question_data



@app.get("/generate-question")
async def generate_question(topic: str = Query(..., title="SAT Topic")):
    if topic not in ALLOWED_TOPICS:
        raise HTTPException(status_code=400, detail="Invalid topic. Choose an SAT-relevant subject.")
    
    return generate_sat_question(topic)


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

class UserAnswer(BaseModel):
    user_id: str
    topic: str
    question_id: str
    user_answer: str
    correct: bool
    confidence: int = Field(..., ge=1, le=5)

@app.post("/submit-answer")
async def submit_answer(answer: UserAnswer):
    try:
        print("📌 Received Answer Submission:", answer.dict())  # ✅ Debugging

        response = supabase.table("user_progress").insert(answer.dict()).execute()

        if response.data and isinstance(response.data, dict) and "error" in response.data:
            raise HTTPException(status_code=500, detail=response.data["error"])

        return {"message": "Answer recorded successfully!"}

    except Exception as e:
        print("❌ Error submitting answer:", str(e))  # ✅ Log error
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



# @app.post("/tutor-chat")
# async def tutor_chat(request: TutorChatRequest):
#     """
#     Receives user message, generates AI response, stores in Supabase, and returns chat history.
#     """

#     # Simulate AI Response (Replace with actual AI logic)
#     ai_response = f"Here's an explanation for: {request.message}"

#     # Store chat in Supabase
#     chat_data = {
#         "user_id": request.user_id,
#         "user_message": request.message,
#         "tutor_response": ai_response
#     }

#     try:
#         result = supabase.table("tutor_chat").insert(chat_data).execute()
#         if result.data:
#             return {"user_message": request.message, "tutor_response": ai_response}
#         else:
#             raise HTTPException(status_code=500, detail="Failed to store chat in database")
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))

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
