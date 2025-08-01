##  Backend Setup (FastAPI)

###  Requirements

- Python 3.9+
- pip

###  Installation Steps

```bash
# Create a virtual environment
python -m venv venv

# Activate the virtual environment (Windows CMD)
venv\Scripts\activate

# Or with PowerShell
.venv\Scripts\Activate.ps1

# Install FastAPI and dependencies
pip install fastapi uvicorn
pip install fastapi[all]
pip install openai==0.28
pip install python-dotenv

# Save installed packages
pip freeze > requirements.txt
```

###  Environment Configuration

Create a `.env` file in the `backend/` folder:

```env
OPENAI_API_KEY=your_openai_api_key_here
```

###  Running the API Server

```bash
uvicorn app.main:app --reload --port 8000
```

API will be accessible at: `http://localhost:8000`

---

##  Frontend Setup (Next.js)

###  Requirements

- Node.js 18+
- npm or yarn

###  Installation

```bash
cd frontend
npm install
```

###  Running the Development Server

```bash
npm run dev
```

Frontend will be accessible at: [http://localhost:3000](http://localhost:3000)
