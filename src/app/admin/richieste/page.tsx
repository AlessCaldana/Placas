import { redirect } from "next/navigation";

// "Richieste" was replaced by "Spedizioni"; old links and bookmarks keep working.
export default function Page() {
  redirect("/admin/spedizioni");
}
