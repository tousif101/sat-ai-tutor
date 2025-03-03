from fastapi import FastAPI, Query
from langchain_openai import ChatOpenAI
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.prompts import PromptTemplate
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv
from pydantic import BaseModel, Field

# Load API Key from .env file
load_dotenv()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

app = FastAPI()

# CORS (Allows Next.js to call FastAPI)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Change this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Define Pydantic model for structured JSON output
class SATQuestion(BaseModel):
    question: str = Field(description="The SAT multiple-choice question")
    choices: dict = Field(description="The answer choices A, B, C, D")
    correct_answer: str = Field(description="The correct answer (A, B, C, or D)")
    solution: str = Field(description="Step-by-step solution")

# LangChain Model - Generate SAT Question in JSON format
def generate_sat_question(topic: str):
    llm = ChatOpenAI(model_name="gpt-4o", openai_api_key=OPENAI_API_KEY)

    # Use LangChain's JsonOutputParser
    parser = JsonOutputParser(pydantic_object=SATQuestion)

    # Prompt Template with JSON Schema Instructions
    prompt = PromptTemplate(
        template="Answer the user's query in JSON format.\n{format_instructions}\nUser query: Generate a multiple-choice SAT question about {topic}.",
        input_variables=["topic"],
        partial_variables={"format_instructions": parser.get_format_instructions()},
    )

    # Invoke the LLM with the structured output parser
    response = (prompt | llm | parser).invoke({"topic": topic})
    return response

@app.get("/generate-question")
async def generate_question(topic: str = Query(..., title="SAT Topic")):
    question = generate_sat_question(topic)
    return question  # Returns structured JSON
