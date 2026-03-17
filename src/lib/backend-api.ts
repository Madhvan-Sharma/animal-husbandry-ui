export function getBackendApiBase(): string {
  return (
    process.env.NEXT_PUBLIC_ANIMAL_HUSBANDRY_API_URL ??
    process.env.ANIMAL_HUSBANDRY_API_URL ??
    process.env.NEXT_PUBLIC_WORKFLOW_API_URL ??
    process.env.WORKFLOW_API_URL ??
    "http://localhost:8000"
  ).replace(/\/$/, "");
}

