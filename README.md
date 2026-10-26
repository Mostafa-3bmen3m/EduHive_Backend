# EduHive Backend

EduHive is a study assistant for students. You upload a PDF or paste a YouTube link, and it breaks the material into short sections, explains each one, and gives you multiple-choice questions to test yourself. It can also build a day-by-day study schedule around the free time you have.

This repository is the backend (REST API). The web app that uses it is in [EduHive_Frontend](https://github.com/Mostafa-3bmen3m/EduHive_Frontend).

## What it does

- **Accounts:** register and log in. Passwords are hashed, and every other route needs a login token.
- **Documents:** upload a PDF or text file. The API reads the text and asks an AI model to split it into lessons, each with an explanation and a short quiz.
- **YouTube videos:** send a video link. The API gets the video's captions and asks the AI to split it into timestamped sections, each with an explanation and a quiz.
- **Study goals:** give a goal, its tasks, a start and end date, how many hours per day you can study, and the times you are busy. The API returns a full schedule with study sessions and breaks that avoids your busy times.
- **Daily plans:** send a list of tasks for one day and get a time-blocked plan back.
- **Dashboard:** counts of a user's uploaded files and saved plans.

## How it works

**Documents.** `POST /api/resources/upload` saves the file with multer, pulls the text out (`pdf-parse` for PDFs, plain read for text files), and sends the first 15,000 characters to the AI. The AI replies with JSON: a title, a summary, and 2 to 8 sections. Each section has an explanation and 2 to 4 questions with four options. The reply is checked with Zod before anything is saved, so a badly formed AI answer never reaches the database. The file and its sections are then stored with Prisma.

**Videos.** `POST /api/videos/process` gets the transcript with its timestamps using the `@playzone/youtube-transcript` tool, then sends it to the AI along with the video length. The AI returns sections with `MM:SS` start and end times. If the first reply is not valid JSON, the API tries once more before giving up. Videos need captions to work.

**Goals and schedules.** `POST /api/goals` builds a detailed prompt from the goal, tasks, dates, hours per day and busy times, and asks the AI for a schedule with sessions, breaks and a short tip for each day. The schedule is saved with the goal. `GET /api/goals/today` looks through the user's active goals and returns today's sessions.

**Safety.** Requests are rate limited per IP: 100 requests every 15 minutes for the API, and 10 login attempts per hour. Every goal, file and plan is looked up by the logged-in user's id, so users can only see their own data.

## Tech stack

- Node.js, Express, TypeScript
- PostgreSQL with Prisma (using the `pg` adapter)
- JWT login tokens (valid for 7 days) and `bcryptjs` for passwords
- Zod for validating requests and AI responses
- Multer and `pdf-parse` for file uploads
- AI model: `google/gemini-3-flash-preview`, called through the Hack Club AI proxy

## API

All routes start with `/api`. Everything except register, login and the health check needs the header `Authorization: Bearer <token>`.

| Method | Route | What it does |
| --- | --- | --- |
| GET | `/health` | Check that the server is running |
| POST | `/api/auth/register` | Create an account (`email`, `password`, optional `name`) |
| POST | `/api/auth/login` | Log in and get a token |
| POST | `/api/resources/upload` | Upload a PDF or text file (form field `file`) and get sections with quizzes |
| GET | `/api/resources` | List the user's uploaded documents with their sections |
| POST | `/api/videos/process` | Process a YouTube link (`url`) into timestamped sections with quizzes |
| GET | `/api/videos` | List the user's processed videos with their sections |
| POST | `/api/goals` | Create a goal and generate its study schedule |
| GET | `/api/goals` | List all goals |
| GET | `/api/goals/today` | Today's study sessions across active goals |
| GET | `/api/goals/:id` | Get one goal |
| PATCH | `/api/goals/:id/status` | Set status to `ACTIVE`, `COMPLETED`, `PAUSED` or `CANCELLED` |
| DELETE | `/api/goals/:id` | Delete a goal |
| POST | `/api/plans` | Generate a plan for one day (`date`, `tasks`, optional `goals`) |
| GET | `/api/plans` | List saved plans |
| GET | `/api/dashboard/stats` | Counts of files and plans |

## Project structure

```
src/
  server.ts          app setup, middleware and routes
  routes/            one file per feature
  controllers/       request handling for each route
  services/
    aiService.ts             calls the AI model
    fileProcessingService.ts reads text out of PDFs and text files
    videoService.ts          gets and formats YouTube transcripts
  middlewares/       login check, rate limits, error handler
  utils/             Prisma client, token and password helpers
```

## Running it locally

You need Node.js 20 or newer and a PostgreSQL database.

```bash
git clone https://github.com/Mostafa-3bmen3m/EduHive_Backend.git
cd EduHive_Backend
npm install
```

Create a `.env` file in the project folder:

```
DATABASE_URL=postgresql://user:password@localhost:5432/eduhive
JWT_SECRET=choose-a-long-random-string
API_KEY=your-key-for-the-ai-proxy
PORT=8080
```

Then set up the database tables and start the server:

```bash
npx prisma migrate dev
npm run dev
```

The server runs on `http://localhost:8080`, and `http://localhost:8080/health` should answer with `{"status":"ok"}`. `npm start` runs it once without auto-reload.

## Notes

I built EduHive on my own as a high school project. It was chosen as one of the best projects at my school that year.
