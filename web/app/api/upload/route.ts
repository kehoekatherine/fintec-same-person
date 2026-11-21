import { connection } from "next/server";
import { NextResponse } from "next/server";

import { DeskError } from "@/lib/errors";
import { acceptUpload } from "@/lib/upload";

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "The file could not be added.";
  const detail = error instanceof DeskError ? error.detail : undefined;
  const status = error instanceof DeskError ? error.status : 500;
  return NextResponse.json({ error: message, detail }, { status });
}

export async function POST(request: Request) {
  await connection();
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "The upload could not be read." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose a CSV or JSON file to add." }, { status: 400 });
  }
  try {
    return NextResponse.json(await acceptUpload(file));
  } catch (error) {
    return failure(error);
  }
}
