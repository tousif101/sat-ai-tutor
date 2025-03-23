import os 
from fastapi import APIRouter, HTTPException
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

@router.post("/register")
async def register(email: str, password: str):
    try:
        user = supabase.auth.sign_up(email=email, password=password)
        return {"message": "User registered successfully", "user": user}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
        
@router.post("/login")
async def login(email: str, password: str):
    try:
        user = supabase.auth.sign_in_with_password(email=email, password=password)
        return {"message": "User logged in successfully", "user": user}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))