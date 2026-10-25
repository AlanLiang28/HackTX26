import { api } from "./classroom";

// PDFs are read by the server (Gemini), so every upload ends up as plain text.
const pdfText = async (file: File) =>
  (
    await api<{ text: string }>("/api/pdf-text", {
      method: "POST",
      headers: { "Content-Type": "application/pdf" },
      body: file,
    })
  ).text;

export async function readStudyFile(file: File): Promise<string> {
  const pdf = /\.pdf$/i.test(file.name);
  if (!pdf && !/\.(txt|md)$/i.test(file.name)) {
    throw new Error(
      "Choose a PDF, TXT or Markdown file. For slides, paste the text instead.",
    );
  }
  const maxMb = pdf ? 10 : 1;
  if (file.size > maxMb * 1024 * 1024) {
    throw new Error(`Choose a file under ${maxMb} MB, or paste a shorter excerpt.`);
  }
  const content = pdf ? await pdfText(file) : await file.text();
  if (!content.trim()) {
    throw new Error(
      "That file is empty. Choose another file or paste your notes.",
    );
  }
  if (content.length > 20000) {
    throw new Error(
      pdf
        ? "That PDF has more than 20,000 characters of text. Upload fewer pages, or paste an excerpt."
        : "Choose a shorter excerpt, up to 20,000 characters.",
    );
  }
  return content;
}
