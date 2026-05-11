import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(request: Request) {
  const body = await request.json();
  const { name, email, password } = body;
  const username = String(name || email?.split("@")[0] || "").trim();
  const userEmail = String(email || "").trim();

  if (!userEmail || !username || !password) {
    return NextResponse.json(
      { error: "Nom, email et mot de passe requis" },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: userEmail }, { name: username }] },
  });
  if (existing) {
    const field = existing.email === userEmail ? "email" : "nom d'utilisateur";

    return NextResponse.json(
      { error: `Cet ${field} est déjà utilisé` },
      { status: 409 }
    );
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      name: username,
      email: userEmail,
      password: hashedPassword,
    },
  });

  return NextResponse.json(
    { id: user.id, email: user.email, name: user.name },
    { status: 201 }
  );
}
