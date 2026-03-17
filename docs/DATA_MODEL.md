# MedCare MongoDB collections

Use the same database (e.g. `medcare`) and Atlas connection string as in `.env.local`.

## Collections

### `users`
Already used for login. Optional fields for doctors: `name`, `email`, `specialization` (e.g. `"OPD"`, `"Critical emergencies"`).

### `sessions`
Used by auth. Documents: `{ _id: string, userId: string, role: string, expiresAt: Date }`. Created automatically on login.

### `tickets`
Created by patients via “Create Ticket”. **New tickets** get these fields; **existing tickets** may lack some (defaults applied in API).

- `userId` (string) – patient identifier (from getUserId / localStorage)
- `symptoms` (array of strings)
- `diagnosis`, `patientName`, `patientAge`, `patientGender`, `email`, `phone`, `address`, `city`, `state`, `zip`, `country`, `patientId`
- `severity` (string: `"low"` | `"medium"` | `"high"` | `"critical"`) – default `"medium"`
- `status` (string: `"open"` | `"awaiting_patient"` | `"awaiting_docs"` | `"closed"`) – default `"open"`
- `messages` (array of `{ from: "doctor"|"patient", text: string, createdAt: Date }`)
- `docRequests` (array of `{ type: string, requestedAt: Date, fulfilledAt?: Date, summary?: string }`)
- `assignedDoctorId` (string | null) – MongoDB user id of assigned doctor
- `nextSteps` (string, optional)
- `closedAt` (Date | null)
- `appointment` (optional) – `{ scheduledAt: Date, type: string, doctorId: string }`
- `createdAt` (Date)

No manual documents needed; create tickets from the app. Existing tickets without `severity` are treated as `"medium"` in the doctor dashboard.

### `notifications`
Created by the API when a doctor replies, requests a document, or schedules an appointment.

- `userId` (string) – patient identifier (same as ticket’s `userId`)
- `ticketId` (string)
- `type` (string): `"doctor_message"` | `"doc_request"` | `"appointment_scheduled"`
- `title`, `body` (optional)
- `read` (boolean), `createdAt` (Date)

Collection is created on first insert. No seed data required.

### `appointments`
Created when a doctor chooses “Schedule appointment & close”.

- `ticketId`, `userId` (patient), `doctorId`
- `scheduledAt`, `type` (e.g. `"physical"`), `status`, `createdAt`

No manual documents needed.

## Optional: add severity to existing tickets

If you have tickets created before this change and want them to have a severity in the DB:

```js
// In MongoDB shell or Compass
db.tickets.updateMany(
  { severity: { $exists: false } },
  { $set: { severity: "medium", status: "open" } }
);
```
