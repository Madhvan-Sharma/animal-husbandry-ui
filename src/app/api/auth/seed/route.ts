import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { hashPassword } from "@/lib/auth";

/** One-time seed: creates default users if collection is empty. */
export async function POST() {
  try {
    const db = await getDb();
    const col = db.collection("users");
    const existing = await col.countDocuments();
    if (existing > 0) {
      return NextResponse.json({
        message: "Users already exist. Skipping seed.",
        count: existing,
      });
    }

    const users = [
      {
        username: "user",
        passwordHash: hashPassword("user123"),
        role: "user",
        name: "Livestock User",
        email: "user@example.com",
        createdAt: new Date(),
      },
      {
        username: "vet",
        passwordHash: hashPassword("vet123"),
        role: "vet",
        name: "Dr. Vet",
        email: "vet@example.com",
        specialization: "Livestock Health",
        createdAt: new Date(),
      },
      {
        username: "admin",
        passwordHash: hashPassword("admin123"),
        role: "admin",
        name: "Admin User",
        email: "admin@example.com",
        createdAt: new Date(),
      },
    ];

    await col.insertMany(users);
    return NextResponse.json({
      message: "Seeded 3 users: user / user123, vet / vet123, admin / admin123",
      count: users.length,
    });
  } catch (e) {
    console.error("POST /api/auth/seed:", e);
    return NextResponse.json(
      { error: "Seed failed" },
      { status: 500 }
    );
  }
}
