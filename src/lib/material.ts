export async function readStudyFile(file: File): Promise<string> {
  if (!/\.(txt|md)$/i.test(file.name)) {
    throw new Error(
      "Choose a TXT or Markdown file. For PDFs or slides, paste the text instead.",
    );
  }
  if (file.size > 1024 * 1024) {
    throw new Error("Choose a file under 1 MB, or paste a shorter excerpt.");
  }
  const content = await file.text();
  if (!content.trim()) {
    throw new Error(
      "That file is empty. Choose another file or paste your notes.",
    );
  }
  if (content.length > 20000) {
    throw new Error("Choose a shorter excerpt, up to 20,000 characters.");
  }
  return content;
}
