# Animal Husbandry UI (VetAI)

A Next.js web app for livestock care and veterinary support. Users chat with an AI assistant, create consultation tickets, and manage a knowledge base. Admins triage and assign tickets to vets; vets handle assigned tickets (replies, document requests, medicine recommendations, appointments).

## Roles

- **User** – Chat with the AI assistant, create tickets (consultations), add PDFs and URLs to the knowledge base, view vet actions on their tickets.
- **Admin** – Dashboard to view all tickets, assign tickets to vets by workload, close tickets, and view ticket details.
- **Vet / Doctor** – Dashboard to view assigned tickets, reply to patients, request documents, recommend medicine, schedule appointments, and use AI suggestions for replies and recommendations.

## Tech stack

- **Next.js** (App Router), **React 19**, **TypeScript**
- **MongoDB** – tickets, users, sessions, notifications
- **OpenAI** – AI chat and vet suggestion flows
- **Tailwind CSS**, **Radix UI**, **Recharts**

## Setup

1. Clone the repository:

```bash
git clone https://github.com/Madhvan-Sharma/animal-husbandry-ui.git
cd animal-husbandry-ui
```

2. Install dependencies:

```bash
pnpm install
```

3. Copy environment variables and configure:

```bash
cp .env.example .env.local
# Edit .env.local: MongoDB, OpenAI, API URLs, etc.
```

4. Run the app:

```bash
pnpm dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

## Environment variables

See `.env.example` for the full list. Main options:

- `MONGODB_URI` – MongoDB connection string
- `OPENAI_API_KEY` – For AI chat and vet suggestions
- `NEXT_PUBLIC_API_URL` – Backend / workflow API URL (if used)
- Auth and email-related vars for login and notifications

## Scripts

| Command       | Description              |
|---------------|--------------------------|
| `pnpm dev`    | Start dev server         |
| `pnpm build`  | Production build         |
| `pnpm start`  | Start production server  |
| `pnpm lint`   | Run ESLint               |

## Repository

[https://github.com/Madhvan-Sharma/animal-husbandry-ui](https://github.com/Madhvan-Sharma/animal-husbandry-ui)
